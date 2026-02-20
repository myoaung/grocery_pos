import { randomUUID } from "crypto";
import type { MemoryStore } from "../../store/memoryStore";
import type { RequestContext, RiskMode } from "../../types";
import { ServiceError } from "../../utils/errors";
import { AuditService } from "../../services/auditService";
import { FeatureFlagService } from "../../services/featureFlagService";

interface PolicyInput {
  policyId?: string;
  branchId?: string;
  policyName: string;
  scope: "TENANT" | "BRANCH";
  mode: "WARN" | "READ_ONLY" | "BLOCK";
  enabled?: boolean;
  conditions: {
    vpnDetected?: boolean;
    restrictedLocation?: boolean;
    untrustedDevice?: boolean;
  };
}

interface EvaluateInput {
  branchId?: string;
  endpoint: string;
  action: "READ" | "WRITE";
  vpnDetected?: boolean;
  restrictedLocation?: boolean;
  untrustedDevice?: boolean;
}

interface IncidentSimulationInput {
  branchId?: string;
  endpoint: string;
  summary?: string;
}

const modeRank: Record<RiskMode, number> = {
  ALLOW: 0,
  WARN: 1,
  READ_ONLY: 2,
  BLOCK: 3,
};

export class RiskComplianceService {
  private readonly audits: AuditService;
  private readonly featureFlags: FeatureFlagService;

  constructor(private readonly store: MemoryStore) {
    this.audits = new AuditService(store);
    this.featureFlags = new FeatureFlagService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertPolicyWriteRole(ctx: RequestContext): void {
    if (!["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Policy management requires manager/owner role", 403);
    }
  }

  private assertAtLeastOneConditionTrue(input: PolicyInput): void {
    const { vpnDetected, restrictedLocation, untrustedDevice } = input.conditions;
    if (!vpnDetected && !restrictedLocation && !untrustedDevice) {
      throw new ServiceError(
        "INVALID_POLICY_CONDITIONS",
        "At least one condition must be true for a risk policy",
        400,
      );
    }
  }

  private classifySeverity(mode: RiskMode, factors: string[]): "INFO" | "WARN" | "CRITICAL" {
    if (mode === "READ_ONLY" || mode === "BLOCK") {
      return "CRITICAL";
    }
    if (mode === "WARN" || factors.length > 0) {
      return "WARN";
    }
    return "INFO";
  }

  listPolicies(ctx: RequestContext, tenantId: string, branchId?: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.riskCompliancePolicies.filter((item) => {
      if (item.tenantId !== tenantId) {
        return false;
      }
      if (!branchId) {
        return true;
      }
      return item.scope === "TENANT" || item.branchId === branchId;
    });
  }

  listIncidentLifecycle(ctx: RequestContext, tenantId: string, incidentId?: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.incidentLifecycleEvents
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => (incidentId ? item.incidentId === incidentId : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  simulateCriticalIncident(ctx: RequestContext, tenantId: string, input: IncidentSimulationInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertPolicyWriteRole(ctx);
    const branchId = input.branchId ?? ctx.branchId;
    const incidentId = randomUUID();
    const lifecycleSummary = input.summary ?? "Simulated CRITICAL incident for operational readiness.";

    const detect = this.store.addIncidentLifecycleEvent({
      incidentId,
      tenantId,
      branchId,
      stage: "DETECT",
      severity: "CRITICAL",
      actorUserId: ctx.userId,
      detail: `${lifecycleSummary} Stage=DETECT`,
    });
    this.audits.append({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/risk-compliance/incidents/simulate-critical",
      method: "POST",
      decision: "ALLOW",
      reason: `INCIDENT_LIFECYCLE_DETECT:${incidentId}`,
      actionType: "INCIDENT_LIFECYCLE",
    });

    const classify = this.store.addIncidentLifecycleEvent({
      incidentId,
      tenantId,
      branchId,
      stage: "CLASSIFY",
      severity: "CRITICAL",
      actorUserId: ctx.userId,
      detail: "Classified as CRITICAL due to simulated risk lock condition.",
    });
    this.store.addSecurityEvent({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: input.endpoint,
      action: "SYSTEM",
      category: "COMPLIANCE",
      severity: "CRITICAL",
      mode: "BLOCK",
      message: `Incident ${incidentId} classified as CRITICAL`,
      factors: ["INCIDENT_SIMULATION"],
      source: "SYSTEM",
    });
    this.audits.append({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/risk-compliance/incidents/simulate-critical",
      method: "POST",
      decision: "ALLOW",
      reason: `INCIDENT_LIFECYCLE_CLASSIFY_CRITICAL:${incidentId}`,
      actionType: "INCIDENT_LIFECYCLE",
    });

    const respond = this.store.addIncidentLifecycleEvent({
      incidentId,
      tenantId,
      branchId,
      stage: "RESPOND",
      severity: "CRITICAL",
      actorUserId: ctx.userId,
      detail: "Containment applied: BLOCK mode and escalation alert.",
    });
    this.store.addComplianceEvent({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      mode: "BLOCK",
      decision: "DENY",
      action: "WRITE",
      endpoint: input.endpoint,
      message: `Incident ${incidentId} response applied`,
      factors: ["INCIDENT_SIMULATION", "CONTAINMENT"],
      source: "MANUAL_EVAL",
    });
    this.store.addOfflineAlert({
      tenantId,
      branchId,
      category: "RISK",
      severity: "BLOCK",
      message: `Incident ${incidentId} containment active.`,
      source: "INCIDENT_SIMULATION",
      acknowledged: false,
    });
    this.audits.append({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/risk-compliance/incidents/simulate-critical",
      method: "POST",
      decision: "ALLOW",
      reason: `INCIDENT_LIFECYCLE_RESPOND:${incidentId}`,
      actionType: "INCIDENT_LIFECYCLE",
    });

    const resolve = this.store.addIncidentLifecycleEvent({
      incidentId,
      tenantId,
      branchId,
      stage: "RESOLVE",
      severity: "CRITICAL",
      actorUserId: ctx.userId,
      detail: "Containment lifted and incident marked resolved with evidence.",
    });
    this.store.addComplianceEvent({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      mode: "WARN",
      decision: "ALLOW",
      action: "READ",
      endpoint: input.endpoint,
      message: `Incident ${incidentId} resolved`,
      factors: ["INCIDENT_SIMULATION", "RESOLVED"],
      source: "MANUAL_EVAL",
    });
    this.audits.append({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/risk-compliance/incidents/simulate-critical",
      method: "POST",
      decision: "ALLOW",
      reason: `INCIDENT_LIFECYCLE_RESOLVE:${incidentId}`,
      actionType: "INCIDENT_LIFECYCLE",
    });

    this.store.addStructuredMetric({
      metricName: "incident_critical_lifecycle_count",
      metricUnit: "count",
      metricValue: 1,
      tenantId,
      branchId,
      tags: {
        incidentId,
        stages: "4",
      },
      source: "SYSTEM",
    });

    return {
      incidentId,
      tenantId,
      branchId,
      lifecycle: [detect, classify, respond, resolve],
    };
  }

  upsertPolicy(ctx: RequestContext, tenantId: string, input: PolicyInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertPolicyWriteRole(ctx);
    this.assertAtLeastOneConditionTrue(input);

    const branchId = input.scope === "BRANCH" ? input.branchId ?? ctx.branchId : ctx.branchId;
    const branchExists = this.store.branches.some((item) => item.tenantId === tenantId && item.branchId === branchId);
    if (!branchExists) {
      throw new ServiceError("INVALID_BRANCH_SCOPE", "Branch is not valid for tenant", 400);
    }

    const item = this.store.upsertRiskCompliancePolicy({
      policyId: input.policyId,
      tenantId,
      branchId,
      policyName: input.policyName,
      scope: input.scope,
      mode: input.mode,
      enabled: input.enabled ?? true,
      conditions: {
        vpnDetected: Boolean(input.conditions.vpnDetected),
        restrictedLocation: Boolean(input.conditions.restrictedLocation),
        untrustedDevice: Boolean(input.conditions.untrustedDevice),
      },
      createdBy: ctx.userId,
    });

    this.audits.append({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/risk-compliance/policies",
      method: "POST",
      decision: "ALLOW",
      reason: `RISK_POLICY_UPSERT_${item.mode}`,
      actionType: "RISK_POLICY_UPSERT",
    });

    return item;
  }

  evaluate(ctx: RequestContext, tenantId: string, input: EvaluateInput) {
    this.assertTenantScope(ctx, tenantId);
    const branchId = input.branchId ?? ctx.branchId;
    const riskEnforcementEnabled = this.featureFlags.isEnabled(tenantId, "risk_enforcement");
    if (!riskEnforcementEnabled) {
      const message = "Risk enforcement disabled by tenant feature flag.";
      this.store.addSecurityEvent({
        tenantId,
        branchId,
        actorUserId: ctx.userId,
        roleAtTime: ctx.role,
        endpoint: input.endpoint,
        action: input.action,
        category: "RISK_POLICY",
        severity: "INFO",
        mode: "ALLOW",
        message,
        factors: [],
        source: "RISK_ENGINE",
      });
      this.audits.append({
        tenantId,
        branchId,
        actorUserId: ctx.userId,
        roleAtTime: ctx.role,
        endpoint: "/api/v1/tenants/:tenantId/risk-compliance/evaluate",
        method: "POST",
        decision: "ALLOW",
        reason: "RISK_ENFORCEMENT_DISABLED_BY_FLAG",
        actionType: "RISK_COMPLIANCE_EVALUATE",
      });
      return {
        statusCode: 200,
        allowed: true,
        mode: "ALLOW" as const,
        matchedPolicyIds: [] as string[],
        message,
        factors: [] as string[],
        branchId,
        endpoint: input.endpoint,
        action: input.action,
      };
    }

    const factors = {
      vpnDetected: Boolean(input.vpnDetected),
      restrictedLocation: Boolean(input.restrictedLocation),
      untrustedDevice: Boolean(input.untrustedDevice),
    };

    const matched = this.store.riskCompliancePolicies
      .filter((item) => item.tenantId === tenantId && item.enabled)
      .filter((item) => (item.scope === "TENANT" ? true : item.branchId === branchId))
      .filter((item) => {
        const checks: boolean[] = [];
        if (item.conditions.vpnDetected) {
          checks.push(factors.vpnDetected);
        }
        if (item.conditions.restrictedLocation) {
          checks.push(factors.restrictedLocation);
        }
        if (item.conditions.untrustedDevice) {
          checks.push(factors.untrustedDevice);
        }
        return checks.length > 0 && checks.every(Boolean);
      });

    let mode: RiskMode = "ALLOW";
    for (const item of matched) {
      if (modeRank[item.mode] > modeRank[mode]) {
        mode = item.mode;
      }
    }

    const matchedIds = matched.map((item) => item.policyId);

    let allowed = true;
    let statusCode = 200;
    let decision: "ALLOW" | "DENY" = "ALLOW";
    let message = "No policy matched. Session remains ALLOW.";

    if (mode === "WARN") {
      message = "WARN mode matched. Operation allowed with user alert.";
    }

    if (mode === "READ_ONLY") {
      if (input.action === "WRITE") {
        allowed = false;
        decision = "DENY";
        statusCode = 409;
        message = "READ_ONLY mode matched. Write action denied.";
      } else {
        message = "READ_ONLY mode matched. Read action allowed.";
      }
    }

    if (mode === "BLOCK") {
      allowed = false;
      decision = "DENY";
      statusCode = 403;
      message = "BLOCK mode matched. Operation denied.";
    }

    const factorList = Object.entries(factors)
      .filter(([, value]) => value)
      .map(([key]) => key.toUpperCase());

    this.store.addComplianceEvent({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      mode,
      decision,
      action: input.action,
      endpoint: input.endpoint,
      message,
      factors: factorList,
      source: "MANUAL_EVAL",
    });

    this.audits.append({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/risk-compliance/evaluate",
      method: "POST",
      decision,
      reason: `RISK_COMPLIANCE_${mode}`,
      actionType: "RISK_COMPLIANCE_EVALUATE",
    });

    this.store.addSecurityEvent({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: input.endpoint,
      action: input.action,
      category: "RISK_POLICY",
      severity: this.classifySeverity(mode, factorList),
      mode,
      message,
      factors: factorList,
      source: "RISK_ENGINE",
    });

    return {
      statusCode,
      allowed,
      mode,
      matchedPolicyIds: matchedIds,
      message,
      factors: factorList,
      branchId,
      endpoint: input.endpoint,
      action: input.action,
    };
  }

  listEvents(ctx: RequestContext, tenantId: string, branchId?: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.complianceEvents
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => (branchId ? item.branchId === branchId : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  listSecurityEvents(
    ctx: RequestContext,
    tenantId: string,
    branchId?: string,
    severity?: "INFO" | "WARN" | "CRITICAL",
  ) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.securityEvents
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => (branchId ? item.branchId === branchId : true))
      .filter((item) => (severity ? item.severity === severity : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
