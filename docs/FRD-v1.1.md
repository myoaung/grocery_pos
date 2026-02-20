# Cosmic Forge Grocery POS
## Functional Requirements Document (FRD) v1.4

Version: v1.4  
Status: Draft for Review  
Date: 2026-02-20  
Owner: Application Owner  
Replaces: `docs/FRD.md` v1.0 summary

---

## 1. Purpose

This document defines testable functional and non-functional requirements for building the Cosmic Forge Grocery POS system.

Goals:
- remove ambiguity from v1.0 summary requirements
- define acceptance criteria per requirement
- create phase gates aligned to MES execution order

---

## 2. Scope

In scope:
- multi-tenant retail POS for Myanmar grocery/retail shops
- web + mobile clients
- offline-first sales and inventory workflows
- role-based access with tenant and branch isolation
- reporting, monitoring, backup, and auditability

Out of scope for baseline v1:
- payment gateway integrations
- white-label marketplace plugins
- advanced AI forecasting beyond defined optional reports

Phase 2 extension addendum (2026-02-20):
- Web dashboard management module (tenant/branch/user/admin controls)
- Advanced reporting module with templates, filters, CSV/PDF export
- Plugin architecture with sandbox payment gateway integration
- Offline conflict automation and alerting workflows

Phase 3 extension addendum (2026-02-20):
- In-app notification module (`FIAM`) for tablet/dashboard alerting.
- Notification scope covers loyalty updates, low-stock alerts, offline conflict/risk warnings, and system events.
- Traceability alias IDs are used to avoid collisions with existing FR-701..FR-705 operations scope:
  - `FR-701-NOT` loyalty notification
  - `FR-702-NOT` inventory low-stock notification
  - `FR-703-NOT` offline conflict/risk notification
  - `FR-704-NOT` system event notification
  - `FR-705-NOT` admin/dashboard notification display

Phase 4 extension addendum (2026-02-20):
- Loyalty and rewards engine with role-scoped accrual/redeem/balance workflows.
- Offline enhancements for loyalty/report queue items, explicit reconcile, and non-silent conflict visibility.
- Reporting extension templates with role filtering and export contract (`CSV`, `PDF`, `Printable`).
- Alias IDs are used for FR collisions with baseline FR-800/FR-801 branding requirements:
  - `FR-P4-801` .. `FR-P4-815` (maps to phase directive FR-801..FR-815).

Phase 5 prep addendum (2026-02-20):
- Phase 5 alias namespace is reserved as `FR-P5-816` .. `FR-P5-830`.
- No Phase 5 feature implementation is approved in this revision.
- Phase 5 artifacts are planning-only: FR definitions, TC mappings, and test skeletons remain `PENDING`.

---

## 3. Priority Model

- `P0` must-have for MVP go-live
- `P1` should-have for stable production
- `P2` optional enhancement

---

## 4. Non-Negotiable Constraints

1. No cross-tenant data access is allowed.
2. Offline sales and inventory capture must continue without internet.
3. Branding, tax, and pricing logic must be configuration-driven.
4. All privileged/configuration changes must be auditable.
5. UI must load logos/colors from services, not hardcoded assets.

---

## 5. Roles and Permission Baseline

Roles:
- `APPLICATION_OWNER`
- `TENANT_OWNER`
- `MANAGER`
- `CASHIER`
- `INVENTORY_STAFF`

Permission matrix baseline (`R` read, `C` create, `U` update, `D` delete, `A` approve, `-` no access):

| Module | Application Owner | Tenant Owner | Manager | Cashier | Inventory Staff |
|---|---|---|---|---|---|
| Tenant Settings | R/U | R/U | R | - | - |
| Branch Settings | R/U | R/U | R | - | - |
| User Management | R/U | R/U | R | - | - |
| Product Catalog | R/U | R/C/U/D | R/C/U | R | R/C/U |
| Inventory Ledger | R | R/C/U | R/C/U | R | R/C/U |
| Sales Checkout | R | R | R/C/U | R/C/U | - |
| Discounts | R/U | R/U | R/U | R (apply allowed rules) | - |
| Customers | R | R/C/U | R/C/U | R/C/U | R |
| Loyalty | R | R/U | R/U | R | - |
| Reports (Tenant) | R | R | R | R (limited) | R (inventory-only) |
| Reports (Global) | R | - | - | - | - |
| Config/Audit Logs | R | R (tenant only) | R (tenant limited) | - | - |

Acceptance criteria:
1. API authorization rejects actions outside matrix with HTTP 403.
2. Report access is scoped by role and tenant.
3. Permission changes are logged in audit logs with actor/time/diff.

---

## 6. Functional Requirements

### 6.1 Tenancy and Data Isolation

#### FR-001 Tenant Context Enforcement (P0)
Requirement:
- every tenant-scoped request must carry resolved `tenant_id`
- API and DB layers must enforce tenant scoping

Acceptance criteria:
1. All tenant business tables include `tenant_id` as `NOT NULL`.
2. Cross-tenant read/write attempts are denied and logged.
3. Integration test verifies tenant A cannot read tenant B records.

#### FR-002 Row-Level Security Policy (P0)
Requirement:
- database policies must enforce tenant isolation independent of API

Acceptance criteria:
1. RLS is enabled on tenant-scoped tables in production.
2. Policy tests show authenticated role can access only own tenant rows.
3. Privileged service role usage is limited to approved backend paths.

#### FR-003 Branch Isolation and Assignment (P0)
Requirement:
- a tenant may have multiple branches
- users and devices can be restricted to one or more branches

Acceptance criteria:
1. Sales, inventory logs, and reports include `branch_id`.
2. User not assigned to branch cannot transact in that branch.
3. Unauthorized branch access attempts are audited.

#### FR-004 Device Registration and Binding (P1)
Requirement:
- each active POS device must be registered and linked to tenant/branch

Acceptance criteria:
1. First login on unknown device triggers registration workflow.
2. Blocked/revoked devices cannot start new sales sessions.
3. Device status changes are audit logged.

### 6.2 Authentication and Access

#### FR-100 Authentication (P0)
Requirement:
- users must authenticate before any POS action

Acceptance criteria:
1. Unauthorized requests return HTTP 401.
2. Session includes user role, tenant, and branch context.
3. Session expiration forces re-authentication for protected actions.

#### FR-101 Role-Based Access Control (P0)
Requirement:
- enforce permissions per section 5 matrix

Acceptance criteria:
1. Backend checks permission on every protected endpoint.
2. UI hides disallowed actions based on effective permissions.
3. Security tests cover at least one denied case per role/module.

#### FR-102 Staff Lifecycle Management (P1)
Requirement:
- tenant owner/manager can activate, deactivate, and reset staff access

Acceptance criteria:
1. Deactivated users cannot authenticate.
2. Role changes take effect immediately on next token refresh.
3. Staff action history is available in audit report.

### 6.3 Product and Inventory

#### FR-200 Product Master Data (P0)
Requirement:
- product fields: SKU/barcode, MM/EN name, category, unit, cost, retail price, wholesale price, tax category, stock alert

Acceptance criteria:
1. SKU/barcode is unique within tenant.
2. Retail and wholesale prices must be >= 0.
3. Product create/update validates required fields and returns clear errors.

#### FR-201 Inventory Ledger Actions (P0)
Requirement:
- support stock-in, stock-out, adjustment, transfer, damage/loss
- negative stock is forbidden system-wide for v1

Acceptance criteria:
1. Each inventory action creates immutable ledger entry.
2. On-hand stock is derivable from ledger events.
3. Any operation that would produce negative on-hand stock is blocked.

#### FR-202 Stock Alerts (P1)
Requirement:
- notify when stock reaches configured alert level

Acceptance criteria:
1. Low-stock status updates within 1 minute of inventory change.
2. Alert is visible in dashboard and low-stock report.
3. Alert can be acknowledged and remains traceable.

#### FR-203 Branch Transfers (P1)
Requirement:
- transfer inventory between branches with source/destination traceability

Acceptance criteria:
1. Transfer records include source branch, destination branch, user, timestamp.
2. Transfer completes as paired outbound/inbound events.
3. Partial failure never produces one-sided stock movement.

### 6.4 Sales, Pricing, Tax, and Offline Sync

#### FR-300 Sales Checkout (P0)
Requirement:
- support retail and wholesale checkout flows
- checkout must not allow line items that would create negative stock

Acceptance criteria:
1. Cart supports mixed quantities and price tiers.
2. Sale total = subtotal - discounts + taxes (deterministic formula).
3. Completed sale produces receipt payload with tenant/branch info.
4. Checkout is blocked when requested quantity exceeds available stock.

#### FR-301 Pricing Rules (P0)
Requirement:
- pricing supports manual override and rule-driven discounts

Acceptance criteria:
1. Discount rule precedence is deterministic and documented.
2. Manual overrides require permission and are audit logged.
3. Rules can be enabled/disabled without deployment.

#### FR-302 Dynamic Tax Rules (P0)
Requirement:
- tax is configuration-driven with effective dates and categories

Acceptance criteria:
1. Tax engine selects rule by effective date and product tax category.
2. No tax rates are hardcoded in checkout code.
3. Historical sale recalculation uses tax snapshot stored at sale time.

#### FR-303 Offline Transaction Queue (P0)
Requirement:
- checkout and inventory writes must work during connectivity loss

Acceptance criteria:
1. Offline write creates local queued event with stable idempotency key.
2. User can continue checkout while offline with visible sync status.
3. Queue persists across app restart/device reboot.

#### FR-304 Sync and Conflict Resolution (P0)
Requirement:
- queued offline events must sync safely and deterministically

Acceptance criteria:
1. Replayed events are idempotent on server.
2. Conflict policy is defined per event type (sale finalization, stock adjust, customer update).
3. Failed events are retriable with clear user/admin workflow.

#### FR-305 Receipts and Invoices (P1)
Requirement:
- receipt/invoice branding must use tenant branding assets via BrandService

Acceptance criteria:
1. Receipt logo source is configuration-driven.
2. Receipt includes tax summary and payment totals.
3. Reprint reproduces original sale values exactly.

### 6.5 Customer and Loyalty

#### FR-400 Customer Profiles (P1)
Requirement:
- manage customer name, phone, visit history, and spending summary

Acceptance criteria:
1. Customer search supports phone and name prefix.
2. Customer profile shows purchase count and total spend.
3. Merge or dedup workflow prevents duplicate active records where possible.

#### FR-401 Loyalty Points Engine (P1)
Requirement:
- support points accrual, redemption, and balance tracking

Acceptance criteria:
1. Accrual formula is tenant-configurable.
2. Redemption cannot exceed available points.
3. Every points mutation is ledgered and auditable.

#### FR-402 Tier System (P2)
Requirement:
- customer tiers based on configurable thresholds

Acceptance criteria:
1. Tier recalculation runs automatically after qualifying purchases.
2. Tier change history is available in profile.
3. Tier benefits apply only when active.

### 6.6 Location and Usage Control

#### FR-500 Location Policy Evaluation (P1)
Requirement:
- evaluate usage risk from GPS, IP, and device fingerprint

Acceptance criteria:
1. Risk score is generated per login/session start.
2. Enforcement supports `WARN`, `READ_ONLY`, `BLOCK`.
3. Policy decision and factors are audit logged.

#### FR-501 VPN Risk Handling (P1)
Requirement:
- detect suspicious network behavior and allow controlled override

Acceptance criteria:
1. VPN/proxy indicators contribute to risk score.
2. Authorized override requires reason and expires automatically.
3. Override events are visible in abuse/risk reports.

### 6.7 Reports

#### FR-600 Mandatory Report Catalog (P0)
Requirement:
- implement fixed baseline reports:
  - tenant reports (8): daily sales, monthly sales, inventory status, low stock, profit summary, staff performance, customer loyalty, tax summary
  - application owner reports (8): tenant activity, revenue overview, system health, abuse and risk, growth metrics, feature usage, error rates, backup status

Acceptance criteria:
1. Each report has defined filters, columns, and formulas.
2. Access is role-scoped and tenant-scoped.
3. Report generation is logged with actor and parameters.

#### FR-601 Advanced Optional Reports (P2)
Requirement:
- support 3-4 optional reports: forecasting, trend analysis, comparative reports

Acceptance criteria:
1. Optional reports are feature-flagged.
2. Missing optional reports do not block MVP release.
3. Optional report calculations are documented before rollout.

#### FR-602 Report Export and Timezone (P1)
Requirement:
- reports must support export and timezone-consistent date boundaries

Acceptance criteria:
1. Export formats include CSV and PDF.
2. Date filters use tenant-configured timezone.
3. Totals are consistent between UI and export.

### 6.8 Monitoring, Reliability, and Security

#### FR-700 Monitoring Baseline (P0)
Requirement:
- collect health, performance, and error telemetry

Acceptance criteria:
1. API latency, error rate, and queue depth are tracked.
2. Critical alerts notify configured admin channel.
3. Dashboard shows system health and sync backlog.

#### FR-701 Backup and Recovery (P0)
Requirement:
- scheduled backups with restore verification

Acceptance criteria:
1. Backup schedule is configurable and monitored.
2. Restore drill is executed at least monthly in non-production.
3. Backup status appears in owner report.

#### FR-702 Safe Update Mechanism (P1)
Requirement:
- deployments must protect data integrity and allow rollback

Acceptance criteria:
1. DB migrations are versioned and reversible when possible.
2. Release includes rollback procedure.
3. Failed deployment does not corrupt committed sales data.

#### FR-703 Abuse Detection and Incident Trail (P1)
Requirement:
- suspicious events are detected and queryable

Acceptance criteria:
1. High-risk events generate incident records.
2. Incident record links actor, device, branch, and timestamps.
3. Incident lifecycle supports open/investigating/closed states.

### 6.9 Branding and UI Governance

#### FR-800 Brand Service Integration (P0)
Requirement:
- app and tenant branding assets are loaded through BrandService

Acceptance criteria:
1. UI contains no hardcoded logo file paths.
2. App brand and tenant brand are independently configurable.
3. Branding changes do not require code changes.

#### FR-801 Color and Theme Safety (P1)
Requirement:
- blue-based default theme with safe semantic color protection

Acceptance criteria:
1. Tenant theme cannot override destructive/warning semantic colors.
2. Light/dark mode support passes contrast checks.
3. Theme settings are configuration-driven.

### 6.10 Phase 4 Extension Requirements (Alias: FR-P4-801..815)

#### FR-P4-801 Loyalty Accrual API (P1)
Requirement:
- provide tenant/branch-scoped accrual endpoint with RBAC enforcement

Acceptance criteria:
1. Accrual writes loyalty ledger and reward history records.
2. Cashier cannot invoke privileged accrual write endpoint directly.
3. Mutation includes tenant/branch/user audit evidence.

#### FR-P4-802 Loyalty Redemption API (P1)
Requirement:
- provide role-scoped redemption endpoint with minimum and balance validation

Acceptance criteria:
1. Redemption blocks when balance or minimum policy is not met.
2. Cashier redemption write is denied.
3. Successful redemption records ledger + audit trail.

#### FR-P4-803 Loyalty Balance Query (P1)
Requirement:
- expose current loyalty balance and redeemable value by customer

Acceptance criteria:
1. Response includes customer points and redeemable amount.
2. Response is tenant/branch scoped.
3. Unauthorized cross-tenant requests are denied.

#### FR-P4-804 Loyalty Dashboard KPIs (P1)
Requirement:
- expose reward KPIs and recent history for dashboard monitoring

Acceptance criteria:
1. KPIs include accrued, redeemed, active members, net points.
2. Dashboard retrieves KPI data through API only.
3. KPI requests are audit logged.

#### FR-P4-805 Offline Loyalty Queueing (P0)
Requirement:
- queue loyalty operations while offline with idempotency key support

Acceptance criteria:
1. Queued payload captures operation, customer, points, reason, idempotency key.
2. Queue writes remain tenant/branch scoped.
3. Queue action creates offline event log entry.

#### FR-P4-806 Offline Report Request Queueing (P1)
Requirement:
- queue reporting extension requests for delayed processing

Acceptance criteria:
1. Queue payload includes template id and filter object.
2. Queue supports branch-scoped processing.
3. Queue action creates offline event log entry.

#### FR-P4-807 Offline Idempotent Reconcile (P0)
Requirement:
- offline reconcile must reject duplicate idempotency keys deterministically

Acceptance criteria:
1. Duplicate requests fail with explicit error state.
2. Duplicate reconcile attempts are audit logged.
3. No duplicate transaction records are created.

#### FR-P4-808 Offline Conflict Visibility (P0)
Requirement:
- offline loyalty conflicts must be non-silent and traceable

Acceptance criteria:
1. Conflict state produces queue `CONFLICT` status.
2. Conflict entry is visible in conflict listing endpoint.
3. Notification/event pipeline emits explicit conflict alert.

#### FR-P4-809 Offline UI State Indicators (P1)
Requirement:
- POS UI must show offline enhanced queue state and blocked/read-only context

Acceptance criteria:
1. UI displays pending/failed/conflict/confirmed counters.
2. Read-only/block modes disable mutation controls.
3. Offline indicator data is fetched from API state endpoints.

#### FR-P4-810 Reporting Extension Template Catalog (P1)
Requirement:
- expose phase4 reporting template metadata by role

Acceptance criteria:
1. Template list is filtered by role permissions.
2. Unauthorized template access returns 403.
3. Template metadata declares filters and export formats.

#### FR-P4-811 Reporting Extension Generation (P1)
Requirement:
- generate tenant/branch-scoped extension report data and snapshot evidence

Acceptance criteria:
1. Report generation stores snapshot with actor and filters.
2. Generated rows include loyalty or operations KPI data.
3. Report generation is audit logged.

#### FR-P4-812 Reporting Extension CSV Export (P1)
Requirement:
- extension reports must export CSV

Acceptance criteria:
1. Export endpoint returns `text/csv`.
2. CSV rows match report generation output.
3. Access follows role and tenant scope controls.

#### FR-P4-813 Reporting Extension PDF Export (P1)
Requirement:
- extension reports must export PDF

Acceptance criteria:
1. Export endpoint returns `application/pdf`.
2. PDF export is available for authorized roles only.
3. Export operation is audit logged.

#### FR-P4-814 Reporting Extension Printable Export (P1)
Requirement:
- extension reports must support printable HTML view

Acceptance criteria:
1. Printable export returns `text/html`.
2. Printable rows match generated report rows.
3. Printable export respects role/tenant scope.

#### FR-P4-815 POS + Dashboard Integration (P1)
Requirement:
- integrate loyalty/offline/reporting extension controls into POS and dashboard UI

Acceptance criteria:
1. POS displays loyalty balance and redemption popup flow.
2. Dashboard displays reward KPIs, offline enhanced state, and extension report controls.
3. E2E tests validate Phase 4 UI module visibility and behavior.

### 6.11 Phase 5 Preparation Requirements (Alias FR-P5-816..830)

Implementation readiness modules:
- POS runtime
- Offline engine
- Loyalty engine
- Reporting engine
- Dashboard extension shell

Planning-only FR aliases:
- `FR-P5-816` POS extension contracts
- `FR-P5-817` Offline retry policy registry
- `FR-P5-818` Loyalty rule versioning
- `FR-P5-819` Reporting filter policy engine
- `FR-P5-820` Unified conflict policy
- `FR-P5-821` Bulk reward adjustments
- `FR-P5-822` Dashboard module registry
- `FR-P5-823` Offline batch reconcile windows
- `FR-P5-824` Loyalty expiry scheduler
- `FR-P5-825` Reporting KPI plugin registry
- `FR-P5-826` POS phase5 UI shell
- `FR-P5-827` Dashboard phase5 UI shell
- `FR-P5-828` Offline replay simulator UX
- `FR-P5-829` Report payload signature auditability
- `FR-P5-830` Release-gate evidence bundle automation

Acceptance note:
- All `FR-P5-*` requirements remain `PENDING` until Phase 5 execution starts and evidence is captured.

---

## 7. Non-Functional Requirements

#### NFR-001 Checkout Performance (P0)
Acceptance criteria:
1. Online checkout submit p95 <= 2.0s for cart size up to 50 lines.
2. Offline checkout completion <= 2.0s (aligned with `ACP.md` AC-PERF-01).
3. Product scan/search response p95 <= 300ms under normal load.

#### NFR-002 Offline Continuity (P0)
Acceptance criteria:
1. POS can operate offline for at least 72 hours without data loss.
2. Local queue durability survives app restart and device reboot.

#### NFR-003 Sync Recovery Time (P1)
Acceptance criteria:
1. After reconnect, queued events begin syncing within 30 seconds.
2. p95 queue drain time <= 5 minutes for 1,000 pending events.

#### NFR-004 Availability (P1)
Acceptance criteria:
1. Cloud services monthly availability target >= 99.5%.
2. Planned maintenance windows are announced and logged.

#### NFR-005 Security Controls (P0)
Acceptance criteria:
1. Data in transit uses TLS.
2. Sensitive data at rest uses managed encryption.
3. Privileged actions require authenticated identity and are auditable.

#### NFR-006 Backup Objectives (P0)
Acceptance criteria:
1. RPO <= 24 hours.
2. RTO <= 4 hours for production recovery.

#### NFR-007 Localization (P1)
Acceptance criteria:
1. Product names support Myanmar and English fields.
2. Currency and date formatting are locale-aware.

---

## 8. Report Definitions Baseline

Each report must define:
- report id and owner
- source tables/views
- filters
- computed metrics formula
- timezone behavior
- export behavior

Minimum baseline report IDs:
- `REP-T-001` Daily Sales
- `REP-T-002` Monthly Sales
- `REP-T-003` Inventory Status
- `REP-T-004` Low Stock
- `REP-T-005` Profit Summary
- `REP-T-006` Staff Performance
- `REP-T-007` Customer Loyalty
- `REP-T-008` Tax Summary
- `REP-O-001` Tenant Activity
- `REP-O-002` Revenue Overview
- `REP-O-003` System Health
- `REP-O-004` Abuse and Risk
- `REP-O-005` Growth Metrics
- `REP-O-006` Feature Usage
- `REP-O-007` Error Rates
- `REP-O-008` Backup Status

Optional IDs (`P2`):
- `REP-A-001` Forecasting
- `REP-A-002` Trend Analysis
- `REP-A-003` Comparative Report
- `REP-A-004` Custom Advanced Report

---

## 9. Phase Gate Acceptance (Aligned to MES)

### Phase 0 Gate
- architecture and config model documented
- branding and audit baseline implemented
- no hardcoded tax/brand/pricing logic

### Phase 1 Gate
- FR-001, FR-002, FR-100, FR-101 passing

### Phase 2 Gate
- FR-200, FR-201 passing

### Phase 3 Gate
- FR-300, FR-301, FR-302, FR-303, FR-304 passing

### Phase 4 Gate
- FR-400 and FR-401 passing
- Phase 4 extension scope: FR-P4-801..FR-P4-815 passing with traceability evidence

### Phase 5 Gate
- role and staff management requirements stable
- Phase 5 planning artifacts (`FR-P5-816..FR-P5-830`) documented with `PENDING` traceability and skeleton tests

### Phase 6 Gate
- FR-600 passing for all mandatory reports

### Phase 7 Gate
- FR-700 and FR-701 passing with drill evidence

### Phase 8 Gate
- audit/version governance evidence available

---

## 10. Traceability and Evidence

For each requirement ID, maintain:
- linked test cases (`TC-*`)
- implementation references (PR/commit)
- validation artifacts (screenshots/log extracts where needed)

Release sign-off requires:
1. all `P0` requirements marked pass
2. no unresolved `P0` security/data integrity defects
3. stakeholder approval recorded in changelog

---

## 11. Open Decisions for Owner Review

1. Exact discount precedence when manual and automatic rules both apply.
2. Target channels for critical alerts (email, messaging app, both).
3. Default retention period for audit and incident records.

---

END OF DOCUMENT
