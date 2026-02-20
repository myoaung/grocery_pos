import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type {
  AuditLog,
  BackupRun,
  Branch,
  ComplianceEventLog,
  ConflictRecord,
  Customer,
  DashboardSeriesPoint,
  DiscountEvaluationLog,
  FeatureFlagKey,
  InventoryLog,
  LoyaltyLedgerEntry,
  LoyaltyRewardHistory,
  LoyaltyRewardRule,
  MetricPoint,
  NotificationRecord,
  OfflineAlert,
  OfflineEventLog,
  OfflineQueueItem,
  PluginExecutionLog,
  PluginRegistration,
  Product,
  Role,
  ReportingSnapshot,
  ReportingTemplate,
  RiskCompliancePolicy,
  SecurityEventLog,
  StructuredMetricLog,
  Sale,
  TaxRule,
  TenantProfile,
  TransactionRecord,
  User,
  IncidentLifecycleEvent,
  RetentionPolicy,
  AggregationSnapshot,
  AggregationJob,
  WebhookEndpoint,
  WebhookDelivery,
  IntegrationClient,
  LegalHold,
  PredictiveActionRecord,
} from "../types";
import { inventoryKey } from "../utils/keys";

export interface UserBranchAccess {
  userId: string;
  tenantId: string;
  branchId: string;
}

export class MemoryStore {
  readonly events = new EventEmitter();
  readonly tenants: TenantProfile[];
  readonly branches: Branch[];
  readonly users: User[];
  readonly userBranchAccess: UserBranchAccess[];
  readonly products: Product[];
  readonly inventoryLogs: InventoryLog[] = [];
  private readonly auditLogRecords: Readonly<AuditLog>[] = [];
  readonly sales: Sale[] = [];
  readonly queue: OfflineQueueItem[] = [];
  readonly conflicts: ConflictRecord[] = [];
  readonly transactions: TransactionRecord[] = [];
  readonly customers: Customer[];
  readonly loyaltyLedger: LoyaltyLedgerEntry[] = [];
  readonly taxRules: TaxRule[];
  readonly backupRuns: BackupRun[];
  readonly metrics: MetricPoint[];
  readonly retentionPolicies = new Map<string, RetentionPolicy>();
  readonly dashboardSnapshots = new Map<string, DashboardSeriesPoint[]>();
  readonly aggregationJobs: AggregationJob[] = [];
  readonly aggregationSnapshots: AggregationSnapshot[] = [];
  readonly webhookEndpoints: WebhookEndpoint[] = [];
  readonly webhookDeliveries: WebhookDelivery[] = [];
  readonly webhookDeliveryIdempotency = new Set<string>();
  readonly integrationClients: IntegrationClient[] = [];
  readonly legalHolds: LegalHold[] = [];
  readonly predictiveActions: PredictiveActionRecord[] = [];
  readonly scaleCacheRecords = new Map<
    string,
    {
      key: string;
      tenantId: string;
      branchId: string;
      readSource: "PRIMARY" | "REPLICA";
      value: unknown;
      createdAt: string;
      expiresAt: number;
      hits: number;
      lastAccessedAt: string;
    }
  >();
  readonly pluginRegistrations: PluginRegistration[] = [];
  readonly pluginExecutionLogs: PluginExecutionLog[] = [];
  readonly offlineAlerts: OfflineAlert[] = [];
  readonly notifications: NotificationRecord[] = [];
  readonly loyaltyRewardRules: LoyaltyRewardRule[] = [];
  readonly loyaltyRewardHistory: LoyaltyRewardHistory[] = [];
  readonly reportingTemplates: ReportingTemplate[] = [];
  readonly reportingSnapshots: ReportingSnapshot[] = [];
  readonly offlineEventLogs: OfflineEventLog[] = [];
  readonly discountEvaluations: DiscountEvaluationLog[] = [];
  readonly riskCompliancePolicies: RiskCompliancePolicy[] = [];
  private readonly complianceEventRecords: Readonly<ComplianceEventLog>[] = [];
  private readonly securityEventRecords: Readonly<SecurityEventLog>[] = [];
  private readonly structuredMetricRecords: Readonly<StructuredMetricLog>[] = [];
  private readonly incidentLifecycleRecords: Readonly<IncidentLifecycleEvent>[] = [];
  readonly notificationIdempotency = new Set<string>();
  readonly notificationConnectivity = new Map<string, boolean>();
  readonly appBrand = {
    appName: "Cosmic Forge Grocery POS",
    logoText: "CFGP",
    theme: {
      primary: "#134074",
      accent: "#3b82f6",
      background: "#f8fafc",
    },
  };
  readonly tenantBrands = new Map<
    string,
    {
      tenantName: string;
      logoText: string;
      primary: string;
      accent: string;
    }
  >();
  readonly pricingConfig = new Map<string, { allowManualOverride: boolean; defaultMode: "RETAIL" | "WHOLESALE" }>();
  readonly taxConfig = new Map<string, { strictServerTax: boolean; version: string }>();
  readonly featureFlags = new Map<string, Record<FeatureFlagKey, boolean>>();
  readonly idempotencyKeys = new Set<string>();
  readonly inventoryBalances = new Map<string, number>();
  readonly systemConfig = {
    cashierCanViewProfit: false,
  };

  constructor() {
    this.events.setMaxListeners(200);
    this.tenants = [
      { tenantId: "tenant-a", tenantName: "Tenant A Store", timezone: "Asia/Yangon", currencyCode: "MMK", isActive: true },
      { tenantId: "tenant-b", tenantName: "Tenant B Store", timezone: "Asia/Yangon", currencyCode: "MMK", isActive: true },
    ];

    this.branches = [
      { branchId: "branch-a-1", tenantId: "tenant-a", branchCode: "A1", branchName: "Tenant A Main", isActive: true },
      { branchId: "branch-a-2", tenantId: "tenant-a", branchCode: "A2", branchName: "Tenant A North", isActive: true },
      { branchId: "branch-b-1", tenantId: "tenant-b", branchCode: "B1", branchName: "Tenant B Main", isActive: true },
    ];

    this.users = [
      { userId: "u-ao", tenantId: "tenant-a", branchId: "branch-a-1", role: "APPLICATION_OWNER", email: "ao@cosmicforge.local", isActive: true },
      { userId: "u-to-a", tenantId: "tenant-a", branchId: "branch-a-1", role: "TENANT_OWNER", email: "owner-a@shop.local", isActive: true },
      { userId: "u-mg-a", tenantId: "tenant-a", branchId: "branch-a-1", role: "MANAGER", email: "manager-a@shop.local", isActive: true },
      { userId: "u-ca-a", tenantId: "tenant-a", branchId: "branch-a-1", role: "CASHIER", email: "cashier-a@shop.local", isActive: true },
      { userId: "u-is-a", tenantId: "tenant-a", branchId: "branch-a-1", role: "INVENTORY_STAFF", email: "inventory-a@shop.local", isActive: true },
      { userId: "u-to-b", tenantId: "tenant-b", branchId: "branch-b-1", role: "TENANT_OWNER", email: "owner-b@shop.local", isActive: true },
    ];

    this.userBranchAccess = [
      { userId: "u-ao", tenantId: "tenant-a", branchId: "branch-a-1" },
      { userId: "u-ao", tenantId: "tenant-a", branchId: "branch-a-2" },
      { userId: "u-mg-a", tenantId: "tenant-a", branchId: "branch-a-1" },
      { userId: "u-ca-a", tenantId: "tenant-a", branchId: "branch-a-1" },
      { userId: "u-is-a", tenantId: "tenant-a", branchId: "branch-a-1" },
      { userId: "u-to-a", tenantId: "tenant-a", branchId: "branch-a-1" },
      { userId: "u-to-b", tenantId: "tenant-b", branchId: "branch-b-1" },
    ];

    this.products = [
      {
        productId: "prod-a-001",
        tenantId: "tenant-a",
        sku: "A-APPLE-001",
        barcode: "111111",
        nameMm: "ပန်းသီး",
        nameEn: "Apple",
        category: "Fruits",
        unitType: "pcs",
        costPrice: 500,
        retailPrice: 700,
        wholesalePrice: 650,
        taxCategory: "STANDARD",
        stockAlert: 10,
        updatedAt: this.nowIso(),
      },
      {
        productId: "prod-a-002",
        tenantId: "tenant-a",
        sku: "A-RICE-001",
        barcode: "222222",
        nameMm: "ဆန်",
        nameEn: "Rice",
        category: "Staples",
        unitType: "kg",
        costPrice: 1200,
        retailPrice: 1500,
        wholesalePrice: 1400,
        taxCategory: "STANDARD",
        stockAlert: 20,
        updatedAt: this.nowIso(),
      },
      {
        productId: "prod-b-001",
        tenantId: "tenant-b",
        sku: "B-TEA-001",
        barcode: "333333",
        nameMm: "လက်ဖက်ရည်",
        nameEn: "Tea",
        category: "Drinks",
        unitType: "box",
        costPrice: 2000,
        retailPrice: 2600,
        wholesalePrice: 2400,
        taxCategory: "STANDARD",
        stockAlert: 8,
        updatedAt: this.nowIso(),
      },
    ];

    this.customers = [
      {
        customerId: "cust-a-1",
        tenantId: "tenant-a",
        branchId: "branch-a-1",
        name: "Aung Aung",
        phone: "091111111",
        visitCount: 0,
        totalSpending: 0,
        currentPoints: 0,
        tierName: "STANDARD",
      },
      {
        customerId: "cust-b-1",
        tenantId: "tenant-b",
        branchId: "branch-b-1",
        name: "Su Su",
        phone: "092222222",
        visitCount: 0,
        totalSpending: 0,
        currentPoints: 0,
        tierName: "STANDARD",
      },
    ];

    this.taxRules = [
      {
        taxRuleId: "tax-a-standard",
        tenantId: "tenant-a",
        taxCategory: "STANDARD",
        rate: 0.05,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
      {
        taxRuleId: "tax-b-standard",
        tenantId: "tenant-b",
        taxCategory: "STANDARD",
        rate: 0.04,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
    ];

    this.setStock("tenant-a", "branch-a-1", "prod-a-001", 100);
    this.setStock("tenant-a", "branch-a-1", "prod-a-002", 80);
    this.setStock("tenant-a", "branch-a-2", "prod-a-001", 50);
    this.setStock("tenant-b", "branch-b-1", "prod-b-001", 60);

    this.tenantBrands.set("tenant-a", {
      tenantName: "Tenant A Store",
      logoText: "TA",
      primary: "#1d4ed8",
      accent: "#60a5fa",
    });
    this.tenantBrands.set("tenant-b", {
      tenantName: "Tenant B Store",
      logoText: "TB",
      primary: "#0f766e",
      accent: "#2dd4bf",
    });
    this.pricingConfig.set("tenant-a", { allowManualOverride: true, defaultMode: "RETAIL" });
    this.pricingConfig.set("tenant-b", { allowManualOverride: true, defaultMode: "RETAIL" });
    this.taxConfig.set("tenant-a", { strictServerTax: true, version: "v1" });
    this.taxConfig.set("tenant-b", { strictServerTax: true, version: "v1" });
    this.featureFlags.set("tenant-a", this.defaultFeatureFlags());
    this.featureFlags.set("tenant-b", this.defaultFeatureFlags());
    this.retentionPolicies.set("tenant-a", {
      tenantId: "tenant-a",
      auditDays: 365,
      securityEventDays: 180,
      complianceEventDays: 365,
      metricDays: 90,
      updatedBy: "SYSTEM",
      updatedAt: this.nowIso(),
    });
    this.retentionPolicies.set("tenant-b", {
      tenantId: "tenant-b",
      auditDays: 365,
      securityEventDays: 180,
      complianceEventDays: 365,
      metricDays: 90,
      updatedBy: "SYSTEM",
      updatedAt: this.nowIso(),
    });

    this.loyaltyRewardRules.push(
      {
        tenantId: "tenant-a",
        pointsPerKyat: 0.01,
        redemptionRateKyatPerPoint: 25,
        minRedeemPoints: 100,
      },
      {
        tenantId: "tenant-b",
        pointsPerKyat: 0.01,
        redemptionRateKyatPerPoint: 25,
        minRedeemPoints: 100,
      },
    );

    this.reportingTemplates.push(
      {
        templateId: "REP-X-LOY-001",
        title: "Loyalty Rewards KPI",
        category: "LOYALTY",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
        filters: ["dateFrom", "dateTo", "customerId"],
        exportFormats: ["csv", "pdf", "print"],
      },
      {
        templateId: "REP-X-LOY-002",
        title: "Loyalty Redemption Audit",
        category: "LOYALTY",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
        filters: ["dateFrom", "dateTo", "customerId", "operation"],
        exportFormats: ["csv", "pdf", "print"],
      },
      {
        templateId: "REP-X-OPS-001",
        title: "Offline Queue Health",
        category: "OPERATIONS",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
        filters: ["dateFrom", "dateTo", "eventType", "state"],
        exportFormats: ["csv", "pdf", "print"],
      },
      {
        templateId: "REP-X-OPS-002",
        title: "Conflict Resolution SLA",
        category: "OPERATIONS",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
        filters: ["dateFrom", "dateTo", "status"],
        exportFormats: ["csv", "pdf", "print"],
      },
      {
        templateId: "REP-X-MSR-001",
        title: "Multi-Store Sales Rollup",
        category: "MULTI_STORE",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
        filters: ["dateFrom", "dateTo", "branchId"],
        exportFormats: ["csv", "pdf", "print"],
      },
      {
        templateId: "REP-X-MSR-002",
        title: "Multi-Store Inventory Risk",
        category: "MULTI_STORE",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "INVENTORY_STAFF"],
        filters: ["branchId", "state"],
        exportFormats: ["csv", "pdf", "print"],
      },
      {
        templateId: "REP-X-MSR-003",
        title: "Multi-Store Discount Compliance",
        category: "MULTI_STORE",
        allowedRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"],
        filters: ["dateFrom", "dateTo", "branchId", "role"],
        exportFormats: ["csv", "pdf", "print"],
      },
    );

    this.backupRuns = [
      {
        backupRunId: "backup-a-1",
        tenantId: "tenant-a",
        status: "SUCCESS",
        durationSec: 52,
        createdAt: this.nowIso(),
        restoreTestAt: this.nowIso(),
      },
      {
        backupRunId: "backup-b-1",
        tenantId: "tenant-b",
        status: "SUCCESS",
        durationSec: 47,
        createdAt: this.nowIso(),
      },
    ];

    this.metrics = [
      {
        timestamp: this.nowIso(),
        requestCount: 120,
        errorCount: 2,
        p95LatencyMs: 180,
        uptimePct: 99.9,
        syncBacklogCount: 1,
      },
    ];

    this.dashboardSnapshots.set("tenant-a:branch-a-1:sales", [
      { label: "08:00", value: 8 },
      { label: "10:00", value: 14 },
      { label: "12:00", value: 22 },
      { label: "14:00", value: 19 },
      { label: "16:00", value: 12 },
    ]);

    this.dashboardSnapshots.set("tenant-a:branch-a-1:inventory", [
      { label: "Fruits", value: 110 },
      { label: "Staples", value: 80 },
      { label: "Drinks", value: 0 },
    ]);

    this.dashboardSnapshots.set("tenant-a:branch-a-1:customers", [
      { label: "New", value: 12 },
      { label: "Returning", value: 27 },
      { label: "Loyalty", value: 8 },
    ]);

    this.notificationConnectivity.set("tenant-a:branch-a-1", true);
    this.notificationConnectivity.set("tenant-a:branch-a-2", true);
    this.notificationConnectivity.set("tenant-b:branch-b-1", true);

    this.riskCompliancePolicies.push(
      {
        policyId: "risk-a-branch-readonly",
        tenantId: "tenant-a",
        branchId: "branch-a-1",
        policyName: "Tenant A Branch A1 Restricted Location",
        scope: "BRANCH",
        mode: "READ_ONLY",
        enabled: true,
        conditions: {
          vpnDetected: false,
          restrictedLocation: true,
          untrustedDevice: false,
        },
        createdBy: "u-ao",
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
      },
      {
        policyId: "risk-a-tenant-block",
        tenantId: "tenant-a",
        branchId: "branch-a-1",
        policyName: "Tenant A VPN + Untrusted Device Block",
        scope: "TENANT",
        mode: "BLOCK",
        enabled: true,
        conditions: {
          vpnDetected: true,
          restrictedLocation: false,
          untrustedDevice: true,
        },
        createdBy: "u-ao",
        createdAt: this.nowIso(),
        updatedAt: this.nowIso(),
      },
    );
  }

  get auditLogs(): ReadonlyArray<Readonly<AuditLog>> {
    return this.auditLogRecords.slice();
  }

  get complianceEvents(): ReadonlyArray<Readonly<ComplianceEventLog>> {
    return this.complianceEventRecords.slice();
  }

  get securityEvents(): ReadonlyArray<Readonly<SecurityEventLog>> {
    return this.securityEventRecords.slice();
  }

  get structuredMetrics(): ReadonlyArray<Readonly<StructuredMetricLog>> {
    return this.structuredMetricRecords.slice();
  }

  get incidentLifecycleEvents(): ReadonlyArray<Readonly<IncidentLifecycleEvent>> {
    return this.incidentLifecycleRecords.slice();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  getStock(tenantId: string, branchId: string, productId: string): number {
    return this.inventoryBalances.get(inventoryKey(tenantId, branchId, productId)) ?? 0;
  }

  setStock(tenantId: string, branchId: string, productId: string, value: number): void {
    this.inventoryBalances.set(inventoryKey(tenantId, branchId, productId), value);
  }

  private hashAuditPayload(payload: string): string {
    // Logical checksum chain: lightweight, deterministic, and non-cryptographic.
    let checksum = 0;
    for (let index = 0; index < payload.length; index += 1) {
      checksum = (checksum * 31 + payload.charCodeAt(index)) % 2147483647;
    }
    return checksum.toString(16).padStart(8, "0");
  }

  private classifyAuditSeverity(log: {
    decision: AuditLog["decision"];
    reason: string;
    actionType: string;
  }): AuditLog["severity"] {
    const text = `${log.reason}|${log.actionType}`.toUpperCase();
    if (log.decision === "DENY") {
      if (text.includes("BLOCK") || text.includes("IMMUTABLE")) {
        return "CRITICAL";
      }
      return "WARN";
    }
    if (text.includes("WARN") || text.includes("READ_ONLY")) {
      return "WARN";
    }
    return "INFO";
  }

  addAudit(
    log: Omit<
      AuditLog,
      | "auditLogId"
      | "createdAt"
      | "sequence"
      | "previousHash"
      | "entryHash"
      | "externalAnchorRef"
      | "externalAnchorTimestamp"
      | "externalAnchorCounter"
      | "severity"
    > & {
      severity?: AuditLog["severity"];
    },
  ): AuditLog {
    const startedAt = Date.now();
    const createdAt = this.nowIso();
    const sequence = this.auditLogRecords.length + 1;
    const externalAnchorTimestamp = createdAt;
    const externalAnchorCounter = sequence;
    const externalAnchorRef = `${externalAnchorTimestamp}#${String(externalAnchorCounter).padStart(8, "0")}`;

    const calculatedSeverity = this.classifyAuditSeverity(log);
    const severityRank: Record<AuditLog["severity"], number> = {
      INFO: 1,
      WARN: 2,
      CRITICAL: 3,
    };
    const requestedSeverity = log.severity ?? calculatedSeverity;
    const severity =
      severityRank[requestedSeverity] < severityRank[calculatedSeverity] ? calculatedSeverity : requestedSeverity;

    if (log.severity && severityRank[log.severity] < severityRank[calculatedSeverity]) {
      this.addSecurityEvent({
        tenantId: log.tenantId,
        branchId: log.branchId,
        actorUserId: log.actorUserId,
        roleAtTime: log.roleAtTime,
        endpoint: log.endpoint,
        action: "SYSTEM",
        category: "AUDIT",
        severity: "CRITICAL",
        mode: "ALLOW",
        message: `AUDIT_SEVERITY_DOWNGRADE_DETECTED:${log.severity}->${calculatedSeverity}`,
        factors: ["SEVERITY_DOWNGRADE"],
        source: "SYSTEM",
      });
    }

    const previousHash =
      this.auditLogRecords.length > 0
        ? this.auditLogRecords[this.auditLogRecords.length - 1].entryHash
        : null;
    const entryHash = this.hashAuditPayload(
      JSON.stringify({
        sequence,
        previousHash,
        tenantId: log.tenantId,
        branchId: log.branchId,
        actorUserId: log.actorUserId,
        roleAtTime: log.roleAtTime,
        endpoint: log.endpoint,
        method: log.method,
        decision: log.decision,
        reason: log.reason,
        actionType: log.actionType,
        externalAnchorRef,
        externalAnchorTimestamp,
        externalAnchorCounter,
        severity,
        createdAt,
      }),
    );

    const record = Object.freeze({
      auditLogId: randomUUID(),
      sequence,
      previousHash,
      entryHash,
      externalAnchorRef,
      externalAnchorTimestamp,
      externalAnchorCounter,
      createdAt,
      ...log,
      severity,
    });
    this.auditLogRecords.push(record);
    this.addStructuredMetric({
      metricName: "audit_write_latency_ms",
      metricUnit: "ms",
      metricValue: Date.now() - startedAt,
      tenantId: log.tenantId,
      branchId: log.branchId,
      tags: {
        actionType: log.actionType,
        decision: log.decision,
        severity,
      },
      source: "SERVICE",
    });
    return record as AuditLog;
  }

  addInventoryLog(log: Omit<InventoryLog, "inventoryLogId" | "createdAt">): InventoryLog {
    const record: InventoryLog = {
      inventoryLogId: randomUUID(),
      createdAt: this.nowIso(),
      ...log,
    };
    this.inventoryLogs.push(record);
    return record;
  }

  addOfflineAlert(alert: Omit<OfflineAlert, "alertId" | "createdAt">): OfflineAlert {
    const record: OfflineAlert = {
      alertId: randomUUID(),
      createdAt: this.nowIso(),
      ...alert,
    };
    this.offlineAlerts.push(record);
    return record;
  }

  addOfflineEventLog(log: Omit<OfflineEventLog, "logId" | "createdAt">): OfflineEventLog {
    const record: OfflineEventLog = {
      logId: randomUUID(),
      createdAt: this.nowIso(),
      ...log,
    };
    this.offlineEventLogs.push(record);
    return record;
  }

  addDiscountEvaluation(
    log: Omit<DiscountEvaluationLog, "evaluationId" | "createdAt">,
  ): DiscountEvaluationLog {
    const record: DiscountEvaluationLog = {
      evaluationId: randomUUID(),
      createdAt: this.nowIso(),
      ...log,
    };
    this.discountEvaluations.push(record);
    return record;
  }

  upsertRiskCompliancePolicy(
    policy: Omit<RiskCompliancePolicy, "policyId" | "createdAt" | "updatedAt"> & { policyId?: string },
  ): RiskCompliancePolicy {
    const now = this.nowIso();
    if (policy.policyId) {
      const existingIndex = this.riskCompliancePolicies.findIndex((item) => item.policyId === policy.policyId);
      if (existingIndex >= 0) {
        const existing = this.riskCompliancePolicies[existingIndex];
        const updated: RiskCompliancePolicy = {
          ...existing,
          ...policy,
          policyId: existing.policyId,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        this.riskCompliancePolicies[existingIndex] = updated;
        return updated;
      }
    }

    const { policyId, ...rest } = policy;
    const created: RiskCompliancePolicy = {
      policyId: policyId ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...rest,
    };
    this.riskCompliancePolicies.push(created);
    return created;
  }

  addComplianceEvent(
    event: Omit<ComplianceEventLog, "complianceEventId" | "createdAt">,
  ): ComplianceEventLog {
    const record = Object.freeze({
      complianceEventId: randomUUID(),
      createdAt: this.nowIso(),
      ...event,
    });
    this.complianceEventRecords.push(record);
    return record as ComplianceEventLog;
  }

  addSecurityEvent(
    event: Omit<SecurityEventLog, "securityEventId" | "createdAt">,
  ): SecurityEventLog {
    const record = Object.freeze({
      securityEventId: randomUUID(),
      createdAt: this.nowIso(),
      ...event,
    });
    this.securityEventRecords.push(record);
    return record as SecurityEventLog;
  }

  addStructuredMetric(
    metric: Omit<StructuredMetricLog, "metricId" | "createdAt">,
  ): StructuredMetricLog {
    const record = Object.freeze({
      metricId: randomUUID(),
      createdAt: this.nowIso(),
      ...metric,
    });
    this.structuredMetricRecords.push(record);
    return record as StructuredMetricLog;
  }

  addIncidentLifecycleEvent(
    event: Omit<IncidentLifecycleEvent, "eventId" | "createdAt">,
  ): IncidentLifecycleEvent {
    const record = Object.freeze({
      eventId: randomUUID(),
      createdAt: this.nowIso(),
      ...event,
    });
    this.incidentLifecycleRecords.push(record);
    return record as IncidentLifecycleEvent;
  }

  addLoyaltyRewardHistory(
    history: Omit<LoyaltyRewardHistory, "historyId" | "createdAt">,
  ): LoyaltyRewardHistory {
    const record: LoyaltyRewardHistory = {
      historyId: randomUUID(),
      createdAt: this.nowIso(),
      ...history,
    };
    this.loyaltyRewardHistory.push(record);
    return record;
  }

  upsertLoyaltyRule(rule: LoyaltyRewardRule): LoyaltyRewardRule {
    const index = this.loyaltyRewardRules.findIndex((item) => item.tenantId === rule.tenantId);
    if (index >= 0) {
      this.loyaltyRewardRules[index] = rule;
      return rule;
    }

    this.loyaltyRewardRules.push(rule);
    return rule;
  }

  addReportingSnapshot(
    input: Omit<ReportingSnapshot, "snapshotId" | "createdAt">,
  ): ReportingSnapshot {
    const record: ReportingSnapshot = {
      snapshotId: randomUUID(),
      createdAt: this.nowIso(),
      ...input,
    };
    this.reportingSnapshots.push(record);
    return record;
  }

  notificationConnectivityKey(tenantId: string, branchId: string): string {
    return `${tenantId}:${branchId}`;
  }

  private defaultFeatureFlags(): Record<FeatureFlagKey, boolean> {
    return {
      advanced_discounts: true,
      loyalty_rules: true,
      risk_enforcement: true,
      analytics_expansion: false,
      external_audit_exports: false,
      data_retention_policies: false,
      webhook_outbound: false,
      background_aggregation: false,
      scale_reads: false,
      phase7_observability: false,
      phase7_predictive: false,
      phase7_integration_control: false,
      phase7_compliance_exports: false,
      phase7_scale_guard: false,
      phase8_predictive_actions: false,
      phase8_ops_enhancements: false,
    };
  }

  getFeatureFlag(tenantId: string, key: FeatureFlagKey): boolean {
    const existing = this.featureFlags.get(tenantId) ?? this.defaultFeatureFlags();
    if (!this.featureFlags.has(tenantId)) {
      this.featureFlags.set(tenantId, { ...existing });
    }
    if (existing[key] === undefined) {
      existing[key] = false;
      this.featureFlags.set(tenantId, { ...existing });
    }
    return Boolean(existing[key]);
  }

  setFeatureFlag(tenantId: string, key: FeatureFlagKey, enabled: boolean): Record<FeatureFlagKey, boolean> {
    const existing = this.featureFlags.get(tenantId) ?? this.defaultFeatureFlags();
    existing[key] = enabled;
    this.featureFlags.set(tenantId, { ...existing });
    return { ...existing };
  }

  upsertPredictiveAction(
    input: Omit<PredictiveActionRecord, "actionId" | "createdAt" | "updatedAt"> & { actionId?: string },
  ): PredictiveActionRecord {
    const now = this.nowIso();
    if (input.actionId) {
      const existingIndex = this.predictiveActions.findIndex((item) => item.actionId === input.actionId);
      if (existingIndex >= 0) {
        const existing = this.predictiveActions[existingIndex];
        const updated: PredictiveActionRecord = {
          ...existing,
          ...input,
          actionId: existing.actionId,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        this.predictiveActions[existingIndex] = updated;
        return updated;
      }
    }
    const { actionId, ...rest } = input;
    const created: PredictiveActionRecord = {
      actionId: actionId ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...rest,
    };
    this.predictiveActions.push(created);
    return created;
  }

  getRetentionPolicy(tenantId: string): RetentionPolicy {
    const existing = this.retentionPolicies.get(tenantId);
    if (existing) {
      return { ...existing };
    }
    const fallback: RetentionPolicy = {
      tenantId,
      auditDays: 365,
      securityEventDays: 180,
      complianceEventDays: 365,
      metricDays: 90,
      updatedBy: "SYSTEM",
      updatedAt: this.nowIso(),
    };
    this.retentionPolicies.set(tenantId, fallback);
    return { ...fallback };
  }

  setRetentionPolicy(input: Omit<RetentionPolicy, "updatedAt">): RetentionPolicy {
    const record: RetentionPolicy = {
      ...input,
      updatedAt: this.nowIso(),
    };
    this.retentionPolicies.set(input.tenantId, record);
    return { ...record };
  }

  private purgeArrayByCreatedAt<T extends { tenantId: string; createdAt: string }>(
    list: T[],
    tenantId: string,
    olderThanIso: string,
  ): number {
    const before = list.length;
    const kept = list.filter((item) => item.tenantId !== tenantId || item.createdAt >= olderThanIso);
    list.splice(0, list.length, ...kept);
    return before - kept.length;
  }

  purgeSecurityEventsOlderThan(tenantId: string, olderThanIso: string): number {
    return this.purgeArrayByCreatedAt(this.securityEventRecords as SecurityEventLog[], tenantId, olderThanIso);
  }

  purgeComplianceEventsOlderThan(tenantId: string, olderThanIso: string): number {
    return this.purgeArrayByCreatedAt(this.complianceEventRecords as ComplianceEventLog[], tenantId, olderThanIso);
  }

  purgeStructuredMetricsOlderThan(tenantId: string, olderThanIso: string): number {
    return this.purgeArrayByCreatedAt(this.structuredMetricRecords as StructuredMetricLog[], tenantId, olderThanIso);
  }

  purgeWebhookDeliveriesOlderThan(tenantId: string, olderThanIso: string): number {
    return this.purgeArrayByCreatedAt(this.webhookDeliveries, tenantId, olderThanIso);
  }

  purgeReportingSnapshotsOlderThan(tenantId: string, olderThanIso: string): number {
    return this.purgeArrayByCreatedAt(this.reportingSnapshots, tenantId, olderThanIso);
  }

  purgeAggregationSnapshotsOlderThan(tenantId: string, olderThanIso: string): number {
    const before = this.aggregationSnapshots.length;
    const kept = this.aggregationSnapshots.filter(
      (item) => item.tenantId !== tenantId || item.generatedAt >= olderThanIso,
    );
    this.aggregationSnapshots.splice(0, this.aggregationSnapshots.length, ...kept);
    return before - kept.length;
  }

  addAggregationJob(input: Omit<AggregationJob, "jobId" | "requestedAt">): AggregationJob {
    const record: AggregationJob = {
      jobId: randomUUID(),
      requestedAt: this.nowIso(),
      ...input,
    };
    this.aggregationJobs.push(record);
    return record;
  }

  updateAggregationJob(jobId: string, patch: Partial<AggregationJob>): AggregationJob {
    const job = this.aggregationJobs.find((item) => item.jobId === jobId);
    if (!job) {
      throw new Error("AGGREGATION_JOB_NOT_FOUND");
    }
    Object.assign(job, patch);
    return job;
  }

  addAggregationSnapshot(
    input: Omit<AggregationSnapshot, "snapshotId" | "generatedAt">,
  ): AggregationSnapshot {
    const record: AggregationSnapshot = {
      snapshotId: randomUUID(),
      generatedAt: this.nowIso(),
      ...input,
    };
    this.aggregationSnapshots.push(record);
    return record;
  }

  upsertWebhookEndpoint(
    input: Omit<WebhookEndpoint, "endpointId" | "createdAt" | "updatedAt"> & { endpointId?: string },
  ): WebhookEndpoint {
    const now = this.nowIso();
    if (input.endpointId) {
      const existingIndex = this.webhookEndpoints.findIndex((item) => item.endpointId === input.endpointId);
      if (existingIndex >= 0) {
        const existing = this.webhookEndpoints[existingIndex];
        const updated: WebhookEndpoint = {
          ...existing,
          ...input,
          endpointId: existing.endpointId,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        this.webhookEndpoints[existingIndex] = updated;
        return updated;
      }
    }
    const { endpointId, ...rest } = input;
    const created: WebhookEndpoint = {
      endpointId: endpointId ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...rest,
    };
    this.webhookEndpoints.push(created);
    return created;
  }

  addWebhookDelivery(
    input: Omit<WebhookDelivery, "deliveryId" | "createdAt" | "updatedAt">,
  ): WebhookDelivery {
    const record: WebhookDelivery = {
      deliveryId: randomUUID(),
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
      ...input,
    };
    this.webhookDeliveries.push(record);
    return record;
  }

  updateWebhookDelivery(deliveryId: string, patch: Partial<WebhookDelivery>): WebhookDelivery {
    const delivery = this.webhookDeliveries.find((item) => item.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error("WEBHOOK_DELIVERY_NOT_FOUND");
    }
    Object.assign(delivery, patch, { updatedAt: this.nowIso() });
    return delivery;
  }

  upsertIntegrationClient(
    input: Omit<IntegrationClient, "clientId" | "createdAt" | "updatedAt"> & { clientId?: string },
  ): IntegrationClient {
    const now = this.nowIso();
    if (input.clientId) {
      const existingIndex = this.integrationClients.findIndex((item) => item.clientId === input.clientId);
      if (existingIndex >= 0) {
        const existing = this.integrationClients[existingIndex];
        const updated: IntegrationClient = {
          ...existing,
          ...input,
          clientId: existing.clientId,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        this.integrationClients[existingIndex] = updated;
        return updated;
      }
    }

    const { clientId, ...rest } = input;
    const created: IntegrationClient = {
      clientId: clientId ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...rest,
    };
    this.integrationClients.push(created);
    return created;
  }

  upsertLegalHold(
    input: Omit<LegalHold, "holdId" | "createdAt"> & { holdId?: string },
  ): LegalHold {
    const now = this.nowIso();
    if (input.holdId) {
      const existingIndex = this.legalHolds.findIndex((item) => item.holdId === input.holdId);
      if (existingIndex >= 0) {
        const existing = this.legalHolds[existingIndex];
        const updated: LegalHold = {
          ...existing,
          ...input,
          holdId: existing.holdId,
          createdAt: existing.createdAt,
        };
        this.legalHolds[existingIndex] = updated;
        return updated;
      }
    }

    const { holdId, ...rest } = input;
    const created: LegalHold = {
      holdId: holdId ?? randomUUID(),
      createdAt: now,
      ...rest,
    };
    this.legalHolds.push(created);
    return created;
  }

  setScaleCache(
    key: string,
    value: unknown,
    input: { tenantId: string; branchId: string; readSource: "PRIMARY" | "REPLICA"; ttlMs: number },
  ) {
    const now = Date.now();
    this.scaleCacheRecords.set(key, {
      key,
      tenantId: input.tenantId,
      branchId: input.branchId,
      readSource: input.readSource,
      value,
      createdAt: this.nowIso(),
      expiresAt: now + Math.max(1, input.ttlMs),
      hits: 0,
      lastAccessedAt: this.nowIso(),
    });
  }

  getScaleCache(
    key: string,
    tenantId: string,
    branchId: string,
  ): { value: unknown; readSource: "PRIMARY" | "REPLICA"; cacheHit: boolean } | null {
    const existing = this.scaleCacheRecords.get(key);
    if (!existing) {
      return null;
    }
    if (existing.tenantId !== tenantId || existing.branchId !== branchId) {
      return null;
    }
    if (Date.now() > existing.expiresAt) {
      this.scaleCacheRecords.delete(key);
      return null;
    }
    existing.hits += 1;
    existing.lastAccessedAt = this.nowIso();
    return {
      value: existing.value,
      readSource: existing.readSource,
      cacheHit: true,
    };
  }

  evictScaleCacheByPrefix(prefix: string, tenantId: string): number {
    let removed = 0;
    for (const [key, entry] of this.scaleCacheRecords.entries()) {
      if (entry.tenantId === tenantId && key.startsWith(prefix)) {
        this.scaleCacheRecords.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  isNotificationOnline(tenantId: string, branchId: string): boolean {
    return this.notificationConnectivity.get(this.notificationConnectivityKey(tenantId, branchId)) ?? true;
  }

  setNotificationConnectivity(tenantId: string, branchId: string, online: boolean): void {
    this.notificationConnectivity.set(this.notificationConnectivityKey(tenantId, branchId), online);
  }

  hasOpenConflicts(tenantId: string, branchId: string): boolean {
    return this.conflicts.some(
      (item) => item.tenantId === tenantId && item.branchId === branchId && item.resolutionStatus === "OPEN",
    );
  }

  addConflict(
    input: Omit<ConflictRecord, "conflictId" | "createdAt" | "resolutionStatus"> & {
      resolutionStatus?: ConflictRecord["resolutionStatus"];
    },
  ): ConflictRecord {
    const record: ConflictRecord = {
      conflictId: randomUUID(),
      createdAt: this.nowIso(),
      resolutionStatus: input.resolutionStatus ?? "OPEN",
      ...input,
    };

    this.conflicts.push(record);
    return record;
  }

  resolveConflict(conflictId: string, resolverId: string, note: string): ConflictRecord {
    const conflict = this.conflicts.find((item) => item.conflictId === conflictId);
    if (!conflict) {
      throw new Error("CONFLICT_NOT_FOUND");
    }

    conflict.resolutionStatus = "RESOLVED";
    conflict.resolvedBy = resolverId;
    conflict.resolutionNote = note;
    conflict.resolvedAt = this.nowIso();
    return conflict;
  }

  escalateConflict(conflictId: string, resolverId: string, note: string): ConflictRecord {
    const conflict = this.conflicts.find((item) => item.conflictId === conflictId);
    if (!conflict) {
      throw new Error("CONFLICT_NOT_FOUND");
    }

    conflict.resolutionStatus = "ESCALATED";
    conflict.resolvedBy = resolverId;
    conflict.resolutionNote = note;
    conflict.resolvedAt = this.nowIso();
    return conflict;
  }

  userHasBranchAccess(userId: string, tenantId: string, branchId: string): boolean {
    return this.userBranchAccess.some(
      (row) => row.userId === userId && row.tenantId === tenantId && row.branchId === branchId,
    );
  }

  findUserByRole(userId: string, role: Role): User | undefined {
    return this.users.find((item) => item.userId === userId && item.role === role && item.isActive);
  }

  findTaxRate(tenantId: string, taxCategory: string, asOf: string): number {
    const candidates = this.taxRules
      .filter((item) => item.tenantId === tenantId && item.taxCategory === taxCategory && item.effectiveFrom <= asOf)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

    if (candidates.length === 0) {
      return 0;
    }

    return candidates[0].rate;
  }
}

export function createStore(): MemoryStore {
  return new MemoryStore();
}
