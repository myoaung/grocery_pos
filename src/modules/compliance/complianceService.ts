import type { RequestContext } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ScaleGuardService } from "../../services/scaleGuardService";
import { ServiceError } from "../../utils/errors";

interface ComplianceExportInput {
  from?: string;
  to?: string;
  category?: "AUDIT" | "SECURITY" | "COMPLIANCE";
}

interface LegalHoldCreateInput {
  scope: "TENANT" | "BRANCH";
  branchId?: string;
  reason: string;
  referenceId?: string;
}

export class ComplianceService {
  private readonly scale: ScaleGuardService;

  constructor(private readonly store: MemoryStore) {
    this.scale = new ScaleGuardService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "phase7_compliance_exports")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Phase 7 compliance exports are disabled for this tenant", 409);
  }

  private assertHoldWriteRole(ctx: RequestContext): void {
    if (!["APPLICATION_OWNER", "TENANT_OWNER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Legal hold write requires owner role", 403);
    }
  }

  private inRange(dateIso: string, input: ComplianceExportInput): boolean {
    const token = dateIso.slice(0, 10);
    if (input.from && token < input.from) {
      return false;
    }
    if (input.to && token > input.to) {
      return false;
    }
    return true;
  }

  private legalHoldActive(tenantId: string, branchId: string) {
    return this.store.legalHolds.some(
      (item) =>
        item.tenantId === tenantId &&
        item.active &&
        (item.scope === "TENANT" || (item.scope === "BRANCH" && item.branchId === branchId)),
    );
  }

  private retentionDays(tenantId: string, category: "AUDIT" | "SECURITY" | "COMPLIANCE"): number {
    const policy = this.store.getRetentionPolicy(tenantId);
    if (category === "AUDIT") {
      return policy.auditDays;
    }
    if (category === "SECURITY") {
      return policy.securityEventDays;
    }
    return policy.complianceEventDays;
  }

  private expiresAt(createdAt: string, days: number): string {
    const createdMs = Date.parse(createdAt);
    const expiresMs = createdMs + days * 24 * 60 * 60 * 1000;
    return new Date(expiresMs).toISOString();
  }

  exportRows(ctx: RequestContext, tenantId: string, input: ComplianceExportInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    const cacheKey = `phase7:compliance:exports:${tenantId}:${ctx.branchId}:${input.from ?? "none"}:${input.to ?? "none"}:${input.category ?? "all"}`;
    const read = this.scale.readWithTenantHint({
      tenantId,
      branchId: ctx.branchId,
      cacheKey,
      ttlMs: 8000,
      preferReplica: true,
      hint: "EXPORT",
      load: () => {
        const rows: Array<Record<string, string | number | boolean | null>> = [];
        if (!input.category || input.category === "AUDIT") {
          for (const item of this.store.auditLogs) {
            if (item.tenantId !== tenantId || !this.inRange(item.createdAt, input)) {
              continue;
            }
            rows.push({
              tenant_id: item.tenantId,
              branch_id: item.branchId,
              category: "AUDIT",
              event_id: item.auditLogId,
              action_type: item.actionType,
              severity: item.severity,
              decision: item.decision,
              reason: item.reason,
              actor_user_id: item.actorUserId,
              created_at: item.createdAt,
              legal_hold_active: this.legalHoldActive(item.tenantId, item.branchId),
              retention_days: this.retentionDays(item.tenantId, "AUDIT"),
              retention_expires_at: this.expiresAt(item.createdAt, this.retentionDays(item.tenantId, "AUDIT")),
              immutable_record: true,
            });
          }
        }

        if (!input.category || input.category === "SECURITY") {
          for (const item of this.store.securityEvents) {
            if (item.tenantId !== tenantId || !this.inRange(item.createdAt, input)) {
              continue;
            }
            rows.push({
              tenant_id: item.tenantId,
              branch_id: item.branchId,
              category: "SECURITY",
              event_id: item.securityEventId,
              action_type: item.category,
              severity: item.severity,
              decision: item.mode,
              reason: item.message,
              actor_user_id: item.actorUserId,
              created_at: item.createdAt,
              legal_hold_active: this.legalHoldActive(item.tenantId, item.branchId),
              retention_days: this.retentionDays(item.tenantId, "SECURITY"),
              retention_expires_at: this.expiresAt(item.createdAt, this.retentionDays(item.tenantId, "SECURITY")),
              immutable_record: true,
            });
          }
        }

        if (!input.category || input.category === "COMPLIANCE") {
          for (const item of this.store.complianceEvents) {
            if (item.tenantId !== tenantId || !this.inRange(item.createdAt, input)) {
              continue;
            }
            rows.push({
              tenant_id: item.tenantId,
              branch_id: item.branchId,
              category: "COMPLIANCE",
              event_id: item.complianceEventId,
              action_type: item.action,
              severity: item.mode === "BLOCK" ? "CRITICAL" : item.mode === "READ_ONLY" ? "WARN" : "INFO",
              decision: item.decision,
              reason: item.message,
              actor_user_id: item.actorUserId,
              created_at: item.createdAt,
              legal_hold_active: this.legalHoldActive(item.tenantId, item.branchId),
              retention_days: this.retentionDays(item.tenantId, "COMPLIANCE"),
              retention_expires_at: this.expiresAt(item.createdAt, this.retentionDays(item.tenantId, "COMPLIANCE")),
              immutable_record: true,
            });
          }
        }

        return rows.sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
      },
    });

    return {
      tenantId,
      generatedAt: this.store.nowIso(),
      readSource: read.readSource,
      cacheHit: read.cacheHit,
      rows: read.value,
    };
  }

  retentionView(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    const policy = this.store.getRetentionPolicy(tenantId);
    const activeHolds = this.store.legalHolds.filter((item) => item.tenantId === tenantId && item.active);
    return {
      tenantId,
      generatedAt: this.store.nowIso(),
      appendOnlyContract: true,
      retention: policy,
      legalHold: {
        activeCount: activeHolds.length,
        activeScopes: [...new Set(activeHolds.map((item) => item.scope))],
      },
    };
  }

  listLegalHolds(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    return this.store.legalHolds
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  createLegalHold(ctx: RequestContext, tenantId: string, input: LegalHoldCreateInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertHoldWriteRole(ctx);
    if (input.scope === "BRANCH") {
      const branchId = input.branchId ?? ctx.branchId;
      const exists = this.store.branches.some((item) => item.tenantId === tenantId && item.branchId === branchId);
      if (!exists) {
        throw new ServiceError("INVALID_BRANCH_SCOPE", "Branch is not valid for tenant", 400);
      }
    }

    const hold = this.store.upsertLegalHold({
      tenantId,
      branchId: input.scope === "TENANT" ? "ALL" : input.branchId ?? ctx.branchId,
      scope: input.scope,
      reason: input.reason,
      referenceId: input.referenceId,
      active: true,
      createdBy: ctx.userId,
    });

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/compliance/legal-holds",
      method: "POST",
      decision: "ALLOW",
      reason: `LEGAL_HOLD_CREATED:${hold.holdId}:${hold.scope}`,
      actionType: "LEGAL_HOLD_CONTROL",
    });

    return hold;
  }

  releaseLegalHold(ctx: RequestContext, tenantId: string, holdId: string, note: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertHoldWriteRole(ctx);
    const existing = this.store.legalHolds.find((item) => item.tenantId === tenantId && item.holdId === holdId);
    if (!existing) {
      throw new ServiceError("LEGAL_HOLD_NOT_FOUND", "Legal hold not found", 404);
    }
    const updated = this.store.upsertLegalHold({
      ...existing,
      holdId,
      active: false,
      releasedBy: ctx.userId,
      releasedAt: this.store.nowIso(),
      releaseNote: note,
    });

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/compliance/legal-holds/:holdId/release",
      method: "PATCH",
      decision: "ALLOW",
      reason: `LEGAL_HOLD_RELEASED:${holdId}`,
      actionType: "LEGAL_HOLD_CONTROL",
    });

    return updated;
  }
}
