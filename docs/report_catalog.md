# Cosmic Forge Grocery POS
## Report Catalog v1.9

Version: v1.9  
Status: Draft for Review  
Date: 2026-02-20  
Owner: Application Owner  
References: `docs/FRD-v1.2.md`, `docs/permission_matrix.md`, `docs/release_governance.md`

---

## 1. Catalog Rules

1. All report queries must be tenant-scoped unless explicitly global.
2. Date filters must use tenant timezone boundary logic.
3. Export totals must match UI totals.
4. Formula changes require version update and approval.

Default filters:
- `date_from`
- `date_to`
- `branch_id` (for tenant-scoped reports)
- `timezone` (tenant default if not supplied)

Default export formats:
- CSV
- PDF

Common logical sources (implementation can map to views/tables):
- `sales`
- `sale_lines`
- `inventory_ledger`
- `products`
- `customers`
- `loyalty_ledger`
- `users`
- `audit_logs`
- `incidents`
- `system_metrics`
- `backup_runs`
- `tenant_usage_daily`

---

## 2. Tenant Reports (Mandatory)

### REP-T-001 Daily Sales

- Scope: tenant
- Owner role: tenant owner, manager
- Allowed roles: application owner (tenant view), tenant owner, manager, cashier (read-only summary)
- Purpose: daily revenue and transaction health

Metrics:
- `gross_sales = SUM(sale_lines.line_total_before_discount)`
- `discount_total = SUM(sale_lines.discount_amount)`
- `tax_total = SUM(sale_lines.tax_amount)`
- `net_sales = gross_sales - discount_total + tax_total`
- `receipt_count = COUNT(DISTINCT sales.id)`
- `avg_receipt = net_sales / receipt_count`

Columns:
- business_date
- branch_name
- gross_sales
- discount_total
- tax_total
- net_sales
- receipt_count
- avg_receipt

Acceptance checks:
1. branch totals roll up to tenant total for selected day.
2. export values equal UI values.
3. cancelled/voided sales follow configured exclusion policy.

### REP-T-002 Monthly Sales

- Scope: tenant
- Purpose: monthly revenue trend

Metrics:
- `monthly_net_sales = SUM(net_sales)`
- `month_over_month_growth_pct = (current_month - previous_month) / NULLIF(previous_month, 0) * 100`

Columns:
- year_month
- net_sales
- receipt_count
- avg_receipt
- growth_pct

Acceptance checks:
1. month values match sum of daily report for same month.
2. growth calculation handles zero previous month without crash.

### REP-T-003 Inventory Status

- Scope: tenant
- Purpose: real-time stock visibility

Metrics:
- `on_hand_qty = SUM(in_qty) - SUM(out_qty)` derived from `inventory_ledger`
- `inventory_value_cost = on_hand_qty * products.cost_price`
- `inventory_value_retail = on_hand_qty * products.retail_price`

Columns:
- product_sku
- product_name
- branch_name
- on_hand_qty
- cost_price
- retail_price
- inventory_value_cost
- inventory_value_retail

Acceptance checks:
1. on-hand quantity equals ledger replay result.
2. any negative on-hand quantity is treated as a data integrity failure and must be flagged.

### REP-T-004 Low Stock

- Scope: tenant
- Purpose: reorder prioritization

Metrics:
- `stock_gap = products.stock_alert_level - on_hand_qty`

Filters:
- optional `critical_only` where `on_hand_qty <= 0`

Columns:
- product_sku
- product_name
- branch_name
- on_hand_qty
- stock_alert_level
- stock_gap
- last_movement_at

Acceptance checks:
1. includes only products where `on_hand_qty <= stock_alert_level`.
2. stock gap calculation is correct for all rows.

### REP-T-005 Profit Summary

- Scope: tenant
- Purpose: margin visibility by period

Metrics:
- `revenue = SUM(sale_lines.net_line_total)`
- `cogs = SUM(sale_lines.quantity * cost_snapshot_at_sale)`
- `gross_profit = revenue - cogs`
- `gross_margin_pct = gross_profit / NULLIF(revenue, 0) * 100`

Columns:
- date_bucket
- revenue
- cogs
- gross_profit
- gross_margin_pct

Acceptance checks:
1. cogs uses sale-time cost snapshot, not current cost.
2. gross margin handles zero revenue safely.

### REP-T-006 Staff Performance

- Scope: tenant
- Purpose: staff productivity and activity

Metrics:
- `sales_count = COUNT(DISTINCT sales.id)`
- `sales_total = SUM(sales.net_total)`
- `avg_sale = sales_total / NULLIF(sales_count, 0)`
- `discount_override_count = COUNT(*) WHERE override_used = true`

Columns:
- user_id
- user_name
- role
- branch_name
- sales_count
- sales_total
- avg_sale
- discount_override_count

Acceptance checks:
1. only staff within tenant appear.
2. sales attribution follows recorded cashier/user on sale.

### REP-T-007 Customer Loyalty

- Scope: tenant
- Purpose: loyalty usage and top customers

Metrics:
- `points_earned = SUM(loyalty_ledger.points_delta WHERE points_delta > 0)`
- `points_redeemed = ABS(SUM(loyalty_ledger.points_delta WHERE points_delta < 0))`
- `active_members = COUNT(DISTINCT customer_id with transactions in range)`

Columns:
- customer_id
- customer_name
- current_points
- points_earned
- points_redeemed
- total_spend
- tier_name

Acceptance checks:
1. points ledger balances reconcile to customer current balance.
2. redemption rows are not counted as earnings.

### REP-T-008 Tax Summary

- Scope: tenant
- Purpose: tax liability and filing support

Metrics:
- `taxable_sales = SUM(sale_lines.taxable_amount)`
- `tax_amount = SUM(sale_lines.tax_amount)`
- `effective_rate = tax_amount / NULLIF(taxable_sales, 0) * 100`

Grouping:
- by tax category
- by effective tax rule id

Columns:
- tax_category
- rule_id
- taxable_sales
- tax_amount
- effective_rate

Acceptance checks:
1. uses stored tax snapshot/rule at sale time.
2. totals match checkout-calculated tax totals.

---

## 3. Application Owner Reports (Mandatory)

### REP-O-001 Tenant Activity

- Scope: global (application owner only)
- Purpose: activity overview per tenant

Metrics:
- `active_users = COUNT(DISTINCT user_id)`
- `active_branches = COUNT(DISTINCT branch_id)`
- `sales_count = COUNT(DISTINCT sale_id)`
- `net_sales = SUM(net_total)`

Columns:
- tenant_id
- tenant_name
- active_users
- active_branches
- sales_count
- net_sales
- last_activity_at

Acceptance checks:
1. tenant rows are isolated and complete.
2. date filter applies consistently across tenants.

### REP-O-002 Revenue Overview

- Scope: global
- Purpose: platform-level revenue distribution

Metrics:
- `platform_gmv = SUM(net_sales across tenants)`
- `tenant_share_pct = tenant_net_sales / NULLIF(platform_gmv, 0) * 100`

Columns:
- tenant_id
- tenant_name
- net_sales
- share_pct
- growth_pct

Acceptance checks:
1. sum of tenant shares approximates 100% with rounding rules documented.
2. growth uses previous equivalent period.

### REP-O-003 System Health

- Scope: global
- Purpose: technical reliability tracking

Metrics:
- `api_error_rate = errors / requests * 100`
- `p95_api_latency_ms`
- `sync_backlog_count`
- `uptime_pct`

Columns:
- timestamp_bucket
- request_count
- error_rate_pct
- p95_latency_ms
- sync_backlog_count
- uptime_pct

Acceptance checks:
1. metric definitions match monitoring source of truth.
2. p95 values match telemetry backend for sampled periods.

### REP-O-004 Abuse and Risk

- Scope: global
- Purpose: fraud/risk monitoring

Metrics:
- `high_risk_session_count`
- `vpn_flag_count`
- `blocked_attempt_count`
- `active_incidents`

Columns:
- tenant_id
- branch_id
- risk_event_type
- risk_score
- action_taken
- occurred_at

Acceptance checks:
1. override actions appear with actor and reason.
2. blocked actions are counted distinctly from warnings.

### REP-O-005 Growth Metrics

- Scope: global
- Purpose: business expansion and retention

Metrics:
- `new_tenants`
- `active_tenants`
- `tenant_retention_pct`
- `avg_sales_per_tenant`

Columns:
- period
- new_tenants
- active_tenants
- retention_pct
- avg_sales_per_tenant

Acceptance checks:
1. active tenant definition is documented and consistently applied.
2. retention denominator uses prior-period active set.

### REP-O-006 Feature Usage

- Scope: global
- Purpose: feature adoption tracking

Metrics:
- `feature_event_count`
- `unique_users_using_feature`
- `adoption_pct = unique_users_using_feature / NULLIF(active_users, 0) * 100`

Columns:
- feature_key
- tenant_id
- event_count
- unique_users
- adoption_pct

Acceptance checks:
1. feature keys are normalized and versioned.
2. inactive/test tenants can be excluded by filter.

### REP-O-007 Error Rates

- Scope: global
- Purpose: defect hot-spot detection

Metrics:
- `error_count_by_code`
- `error_rate_by_endpoint = endpoint_errors / endpoint_requests * 100`

Columns:
- endpoint
- error_code
- error_count
- request_count
- error_rate_pct

Acceptance checks:
1. error rate denominator must be endpoint request count in same window.
2. client and server errors are distinguishable.

### REP-O-008 Backup Status

- Scope: global
- Purpose: backup and recovery compliance

Metrics:
- `last_success_at`
- `success_rate_pct = successful_runs / total_runs * 100`
- `avg_backup_duration_sec`
- `last_restore_test_at`

Columns:
- tenant_id (or environment scope)
- backup_job_id
- last_success_at
- success_rate_pct
- avg_duration_sec
- last_restore_test_at

Acceptance checks:
1. failed backup runs are visible and not dropped from totals.
2. restore drill timestamp must be present for required environments.

---

## 4. Optional Advanced Reports (P2)

Phase 2 API surfaces:
- `GET /api/v1/reports/advanced/templates`
- `GET /api/v1/reports/advanced/{reportId}`
- `GET /api/v1/reports/advanced/{reportId}/export?format=csv|pdf`

Default advanced filters:
- `dateFrom`
- `dateTo`
- `compareTenantId` (application owner only for cross-tenant comparative queries)

### REP-A-001 Forecasting

- Scope: tenant/global configurable
- Purpose: demand and sales projection
- Minimum output: forecast period, predicted net sales, confidence band
- Filters: `dateFrom`, `dateTo`
- Export: CSV, PDF

Acceptance checks:
1. model version and training window are displayed.
2. forecast can be disabled without impacting mandatory reports.

### REP-A-002 Trend Analysis

- Scope: tenant/global configurable
- Purpose: trend decomposition for sales and traffic
- Filters: `dateFrom`, `dateTo`
- Export: CSV, PDF

Acceptance checks:
1. trend logic definition is documented.
2. same input period produces deterministic output.

### REP-A-003 Comparative Report

- Scope: tenant/global configurable
- Purpose: compare branch-to-branch or tenant-to-tenant performance
- Filters: `dateFrom`, `dateTo`, `compareTenantId`
- Export: CSV, PDF

Acceptance checks:
1. comparisons enforce authorized scope.
2. normalized metrics document baseline assumptions.

### REP-A-004 Custom Advanced Report

- Scope: feature-flagged
- Purpose: owner-defined custom analysis
- Filters: `dateFrom`, `dateTo`
- Export: CSV, PDF

Acceptance checks:
1. custom metrics must declare formula and source.
2. report cannot bypass tenant access controls.

### 4.1 Phase 4 Reporting Extensions (Tenant/Branch Scoped)

Phase 4 API surfaces:
- `GET /api/v1/tenants/{tenantId}/reports/extensions/templates`
- `GET /api/v1/tenants/{tenantId}/reports/extensions/{templateId}`
- `GET /api/v1/tenants/{tenantId}/reports/extensions/{templateId}/export?format=csv|pdf|print`

Default extension filters:
- `dateFrom`
- `dateTo`
- template-specific keys (for example: `customerId`, `operation`, `eventType`, `state`, `status`)

Extension export contract:
- CSV
- PDF
- Printable HTML view

#### REP-X-LOY-001 Loyalty Rewards KPI

- Category: loyalty
- Purpose: reward program health by tenant/branch
- Metrics:
  - `member_count`
  - `active_member_count`
  - `points_accrued`
  - `points_redeemed`
  - `net_points_outstanding`
  - `outstanding_value_kyat`

#### REP-X-LOY-002 Loyalty Redemption Audit

- Category: loyalty
- Purpose: trace every loyalty point mutation
- Columns:
  - `created_at`
  - `customer_id`
  - `operation`
  - `points_delta`
  - `balance_after`
  - `source`
  - `actor_user_id`
  - `reason`

#### REP-X-OPS-001 Offline Queue Health

- Category: operations
- Purpose: queue depth/state visibility across event types
- Columns:
  - `event_type`
  - `queue_state`
  - `count`

#### REP-X-OPS-002 Conflict Resolution SLA

- Category: operations
- Purpose: conflict latency and resolution performance
- Columns:
  - `conflict_id`
  - `conflict_type`
  - `status`
  - `created_at`
  - `resolved_at`
  - `sla_minutes`
- `resolved_by`

---

## 5. Phase 5 Reporting Extensions (Runtime)

Phase 5 API surfaces:
- `GET /api/v1/tenants/{tenantId}/reports/multi-store/{reportKey}`
- `GET /api/v1/tenants/{tenantId}/reports/multi-store/{reportKey}/export?format=csv|pdf|print`

Aggregation behavior:
- multi-store report endpoint runs live aggregation against current tenant data
- generation also persists snapshot evidence for audit traceability (`LIVE_WITH_SNAPSHOT`)
- endpoint response includes aggregation mode and pagination envelope

Pagination and limits:
- default `page=1`
- default `pageSize=50`
- allowed `pageSize` range: `1..200`
- response metadata includes `page`, `pageSize`, `totalRows`, `totalPages`, `limitMax`
- export endpoints are full filtered exports and do not apply page slicing

Allowed `reportKey` values:
- `summary` -> `REP-X-MSR-001` Multi-Store Sales Rollup
- `inventory-risk` -> `REP-X-MSR-002` Multi-Store Inventory Risk
- `discount-compliance` -> `REP-X-MSR-003` Multi-Store Discount Compliance

Default filters:
- `dateFrom`
- `dateTo`
- `branchId`
- `role` (for discount-compliance)

Export contract:
- CSV (mandatory)
- PDF (mandatory)
- Printable HTML (optional secondary view)

### REP-X-MSR-001 Multi-Store Sales Rollup

- Scope: tenant
- Purpose: aggregate branch-level sales KPIs for dashboard/ops review
- Columns:
  - `tenant_id`
  - `branch_id`
  - `branch_name`
  - `receipts`
  - `gross_sales`
  - `discount_total`
  - `net_sales`
  - `avg_receipt`

### REP-X-MSR-002 Multi-Store Inventory Risk

- Scope: tenant
- Purpose: identify branch inventory exposure and low-stock concentration
- Columns:
  - `tenant_id`
  - `branch_id`
  - `branch_name`
  - `low_stock_count`
  - `total_stock_value_cost`
  - `sample_low_stock_skus`

### REP-X-MSR-003 Multi-Store Discount Compliance

- Scope: tenant
- Purpose: audit discount usage by role and branch
- Columns:
  - `tenant_id`
  - `branch_id`
  - `role`
  - `evaluation_count`
  - `avg_discount_pct`
  - `discount_total_kyat`

Acceptance checks:
1. all rows remain tenant-scoped.
2. report access/export follows role permissions.
3. report audit entries include template and filter references.

### 5.1 Phase 6 Performance Guardrails

Aggregation contract:
1. on-screen API responses use `LIVE_WITH_SNAPSHOT` and must include paging metadata.
2. export API responses return full filtered dataset (no UI paging truncation).

Pagination contract:
1. `page` must be positive integer.
2. `pageSize` must be integer in `1..200`.
3. requests exceeding limit fail with explicit validation error.

Performance budget notes:
1. report API p50 target (`pageSize <= 50`) is <= 700ms in baseline environment.
2. report API p95 target (`pageSize <= 50`) is <= 1500ms in baseline environment.
3. hard no-go threshold for interactive endpoint response is 2000ms.
4. response payload growth must be bounded by pagination for interactive endpoints.
5. high-volume tenants must use paged fetch; unpaged interactive report endpoints are forbidden.

### 5.2 Phase 6.1 Runtime Enforcement

Runtime requirements:
1. report endpoints emit structured latency metrics (`report_runtime_latency_ms`).
2. if runtime latency exceeds hard limit, endpoint must fail with explicit block error (`REPORT_PERFORMANCE_BUDGET_EXCEEDED`).
3. runtime latency header (`x-report-latency-ms`) is returned for audit and CI gate checks.
4. budget values can be overlaid by environment variables:
   - `PERF_REPORT_P50_MS`
   - `PERF_REPORT_P95_MS`
   - `PERF_REPORT_HARD_LIMIT_MS`
   - `PERF_REPORT_MAX_PAGE_SIZE`

### 5.3 Phase 6 Expansion Analytics and Export Datasets

Governed expansion endpoints:
- `GET /api/v1/tenants/{tenantId}/analytics/trends`
- `GET /api/v1/tenants/{tenantId}/analytics/compare`
- `GET /api/v1/tenants/{tenantId}/analytics/sla`
- `GET /api/v1/tenants/{tenantId}/analytics/datasets/export?format=csv|json`
- `GET /api/v1/tenants/{tenantId}/exports/audit?format=csv|json`

Scale/read abstraction contract:
1. analytics and export read paths use cache + replica-hint abstraction when enabled.
2. response includes read-source metadata (`PRIMARY` / `REPLICA` / `CACHE`) and cache-hit signal.
3. feature flags controlling this behavior default OFF (`scale_reads`, `analytics_expansion`, `external_audit_exports`).

Analytics dataset contract:
1. trend metrics: `net_sales`, `receipts`, `queue_pending`.
2. comparative analysis includes current window, previous window, delta, and delta percent.
3. export dataset schema is deterministic for CSV/JSON parity:
   - `tenant_id`
   - `branch_id`
   - `bucket`
   - `metric`
   - `value`

External audit export contract:
1. read-only endpoint; no mutation variant is supported.
2. includes chain fields for downstream verification:
   - `sequence`
   - `entry_hash`
   - `previous_hash`
   - `external_anchor_ref`
3. tenant-scoped filtering is mandatory.

Operational notes:
1. background aggregation jobs produce snapshots consumed by analytics/reporting read flows.
2. webhook outbound events can emit export/aggregation-ready notifications without introducing inbound control channels.

### 5.4 Phase 6.1 Non-Functional Hardening Guardrails (Existing FR-P6 IDs)

Scope rule:
1. additive safeguards only; no report behavior drift for existing Phase 5.x/6 report outputs.

Pagination enforcement (FR-P6-923, FR-P6-926):
1. analytics/export collection endpoints must enforce `pageSize` upper bound `<= 200`.
2. validation errors must be explicit for out-of-range paging requests.
3. accepted responses must include pagination metadata:
   - `page`
   - `pageSize`
   - `totalRows`
   - `totalPages`
   - `limitMax`

Retention and background job telemetry linkage (FR-P6-922, FR-P6-924):
1. scheduled retention purge and aggregation jobs must emit:
   - `job_duration_ms`
   - `job_retry_count`
   - `job_failure_count`
2. job-emitted audit entries must use system actor identity for non-interactive operations.

Analytics export stability evidence (FR-P6-928):
1. JSON dataset schema and CSV header are governed by snapshot tests.
2. breaking schema/header drift blocks release until traceability is updated and tests pass.

### 5.5 Phase 7 Operational Intelligence Datasets (FR-P7-1001..FR-P7-1020)

Traceability map:
1. Observability datasets: `FR-P7-1001..FR-P7-1004`
2. Predictive datasets/exports: `FR-P7-1005..FR-P7-1008`
3. Integration control and compliance export datasets: `FR-P7-1009..FR-P7-1015`
4. Feature-flag and scale-guard governed dataset controls: `FR-P7-1016..FR-P7-1020`

Governed read/control-plane endpoints:
- `GET /api/v1/tenants/{tenantId}/observability/overview`
- `GET /api/v1/tenants/{tenantId}/observability/dashboard`
- `GET /api/v1/tenants/{tenantId}/observability/sla`
- `GET /api/v1/tenants/{tenantId}/observability/alerts`
- `GET /api/v1/tenants/{tenantId}/observability/jobs?page={n}&pageSize={m}`
- `GET /api/v1/tenants/{tenantId}/predictive/trends`
- `GET /api/v1/tenants/{tenantId}/predictive/sla`
- `GET /api/v1/tenants/{tenantId}/predictive/export?dataset=trend|sla&format=csv|json`
- `GET /api/v1/tenants/{tenantId}/compliance/exports?format=csv|json`

Phase 7 output contract notes:
1. all datasets are read-only and tenant/branch-scoped.
2. no predictive endpoint performs transactional writes or automation.
3. all collection endpoints enforce pagination (`page`, `pageSize`, max `200`).
4. feature flags default OFF:
   - `phase7_observability`
   - `phase7_predictive`
   - `phase7_compliance_exports`
   - `phase7_scale_guard`

Observability dataset fields:
1. overview cards:
   - `metricsLastHour`
   - `aggregationQueued`
   - `aggregationRunning`
   - `webhookRetrying`
   - `cacheEntries`
2. SLA snapshot:
   - `offlineRetrySuccessRatePct`
   - `offlineEscalationRatePct`
   - `auditWriteLatencyP95Ms`
   - target thresholds
3. alerts:
   - `alertCode`
   - `severity`
   - `metricName`
   - `observed`
   - `threshold`
   - `message`

Predictive dataset fields:
1. trend forecast rows:
   - `tenant_id`
   - `branch_id`
   - `dataset`
   - `metric`
   - `bucket`
   - `period_type` (`HISTORY`/`FORECAST`)
   - `value`
   - `slope_per_day`
   - `confidence_pct`
2. SLA forecast rows:
   - `tenant_id`
   - `branch_id`
   - `dataset`
   - `metric`
   - `bucket` (forecast horizon)
   - `period_type`
   - `value`
   - `risk_level`

Compliance export fields:
1. `tenant_id`
2. `branch_id`
3. `category` (`AUDIT`/`SECURITY`/`COMPLIANCE`)
4. `event_id`
5. `action_type`
6. `severity`
7. `decision`
8. `reason`
9. `actor_user_id`
10. `created_at`
11. `legal_hold_active`

### 5.6 Phase 8 Actionable Intelligence Datasets (FR-P8-1101..FR-P8-1120)

Traceability map:
1. Predictive action datasets: `FR-P8-1101..FR-P8-1104`
2. Ops insight/advisory datasets: `FR-P8-1105..FR-P8-1108`
3. Webhook/control and compliance retention evidence datasets: `FR-P8-1109..FR-P8-1118`
4. Security/regression governance contracts: `FR-P8-1119..FR-P8-1120`

Governed endpoints:
- `GET /api/v1/tenants/{tenantId}/predictive/actions`
- `POST /api/v1/tenants/{tenantId}/predictive/actions/{actionId}/act`
- `GET /api/v1/tenants/{tenantId}/observability/insights?page={n}&pageSize={m}`
- `GET /api/v1/tenants/{tenantId}/scale-guard/advisory`
- `GET /api/v1/tenants/{tenantId}/webhooks/control/health`
- `GET /api/v1/tenants/{tenantId}/compliance/exports`
- `GET /api/v1/tenants/{tenantId}/compliance/exports/retention`

Feature-flag contract (default OFF):
1. `phase8_predictive_actions` gates predictive action read/write endpoints.
2. `phase8_ops_enhancements` gates insight/advisory dataset endpoints.

Predictive action dataset fields:
1. `action_id`
2. `tenant_id`
3. `branch_id`
4. `dataset` (`SLA`/`TREND`)
5. `metric`
6. `severity` (`INFO`/`WARN`/`CRITICAL`)
7. `status` (`OPEN`/`ACKNOWLEDGED`/`EXECUTED`/`DISMISSED`)
8. `title`
9. `description`
10. `recommendation`
11. `source_ref`
12. `created_at`
13. `updated_at`

Insights dataset fields:
1. summary:
   - `alertCount`
   - `actionCount`
   - `criticalActions`
   - `pendingQueue`
   - `offlineFallback`
2. severity legend:
   - `INFO`
   - `WARN`
   - `CRITICAL`
3. paginated action rows with `page`, `pageSize`, `totalRows`, `totalPages`, `limitMax`

Scale advisory fields:
1. `throughputClass` (`LOW`/`MEDIUM`/`HIGH`)
2. `avgReadLatencyMs`
3. `readSamples`
4. `cache.entries`
5. `cache.totalHits`
6. `cache.expiredEntries`
7. `cache.hitRatePct`
8. `hints[]`
9. `mode`

Compliance export governance fields:
1. `legal_hold_active`
2. `retention_days`
3. `retention_expires_at`
4. `immutable_record`

Compliance retention view fields:
1. `appendOnlyContract`
2. `retention` (policy object)
3. `legalHold.activeCount`
4. `legalHold.activeScopes`

---

## 6. Timezone and Period Semantics

1. Business day uses tenant timezone midnight-to-midnight.
2. Monthly report uses calendar month in tenant timezone.
3. Cross-tenant global reports normalize each tenant period before aggregation.

---

## 7. Versioning and Change Control

Any report formula/filter/column change requires:
1. catalog version update
2. reason and impact statement
3. approval entry in change log
4. updated validation tests

---

END OF DOCUMENT
