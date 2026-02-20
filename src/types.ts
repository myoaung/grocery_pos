export type Role =
  | "APPLICATION_OWNER"
  | "TENANT_OWNER"
  | "MANAGER"
  | "CASHIER"
  | "INVENTORY_STAFF";

export type RiskMode = "ALLOW" | "WARN" | "READ_ONLY" | "BLOCK";

export type QueueState = "PENDING" | "SYNCING" | "CONFLICT" | "FAILED" | "CONFIRMED";

export type ReportId =
  | "REP-T-001"
  | "REP-T-002"
  | "REP-T-003"
  | "REP-T-004"
  | "REP-T-005"
  | "REP-T-006"
  | "REP-T-007"
  | "REP-T-008"
  | "REP-O-001"
  | "REP-O-002"
  | "REP-O-003"
  | "REP-O-004"
  | "REP-O-005"
  | "REP-O-006"
  | "REP-O-007"
  | "REP-O-008"
  | "REP-A-001"
  | "REP-A-002"
  | "REP-A-003"
  | "REP-A-004";

export interface RequestContext {
  userId: string;
  role: Role;
  tenantId: string;
  branchId: string;
}

export interface RiskDecision {
  mode: RiskMode;
  factors: string[];
  source: "DEFAULT" | "HEADER_SIMULATION";
  message: string;
}

export interface Branch {
  branchId: string;
  tenantId: string;
  branchCode: string;
  branchName: string;
  isActive: boolean;
}

export interface User {
  userId: string;
  tenantId: string;
  branchId: string;
  role: Role;
  email: string;
  isActive: boolean;
}

export interface Product {
  productId: string;
  tenantId: string;
  sku: string;
  barcode: string;
  nameMm: string;
  nameEn: string;
  category: string;
  unitType: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  taxCategory: string;
  stockAlert: number;
  updatedAt: string;
}

export interface InventoryLog {
  inventoryLogId: string;
  tenantId: string;
  branchId: string;
  productId: string;
  action: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT" | "DAMAGE" | "TRANSFER_OUT" | "TRANSFER_IN";
  quantity: number;
  reason?: string;
  actorUserId: string;
  createdAt: string;
}

export interface SaleLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  lineTotalBeforeDiscount: number;
  netLineTotal: number;
  costSnapshotAtSale: number;
}

export interface Sale {
  saleId: string;
  tenantId: string;
  branchId: string;
  cashierUserId: string;
  customerId?: string;
  mode: "RETAIL" | "WHOLESALE";
  status: "CONFIRMED" | "VOID";
  lines: SaleLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  netTotal: number;
  createdAt: string;
}

export interface OfflineQueueItem {
  queueId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  idempotencyKey: string;
  eventType: "SALE" | "INVENTORY" | "LOYALTY" | "REPORT";
  payload: Record<string, unknown>;
  state: QueueState;
  retryCount: number;
  replayDeadlineAt: string;
  nextRetryAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictRecord {
  conflictId: string;
  tenantId: string;
  branchId: string;
  queueId: string;
  conflictType: "PRICE" | "QUANTITY" | "TAX" | "UNKNOWN";
  localValue: Record<string, unknown>;
  serverValue: Record<string, unknown>;
  resolutionStatus: "OPEN" | "RESOLVED" | "ESCALATED";
  resolutionNote?: string;
  resolvedBy?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditLog {
  auditLogId: string;
  sequence: number;
  previousHash: string | null;
  entryHash: string;
  externalAnchorRef: string;
  externalAnchorTimestamp: string;
  externalAnchorCounter: number;
  severity: "INFO" | "WARN" | "CRITICAL";
  tenantId: string;
  branchId: string;
  actorUserId: string;
  roleAtTime: Role;
  endpoint: string;
  method: string;
  decision: "ALLOW" | "DENY";
  reason: string;
  actionType: string;
  createdAt: string;
}

export interface Customer {
  customerId: string;
  tenantId: string;
  branchId: string;
  name: string;
  phone: string;
  visitCount: number;
  totalSpending: number;
  currentPoints: number;
  tierName: "STANDARD" | "SILVER" | "GOLD";
}

export interface LoyaltyLedgerEntry {
  loyaltyEntryId: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  pointsDelta: number;
  reason: string;
  actorUserId: string;
  createdAt: string;
}

export interface TaxRule {
  taxRuleId: string;
  tenantId: string;
  taxCategory: string;
  rate: number;
  effectiveFrom: string;
}

export interface TransactionRecord {
  transactionId: string;
  tenantId: string;
  branchId: string;
  sourceQueueId: string;
  eventType: "SALE" | "INVENTORY" | "LOYALTY" | "REPORT";
  idempotencyKey: string;
  createdAt: string;
}

export interface BackupRun {
  backupRunId: string;
  tenantId: string;
  status: "SUCCESS" | "FAILED";
  durationSec: number;
  createdAt: string;
  restoreTestAt?: string;
}

export interface MetricPoint {
  timestamp: string;
  requestCount: number;
  errorCount: number;
  p95LatencyMs: number;
  uptimePct: number;
  syncBacklogCount: number;
}

export interface ReportResult {
  reportId: ReportId;
  generatedAt: string;
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface TenantProfile {
  tenantId: string;
  tenantName: string;
  timezone: string;
  currencyCode: string;
  isActive: boolean;
}

export interface DashboardKpi {
  tenantId: string;
  branchId: string;
  salesToday: number;
  receiptsToday: number;
  avgReceipt: number;
  lowStockCount: number;
  customerCount: number;
  loyaltyMemberCount: number;
  openConflictCount: number;
  pendingQueueCount: number;
}

export interface DashboardSeriesPoint {
  label: string;
  value: number;
}

export interface PluginRegistration {
  registrationId: string;
  tenantId: string;
  pluginId: string;
  pluginType: "PAYMENT" | "MARKETPLACE";
  enabled: boolean;
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginExecutionLog {
  executionId: string;
  tenantId: string;
  branchId: string;
  pluginId: string;
  operation: string;
  status: "SUCCESS" | "FAILED";
  actorUserId: string;
  requestRef: string;
  responseCode: string;
  message: string;
  createdAt: string;
}

export interface OfflineAlert {
  alertId: string;
  tenantId: string;
  branchId: string;
  category: "QUEUE" | "CONFLICT" | "RISK";
  severity: "WARN" | "READ_ONLY" | "BLOCK";
  message: string;
  source: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
}

export type NotificationEventType = "LOYALTY_POINTS" | "LOW_STOCK" | "OFFLINE_CONFLICT" | "SYSTEM_EVENT";

export type NotificationSeverity = "INFO" | "WARN" | "READ_ONLY" | "BLOCK";

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface NotificationPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface NotificationRecord {
  notificationId: string;
  tenantId: string;
  branchId: string;
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  targetRoles: Role[];
  payload: NotificationPayload;
  idempotencyKey: string;
  status: NotificationStatus;
  createdBy: string;
  source: "MANUAL" | "TRIGGER";
  deliveryProvider: "FIREBASE_FIAM";
  attempts: number;
  errorMessage?: string;
  readBy: string[];
  createdAt: string;
  sentAt?: string;
  updatedAt: string;
}

export interface LoyaltyRewardRule {
  tenantId: string;
  pointsPerKyat: number;
  redemptionRateKyatPerPoint: number;
  minRedeemPoints: number;
}

export interface LoyaltyRewardHistory {
  historyId: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  operation: "ACCRUE" | "REDEEM" | "ADJUST";
  pointsDelta: number;
  balanceAfter: number;
  reason: string;
  actorUserId: string;
  source: "POS" | "DASHBOARD" | "OFFLINE_SYNC";
  createdAt: string;
}

export interface ReportingTemplate {
  templateId: string;
  title: string;
  category: "LOYALTY" | "OPERATIONS" | "MULTI_STORE";
  allowedRoles: Role[];
  filters: string[];
  exportFormats: Array<"csv" | "pdf" | "print">;
}

export interface ReportingSnapshot {
  snapshotId: string;
  tenantId: string;
  branchId: string;
  templateId: string;
  filters: Record<string, unknown>;
  rows: Array<Record<string, string | number | boolean | null>>;
  createdBy: string;
  createdAt: string;
}

export type LoyaltyOperation = "ACCRUE" | "REDEEM" | "ADJUST";

export interface LoyaltyQueuePayload {
  operation: LoyaltyOperation;
  customerId: string;
  points: number;
  reason: string;
  expectedBalanceBefore?: number;
}

export interface ReportQueuePayload {
  templateId: string;
  filters: Record<string, unknown>;
}

export interface OfflineEventLog {
  logId: string;
  tenantId: string;
  branchId: string;
  queueId: string;
  idempotencyKey: string;
  eventType: OfflineQueueItem["eventType"];
  status: "QUEUED" | "RETRIED" | "SYNCED" | "CONFLICT" | "FAILED";
  message: string;
  actorUserId: string;
  createdAt: string;
}

export interface DiscountEvaluationLog {
  evaluationId: string;
  tenantId: string;
  branchId: string;
  actorUserId: string;
  roleAtTime: Role;
  customerId?: string;
  mode: "RETAIL" | "WHOLESALE";
  subtotal: number;
  stackedDiscountPct: number;
  discountTotal: number;
  finalTotal: number;
  manualOverridePct: number;
  loyaltySynergyPct: number;
  lineCount: number;
  createdAt: string;
}

export interface RiskCompliancePolicy {
  policyId: string;
  tenantId: string;
  branchId: string;
  policyName: string;
  scope: "TENANT" | "BRANCH";
  mode: Exclude<RiskMode, "ALLOW">;
  enabled: boolean;
  conditions: {
    vpnDetected: boolean;
    restrictedLocation: boolean;
    untrustedDevice: boolean;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceEventLog {
  complianceEventId: string;
  tenantId: string;
  branchId: string;
  actorUserId: string;
  roleAtTime: Role;
  mode: RiskMode;
  decision: "ALLOW" | "DENY";
  action: "READ" | "WRITE";
  endpoint: string;
  message: string;
  factors: string[];
  source: "MANUAL_EVAL" | "MIDDLEWARE";
  createdAt: string;
}

export type SecuritySeverity = "INFO" | "WARN" | "CRITICAL";

export type SecurityEventCategory =
  | "RISK_POLICY"
  | "AUTHZ"
  | "OFFLINE"
  | "COMPLIANCE"
  | "AUDIT";

export interface SecurityEventLog {
  securityEventId: string;
  tenantId: string;
  branchId: string;
  actorUserId: string;
  roleAtTime: Role;
  endpoint: string;
  action: "READ" | "WRITE" | "SYSTEM";
  category: SecurityEventCategory;
  severity: SecuritySeverity;
  mode: RiskMode;
  message: string;
  factors: string[];
  source: "RISK_ENGINE" | "MIDDLEWARE" | "SYSTEM";
  createdAt: string;
}

export interface StructuredMetricLog {
  metricId: string;
  metricName: string;
  metricUnit: "count" | "ms" | "ratio";
  metricValue: number;
  tenantId: string;
  branchId: string;
  tags: Record<string, string>;
  source: "API" | "SERVICE" | "SYSTEM";
  createdAt: string;
}

export interface IncidentLifecycleEvent {
  eventId: string;
  incidentId: string;
  tenantId: string;
  branchId: string;
  stage: "DETECT" | "CLASSIFY" | "RESPOND" | "RESOLVE";
  severity: "INFO" | "WARN" | "CRITICAL";
  actorUserId: string;
  detail: string;
  createdAt: string;
}

export interface RetentionPolicy {
  tenantId: string;
  auditDays: number;
  securityEventDays: number;
  complianceEventDays: number;
  metricDays: number;
  updatedBy: string;
  updatedAt: string;
}

export interface AggregationSnapshot {
  snapshotId: string;
  tenantId: string;
  branchId: string;
  window: "24h" | "7d" | "30d";
  mode: "BACKGROUND";
  totals: {
    salesCount: number;
    netSales: number;
    pendingQueue: number;
    lowStockCount: number;
  };
  generatedBy: string;
  generatedAt: string;
}

export interface AggregationJob {
  jobId: string;
  tenantId: string;
  branchId: string;
  type: "TENANT_ROLLUP";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMEOUT";
  requestedBy: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  resultSnapshotId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface WebhookEndpoint {
  endpointId: string;
  tenantId: string;
  branchId: string;
  integrationClientId?: string;
  name: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  secret: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  deliveryId: string;
  tenantId: string;
  branchId: string;
  endpointId: string;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  signature: string;
  status: "PENDING" | "RETRYING" | "DELIVERED" | "FAILED";
  attempts: number;
  maxAttempts: number;
  responseCode?: number;
  responseBody?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationClient {
  clientId: string;
  tenantId: string;
  branchId: string;
  name: string;
  description?: string;
  tokenHash: string;
  tokenPreview: string;
  allowedEventTypes: string[];
  enabled: boolean;
  killSwitch: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalHold {
  holdId: string;
  tenantId: string;
  branchId: string;
  scope: "TENANT" | "BRANCH";
  reason: string;
  referenceId?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  releasedBy?: string;
  releasedAt?: string;
  releaseNote?: string;
}

export interface TenantSlaMetricSnapshot {
  tenantId: string;
  branchId: string;
  generatedAt: string;
  offlineRetrySuccessRatePct: number;
  escalationRatePct: number;
  auditWriteLatencyP95Ms: number;
}

export type PredictiveActionDataset = "SLA" | "TREND";

export type PredictiveActionSeverity = "INFO" | "WARN" | "CRITICAL";

export type PredictiveActionStatus = "OPEN" | "ACKNOWLEDGED" | "EXECUTED" | "DISMISSED";

export interface PredictiveActionRecord {
  actionId: string;
  tenantId: string;
  branchId: string;
  dataset: PredictiveActionDataset;
  metric: string;
  severity: PredictiveActionSeverity;
  title: string;
  description: string;
  recommendation: string;
  sourceRef: string;
  status: PredictiveActionStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  executedBy?: string;
  executedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type FeatureFlagKey =
  | "advanced_discounts"
  | "loyalty_rules"
  | "risk_enforcement"
  | "analytics_expansion"
  | "external_audit_exports"
  | "data_retention_policies"
  | "webhook_outbound"
  | "background_aggregation"
  | "scale_reads"
  | "phase7_observability"
  | "phase7_predictive"
  | "phase7_integration_control"
  | "phase7_compliance_exports"
  | "phase7_scale_guard"
  | "phase8_predictive_actions"
  | "phase8_ops_enhancements";
