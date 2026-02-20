import type { ReportId, Role } from "../types";

export type PermissionAction =
  | "tenant.read"
  | "tenant.write"
  | "branch.read"
  | "branch.write"
  | "user.read"
  | "user.write"
  | "dashboard.read"
  | "brand.write"
  | "plugin.read"
  | "plugin.write"
  | "plugin.execute"
  | "offline.automation.run"
  | "offline.alert.read"
  | "offline.alert.ack"
  | "offline.enhanced.queue"
  | "offline.enhanced.read"
  | "offline.enhanced.sync"
  | "notification.read"
  | "notification.trigger"
  | "notification.manage"
  | "product.read"
  | "product.write"
  | "inventory.read"
  | "inventory.mutate"
  | "sales.read"
  | "sales.checkout"
  | "sales.void"
  | "discount.evaluate"
  | "discount.override"
  | "discount.advanced.read"
  | "discount.advanced.apply"
  | "customer.read"
  | "customer.write"
  | "loyalty.read"
  | "loyalty.accrue"
  | "loyalty.redeem"
  | "loyalty.rule.manage"
  | "loyalty.history.read"
  | "conflict.view"
  | "conflict.resolve"
  | "conflict.escalate"
  | "queue.view"
  | "queue.enqueue"
  | "queue.sync"
  | "risk.read"
  | "risk.policy.read"
  | "risk.policy.write"
  | "risk.compliance.evaluate"
  | "risk.compliance.events"
  | "risk.security.events"
  | "feature.flag.read"
  | "feature.flag.write"
  | "report.tenant"
  | "report.owner"
  | "report.export"
  | "report.extended.read"
  | "report.extended.export"
  | "report.multi_store.read"
  | "report.multi_store.export"
  | "audit.read"
  | "analytics.read"
  | "analytics.export"
  | "predictive.read"
  | "predictive.export"
  | "ops.dashboard.read"
  | "integration.client.read"
  | "integration.client.write"
  | "integration.client.token.verify"
  | "compliance.export.read"
  | "legal.hold.read"
  | "legal.hold.write"
  | "scale.guard.read"
  | "sla.read"
  | "exports.audit.read"
  | "exports.retention.read"
  | "exports.retention.write"
  | "webhook.read"
  | "webhook.write"
  | "webhook.dispatch"
  | "aggregation.job.read"
  | "aggregation.job.run"
  | "scale.cache.evict";

const permissions: Record<PermissionAction, Role[]> = {
  "tenant.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "tenant.write": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "branch.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "branch.write": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "user.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "user.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "dashboard.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "brand.write": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "plugin.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "plugin.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "plugin.execute": ["APPLICATION_OWNER", "MANAGER", "CASHIER"],
  "offline.automation.run": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "offline.alert.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "offline.alert.ack": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "offline.enhanced.queue": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "offline.enhanced.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "offline.enhanced.sync": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "notification.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "notification.trigger": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "notification.manage": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "product.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "product.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "inventory.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "inventory.mutate": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "sales.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER"],
  "sales.checkout": ["MANAGER", "CASHIER"],
  "sales.void": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "discount.evaluate": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "discount.override": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "discount.advanced.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER"],
  "discount.advanced.apply": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER"],
  "customer.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "customer.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER"],
  "loyalty.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER"],
  "loyalty.accrue": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "loyalty.redeem": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "loyalty.rule.manage": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "loyalty.history.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER"],
  "conflict.view": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "conflict.resolve": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "conflict.escalate": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "queue.view": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "queue.enqueue": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "queue.sync": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "risk.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "risk.policy.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "risk.policy.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "risk.compliance.evaluate": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "risk.compliance.events": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "risk.security.events": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "feature.flag.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "feature.flag.write": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "report.tenant": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "report.owner": ["APPLICATION_OWNER"],
  "report.export": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "report.extended.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "report.extended.export": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
  "report.multi_store.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "report.multi_store.export": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "audit.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "analytics.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "analytics.export": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "predictive.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "predictive.export": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "ops.dashboard.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
  "integration.client.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "integration.client.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "integration.client.token.verify": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "compliance.export.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "legal.hold.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "legal.hold.write": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "scale.guard.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "sla.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "exports.audit.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "exports.retention.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "exports.retention.write": ["APPLICATION_OWNER", "TENANT_OWNER"],
  "webhook.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "webhook.write": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "webhook.dispatch": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "aggregation.job.read": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "aggregation.job.run": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
  "scale.cache.evict": ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
};

const inventoryOnlyReports = new Set<ReportId>(["REP-T-003", "REP-T-004"]);

export function canPerform(role: Role, action: PermissionAction): boolean {
  return permissions[action].includes(role);
}

export function canAccessTenantReport(role: Role, reportId: ReportId, cashierCanViewProfit = false): boolean {
  if (!["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"].includes(role)) {
    return false;
  }

  if (role === "INVENTORY_STAFF") {
    return inventoryOnlyReports.has(reportId);
  }

  if (role === "CASHIER" && reportId === "REP-T-005" && !cashierCanViewProfit) {
    return false;
  }

  return reportId.startsWith("REP-T-") || reportId.startsWith("REP-A-");
}
