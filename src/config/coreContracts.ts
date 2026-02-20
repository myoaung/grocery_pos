import type { FeatureFlagKey, Role } from "../types";

export const CORE_CONTRACT_VERSION = "P6_LOCKED_2026-02-20" as const;

export const CORE_ROLES = Object.freeze([
  "APPLICATION_OWNER",
  "TENANT_OWNER",
  "MANAGER",
  "CASHIER",
  "INVENTORY_STAFF",
] as const satisfies readonly Role[]);

export const CORE_FEATURE_FLAGS = Object.freeze([
  "advanced_discounts",
  "loyalty_rules",
  "risk_enforcement",
  "analytics_expansion",
  "external_audit_exports",
  "data_retention_policies",
  "webhook_outbound",
  "background_aggregation",
  "scale_reads",
  "phase7_observability",
  "phase7_predictive",
  "phase7_integration_control",
  "phase7_compliance_exports",
  "phase7_scale_guard",
] as const satisfies readonly FeatureFlagKey[]);

export const SYSTEM_JOB_ACTOR = Object.freeze({
  userId: "system:background-job",
  role: "APPLICATION_OWNER" as Role,
});

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function assertCoreTypeContractsLocked(): void {
  if (!Object.isFrozen(CORE_ROLES) || !Object.isFrozen(CORE_FEATURE_FLAGS) || !Object.isFrozen(SYSTEM_JOB_ACTOR)) {
    throw new Error("Core type contracts must remain frozen.");
  }
  if (!hasUniqueValues(CORE_ROLES)) {
    throw new Error("Core role contract has duplicate values.");
  }
  if (!hasUniqueValues(CORE_FEATURE_FLAGS)) {
    throw new Error("Core feature-flag contract has duplicate values.");
  }
  if (!CORE_FEATURE_FLAGS.includes("advanced_discounts") || !CORE_FEATURE_FLAGS.includes("scale_reads")) {
    throw new Error("Core feature-flag contract drift detected.");
  }
  if (!String(CORE_CONTRACT_VERSION).startsWith("P6_LOCKED_")) {
    throw new Error("Core contract version must be locked for post-Phase 6 hardening.");
  }
}
