import type { RequestContext, RetentionPolicy } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";
import { ScaleGuardService } from "../../services/scaleGuardService";

interface AuditExportInput {
  from?: string;
  to?: string;
}

interface RetentionUpdateInput {
  auditDays: number;
  securityEventDays: number;
  complianceEventDays: number;
  metricDays: number;
}

export class ExportsService {
  private readonly scale: ScaleGuardService;

  constructor(private readonly store: MemoryStore) {
    this.scale = new ScaleGuardService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertAuditExportEnabled(tenantId: string): void {
    if (!this.store.getFeatureFlag(tenantId, "external_audit_exports")) {
      throw new ServiceError("FEATURE_FLAG_DISABLED", "External audit export is disabled for this tenant", 409);
    }
  }

  private assertRetentionEnabled(tenantId: string): void {
    if (!this.store.getFeatureFlag(tenantId, "data_retention_policies")) {
      throw new ServiceError("FEATURE_FLAG_DISABLED", "Data retention policy management is disabled for this tenant", 409);
    }
  }

  private inRange(value: string, input: AuditExportInput): boolean {
    const token = value.slice(0, 10);
    if (input.from && token < input.from) {
      return false;
    }
    if (input.to && token > input.to) {
      return false;
    }
    return true;
  }

  exportAudit(ctx: RequestContext, tenantId: string, input: AuditExportInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertAuditExportEnabled(tenantId);

    const cacheKey = `exports:audit:${tenantId}:${ctx.branchId}:${input.from ?? "none"}:${input.to ?? "none"}:${ctx.role}`;
    const read = this.scale.readWithCache({
      tenantId,
      branchId: ctx.branchId,
      cacheKey,
      ttlMs: 5000,
      preferReplica: true,
      load: () =>
        this.store.auditLogs
          .filter((item) => item.tenantId === tenantId)
          .filter((item) => this.inRange(item.createdAt, input))
          .map((item) => ({
            tenant_id: item.tenantId,
            branch_id: item.branchId,
            actor_user_id: item.actorUserId,
            role_at_time: item.roleAtTime,
            endpoint: item.endpoint,
            method: item.method,
            decision: item.decision,
            reason: item.reason,
            action_type: item.actionType,
            severity: item.severity,
            sequence: item.sequence,
            entry_hash: item.entryHash,
            previous_hash: item.previousHash,
            external_anchor_ref: item.externalAnchorRef,
            created_at: item.createdAt,
          })),
    });

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/exports/audit",
      method: "GET",
      decision: "ALLOW",
      reason: `AUDIT_EXPORT_READ:${read.readSource}:${read.cacheHit ? "HIT" : "MISS"}`,
      actionType: "AUDIT_EXPORT_READ",
    });

    return {
      generatedAt: this.store.nowIso(),
      readSource: read.readSource,
      cacheHit: read.cacheHit,
      rows: read.value,
    };
  }

  getRetentionPolicy(ctx: RequestContext, tenantId: string): RetentionPolicy {
    this.assertTenantScope(ctx, tenantId);
    this.assertRetentionEnabled(tenantId);
    return this.store.getRetentionPolicy(tenantId);
  }

  updateRetentionPolicy(ctx: RequestContext, tenantId: string, input: RetentionUpdateInput): RetentionPolicy {
    this.assertTenantScope(ctx, tenantId);
    this.assertRetentionEnabled(tenantId);
    const values = [input.auditDays, input.securityEventDays, input.complianceEventDays, input.metricDays];
    if (values.some((item) => !Number.isInteger(item) || item < 30 || item > 3650)) {
      throw new ServiceError("INVALID_RETENTION_POLICY", "Retention values must be integers between 30 and 3650 days", 400);
    }

    const record = this.store.setRetentionPolicy({
      tenantId,
      auditDays: input.auditDays,
      securityEventDays: input.securityEventDays,
      complianceEventDays: input.complianceEventDays,
      metricDays: input.metricDays,
      updatedBy: ctx.userId,
    });

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/exports/retention-policy",
      method: "PATCH",
      decision: "ALLOW",
      reason: `RETENTION_POLICY_UPDATE:${record.auditDays}/${record.securityEventDays}/${record.complianceEventDays}/${record.metricDays}`,
      actionType: "RETENTION_POLICY_UPDATE",
    });

    return record;
  }
}

