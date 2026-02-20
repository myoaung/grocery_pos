import type { MemoryStore } from "../store/memoryStore";
import type { FeatureFlagKey, RequestContext } from "../types";
import { ServiceError } from "../utils/errors";

export class FeatureFlagService {
  constructor(private readonly store: MemoryStore) {}

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertFlagWriteRole(ctx: RequestContext): void {
    if (!["APPLICATION_OWNER", "TENANT_OWNER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Feature flag management requires owner role", 403);
    }
  }

  isEnabled(tenantId: string, key: FeatureFlagKey): boolean {
    return this.store.getFeatureFlag(tenantId, key);
  }

  list(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return {
      tenantId,
      flags: {
        advanced_discounts: this.store.getFeatureFlag(tenantId, "advanced_discounts"),
        loyalty_rules: this.store.getFeatureFlag(tenantId, "loyalty_rules"),
        risk_enforcement: this.store.getFeatureFlag(tenantId, "risk_enforcement"),
        analytics_expansion: this.store.getFeatureFlag(tenantId, "analytics_expansion"),
        external_audit_exports: this.store.getFeatureFlag(tenantId, "external_audit_exports"),
        data_retention_policies: this.store.getFeatureFlag(tenantId, "data_retention_policies"),
        webhook_outbound: this.store.getFeatureFlag(tenantId, "webhook_outbound"),
        background_aggregation: this.store.getFeatureFlag(tenantId, "background_aggregation"),
        scale_reads: this.store.getFeatureFlag(tenantId, "scale_reads"),
        phase7_observability: this.store.getFeatureFlag(tenantId, "phase7_observability"),
        phase7_predictive: this.store.getFeatureFlag(tenantId, "phase7_predictive"),
        phase7_integration_control: this.store.getFeatureFlag(tenantId, "phase7_integration_control"),
        phase7_compliance_exports: this.store.getFeatureFlag(tenantId, "phase7_compliance_exports"),
        phase7_scale_guard: this.store.getFeatureFlag(tenantId, "phase7_scale_guard"),
        phase8_predictive_actions: this.store.getFeatureFlag(tenantId, "phase8_predictive_actions"),
        phase8_ops_enhancements: this.store.getFeatureFlag(tenantId, "phase8_ops_enhancements"),
      },
    };
  }

  update(ctx: RequestContext, tenantId: string, key: FeatureFlagKey, enabled: boolean) {
    this.assertTenantScope(ctx, tenantId);
    this.assertFlagWriteRole(ctx);
    const flags = this.store.setFeatureFlag(tenantId, key, enabled);

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/feature-flags/:flagKey",
      method: "PATCH",
      decision: "ALLOW",
      reason: `FEATURE_FLAG_UPDATE:${key}:${enabled ? "ON" : "OFF"}`,
      actionType: "FEATURE_FLAG_UPDATE",
    });

    return {
      tenantId,
      flagKey: key,
      enabled,
      flags,
    };
  }
}
