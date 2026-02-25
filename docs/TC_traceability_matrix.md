# Cosmic Forge Grocery POS
## TC Traceability Matrix v1.14 (Authoritative)

Version: v1.14  
Status: Active  
Date: 2026-02-21  
Owner: Application Owner  
Supersedes: `docs/TC_traceability_matrix_v1.1.md`  
Top Authority: `docs/CFGP-MES-v1.0.md`  
References: `docs/CFGP-MES-v1.0.md`, `docs/Release-Gatekeeper.md`, `docs/release_governance.md`, `docs/ACP.md`, `docs/FRD-v1.3.md`, `docs/report_catalog.md`, `docs/change_log.md`

---

## 1. Purpose

This starter matrix maps test cases (`TC-*`) to requirement/report IDs for:
- forward traceability (requirement -> test)
- backward traceability (test -> requirement/report)
- reasoning version control for future requirement and logic changes

---

## 2. Reasoning Version Control

Tags used in this matrix:
- `RV-*`: Reasoning Version tag (requirement/logic revision baseline)
- `DV-*`: Decision Version tag (decision record linked to change)

Initial baseline tags:
- `RV-2026.02.20.1`
- `DV-2026-0001`
- `RV-2026.02.20.2`
- `DV-2026-0002`
- `RV-2026.02.20.3`
- `DV-2026-0003`
- `RV-2026.02.20.4`
- `DV-2026-0004`
- `RV-2026.02.20.5`
- `DV-2026-0005`
- `RV-2026.02.20.6`
- `DV-2026-0006`
- `RV-2026.02.20.5.1`
- `DV-2026-0005.1`
- `RV-2026.02.20.6.1`
- `DV-2026-0006.1`
- `RV-2026.02.20.7`
- `DV-2026-0007`
- `RV-2026.02.20.8`
- `DV-2026-0008`
- `RV-2026.02.21.1`
- `DV-2026-0009`
- `RV-2026.02.21.2`
- `DV-2026-0010`

Update rules:
1. If requirement interpretation changes, bump `RV-*`.
2. If business decision changes (formula, policy, scope), add/replace `DV-*`.
3. Any row updated must include `Last Updated` date.

Status values:
- `PLANNED`
- `IN_PROGRESS`
- `PASS`
- `FAIL`
- `BLOCKED`

---

## 3. FR/NFR Traceability Starter

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-001-INT-001 | FR-001 | 1 | P0 | IT | Block cross-tenant read/write access | `test/phase1.api.test.ts` (`enforces tenant isolation and 403 for missing context`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-002-SEC-001 | FR-002 | 1 | P0 | SEC | Enforce tenant RLS policy isolation | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-003-INT-001 | FR-003 | 1 | P0 | IT | Restrict user actions to assigned branch | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-004-INT-001 | FR-004 | 1 | P1 | IT | Require device registration for unknown device | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-100-SEC-001 | FR-100 | 1 | P0 | SEC | Reject unauthenticated access to protected endpoints | `test/phase1.api.test.ts` (`enforces tenant isolation and 403 for missing context`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-101-SEC-001 | FR-101 | 1 | P0 | SEC | Enforce endpoint-level RBAC matrix decisions | `test/phase1.api.test.ts` (`enforces RBAC for cashier and owner checkout restrictions`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-102-INT-001 | FR-102 | 5 | P1 | IT | Deactivated user cannot authenticate | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-200-UT-001 | FR-200 | 2 | P0 | UT | Validate product required fields and price rules | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-201-INT-001 | FR-201 | 2 | P0 | IT | Inventory ledger replay equals computed on-hand stock | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-202-INT-001 | FR-202 | 2 | P1 | IT | Trigger low-stock alert at configured threshold | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-203-INT-001 | FR-203 | 2 | P1 | IT | Ensure transfer creates paired outbound/inbound events | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-300-E2E-001 | FR-300 | 3 | P0 | E2E | Complete retail and wholesale checkout flow | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-301-INT-001 | FR-301 | 3 | P0 | IT | Apply deterministic discount precedence rules | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-302-UT-001 | FR-302 | 3 | P0 | UT | Resolve tax rule by effective date and tax category | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-303-E2E-001 | FR-303 | 3 | P0 | E2E | Queue offline sale/inventory event and persist locally | `test/phase1.api.test.ts` (`supports offline queue, conflict visibility, and read-only fallback`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-304-INT-001 | FR-304 | 3 | P0 | IT | Idempotent replay rejects duplicate UUIDs with explicit 409 and preserves stock integrity | `test/phase1.api.test.ts` (`rejects duplicate idempotency replay, preserves stock integrity, and remains tenant-isolated`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-305-E2E-001 | FR-305 | 3 | P1 | E2E | Generate receipt with config-driven brand asset | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-400-INT-001 | FR-400 | 4 | P1 | IT | Search customer by name/phone and view history | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-401-INT-001 | FR-401 | 4 | P1 | IT | Validate points accrual/redemption and ledger auditability | `test/phase4.modules.test.ts` (`supports loyalty accrual/redeem/balance with RBAC enforcement`) | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-402-INT-001 | FR-402 | 4 | P2 | IT | Recalculate tier after qualifying purchases | `test/phase4.modules.test.ts` (`supports loyalty accrual/redeem/balance with RBAC enforcement`) | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-500-SEC-001 | FR-500 | 7 | P1 | SEC | Enforce risk policy actions WARN/READ_ONLY/BLOCK with backend deny paths and UI lock cues | `test/phase1.api.test.ts` (`enforces WARN/READ_ONLY/BLOCK risk modes with audit evidence and UI lock cues`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-501-SEC-001 | FR-501 | 7 | P1 | SEC | Require reason and expiry for risk override | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-600-INT-001 | FR-600 | 6 | P0 | IT | Verify all mandatory report IDs are implemented | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-601-INT-001 | FR-601 | 6 | P2 | IT | Confirm optional reports are feature-flag controlled | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-602-INT-001 | FR-602 | 6 | P1 | IT | Validate CSV/PDF export support and report access controls | `test/phase1.api.test.ts` (`enforces report access and supports CSV/PDF export`) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PASS |
| TC-FR-700-OPS-001 | FR-700 | 7 | P0 | OPS | Confirm health metrics and critical alerts are emitted | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-701-OPS-001 | FR-701 | 7 | P0 | OPS | Execute backup and validate restore drill evidence | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-702-OPS-001 | FR-702 | 7 | P1 | OPS | Validate rollback procedure for failed deployment | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-703-SEC-001 | FR-703 | 7 | P1 | SEC | Track incident lifecycle open->investigating->closed | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-800-INT-001 | FR-800 | 0 | P0 | IT | Block hardcoded logos and load via BrandService | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-801-UT-001 | FR-801 | 0 | P1 | UT | Prevent tenant theme override of semantic safety colors | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-001-PERF-001 | NFR-001 | 3 | P0 | PERF | Checkout submit p95 within target threshold | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-002-OPS-001 | NFR-002 | 3 | P0 | OPS | Operate offline for 72 hours without data loss | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-003-PERF-001 | NFR-003 | 3 | P1 | PERF | Sync start and queue-drain targets after reconnect | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-004-OPS-001 | NFR-004 | 7 | P1 | OPS | Monthly availability target measurement | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-005-SEC-001 | NFR-005 | 7 | P0 | SEC | Verify TLS, encryption at rest, and privileged auth | `docs/risk_register.md` (TLS MITIGATED via Supabase + HTTPS; at-rest ACCEPTED as platform-managed, approver/date recorded) | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-25 | PASS |
| TC-NFR-006-OPS-001 | NFR-006 | 7 | P0 | OPS | Validate RPO/RTO compliance via drill evidence | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-007-UAT-001 | NFR-007 | 5 | P1 | UAT | Confirm MM/EN localization and locale formats | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |

### 3.1 Phase 2 Epic Traceability (Web Dashboard / Advanced Reports / Plugins / Offline Automation)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-701-INT-001 | FR-P2-WD-701 | 2 | P1 | IT | Dashboard KPI and chart endpoints return tenant/branch-scoped data | `test/phase2.modules.test.ts` (`supports dashboard tenant/branch/user management with RBAC and tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-702-INT-002 | FR-P2-WD-702 | 2 | P1 | IT | Branch and user CRUD endpoints enforce role restrictions | `test/phase2.modules.test.ts` (`supports dashboard tenant/branch/user management with RBAC and tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-703-INT-003 | FR-P2-WD-703 | 2 | P1 | IT | Manager cannot assign/create owner roles | `test/phase2.modules.test.ts` (`supports dashboard tenant/branch/user management with RBAC and tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-704-INT-004 | FR-P2-WD-704 | 2 | P1 | IT | Tenant branding update endpoint is service-driven and audited | `src/modules/dashboard/dashboardRoutes.ts`, `src/modules/dashboard/dashboardService.ts` | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-705-E2E-005 | FR-P2-WD-705 | 2 | P1 | E2E | Web dashboard shell renders control modules for Phase 2 | `e2e/phase2.dashboard.spec.ts` (`renders phase2 dashboard shell`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-706-INT-006 | FR-P2-WD-706 | 2 | P2 | IT | Tenant settings module supports timezone/currency updates | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-707-INT-007 | FR-P2-WD-707 | 2 | P2 | IT | User role bulk import/export workflow | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-708-INT-008 | FR-P2-WD-708 | 2 | P2 | IT | Dashboard custom widget preferences persist per user | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-709-INT-009 | FR-P2-WD-709 | 2 | P2 | IT | Branch archival workflow prevents new transactions on archived branch | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-710-INT-010 | FR-P2-WD-710 | 2 | P2 | IT | Dashboard audit view supports actor/action filters | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-801-INT-001 | FR-P2-AR-801 | 2 | P1 | IT | Advanced report templates endpoint returns filters and export contract | `test/phase2.modules.test.ts` (`supports advanced reporting templates, filters, exports, and comparative access controls`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-802-INT-002 | FR-P2-AR-802 | 2 | P1 | IT | Comparative report enforces cross-tenant scope authorization | `test/phase2.modules.test.ts` (`supports advanced reporting templates, filters, exports, and comparative access controls`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-803-INT-003 | FR-P2-AR-803 | 2 | P1 | IT | Advanced report export supports CSV and PDF | `test/phase2.modules.test.ts` (`supports advanced reporting templates, filters, exports, and comparative access controls`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-804-E2E-004 | FR-P2-AR-804 | 2 | P1 | E2E | Dashboard report module renders REP-A templates | `e2e/phase2.dashboard.spec.ts` (`loads dashboard data with manager context`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-805-INT-005 | FR-P2-AR-805 | 2 | P2 | IT | Forecast report supports horizon parameterization | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-806-INT-006 | FR-P2-AR-806 | 2 | P2 | IT | Trend report supports seasonality decomposition metadata | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-807-INT-007 | FR-P2-AR-807 | 2 | P2 | IT | Comparative normalization documents baseline assumptions | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-808-INT-008 | FR-P2-AR-808 | 2 | P2 | IT | Advanced report caching policy preserves tenant isolation | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-809-INT-009 | FR-P2-AR-809 | 2 | P2 | IT | Report scheduling supports timezone-safe boundaries | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-810-INT-010 | FR-P2-AR-810 | 2 | P2 | IT | Report access audit includes filter payload hash | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-901-INT-001 | FR-P2-PLG-901 | 2 | P1 | IT | Plugin catalog endpoint returns discoverable plugin metadata | `test/phase2.modules.test.ts` (`supports plugin registration and sandbox payment processing with tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-902-INT-002 | FR-P2-PLG-902 | 2 | P1 | IT | Tenant plugin registration endpoint persists enabled plugin state | `test/phase2.modules.test.ts` (`supports plugin registration and sandbox payment processing with tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-903-INT-003 | FR-P2-PLG-903 | 2 | P1 | IT | Sandbox payment plugin processes approve/decline outcomes | `test/phase2.modules.test.ts` (`supports plugin registration and sandbox payment processing with tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-904-INT-004 | FR-P2-PLG-904 | 2 | P1 | IT | Plugin payment calls are blocked on cross-tenant path access | `test/phase2.modules.test.ts` (`supports plugin registration and sandbox payment processing with tenant isolation`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-905-INT-005 | FR-P2-PLG-905 | 2 | P2 | IT | Plugin disable state blocks execution | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-906-INT-006 | FR-P2-PLG-906 | 2 | P2 | IT | Plugin version upgrade preserves tenant registration | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-907-INT-007 | FR-P2-PLG-907 | 2 | P2 | IT | Plugin execution timeout produces deterministic error contract | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-908-INT-008 | FR-P2-PLG-908 | 2 | P2 | IT | Marketplace plugin registration uses same tenant isolation controls | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-909-INT-009 | FR-P2-PLG-909 | 2 | P2 | IT | Plugin execution audit includes request/response reference IDs | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-910-INT-010 | FR-P2-PLG-910 | 2 | P2 | IT | Plugin sandbox mode can be forced per environment | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-1001-INT-001 | FR-P2-OFF-1001 | 2 | P1 | IT | Offline automation run endpoint executes queue sync and returns summary | `test/phase2.modules.test.ts` (`automates offline conflict/duplicate detection and alert lifecycle with audit evidence`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-1002-INT-002 | FR-P2-OFF-1002 | 2 | P1 | IT | Duplicate UUID replay events raise read-only enforcement alerts | `test/phase2.modules.test.ts` (`automates offline conflict/duplicate detection and alert lifecycle with audit evidence`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-1003-INT-003 | FR-P2-OFF-1003 | 2 | P1 | IT | Offline alerts are listable and acknowledgeable by manager/owner | `test/phase2.modules.test.ts` (`automates offline conflict/duplicate detection and alert lifecycle with audit evidence`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-1004-SEC-004 | FR-P2-OFF-1004 | 2 | P1 | SEC | Offline automation writes tenant-aware audit records | `test/phase2.modules.test.ts` (`automates offline conflict/duplicate detection and alert lifecycle with audit evidence`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-1005-E2E-005 | FR-P2-OFF-1005 | 2 | P1 | E2E | Phase 2 dashboard exposes automation controls and alert panel | `e2e/phase2.dashboard.spec.ts` (`renders phase2 dashboard shell`) | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PASS |
| TC-FR-1006-INT-006 | FR-P2-OFF-1006 | 2 | P2 | IT | Automation mode escalates to BLOCK after repeated sync failures | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-1007-INT-007 | FR-P2-OFF-1007 | 2 | P2 | IT | Automation supports policy-driven auto-resolution by conflict type | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-1008-INT-008 | FR-P2-OFF-1008 | 2 | P2 | IT | Queue backlog alerts include SLA age buckets | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-1009-INT-009 | FR-P2-OFF-1009 | 2 | P2 | IT | Automation supports branch-level throttled retry windows | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |
| TC-FR-1010-INT-010 | FR-P2-OFF-1010 | 2 | P2 | IT | Automation evidence bundle is exportable for release gate | TBD | RV-2026.02.20.2 | DV-2026-0002 | 2026-02-20 | PLANNED |

### 3.2 Phase 3 Notification Traceability

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-701-NOT-001 | FR-701-NOT | 3 | P1 | IT | Loyalty points updates generate FIAM notifications in tenant/branch scope | `test/phase3.notifications.test.ts` (`creates trigger-based notifications from loyalty, low-stock, conflict, and risk events`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |
| TC-FR-702-NOT-001 | FR-702-NOT | 3 | P1 | IT | Inventory low-stock transitions trigger notifications for scoped roles | `test/phase3.notifications.test.ts` (`creates trigger-based notifications from loyalty, low-stock, conflict, and risk events`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |
| TC-FR-703-NOT-001 | FR-703-NOT | 3 | P1 | IT | Offline conflict/risk mode changes produce WARN/READ_ONLY/BLOCK notifications | `test/phase3.notifications.test.ts` (`creates trigger-based notifications from loyalty, low-stock, conflict, and risk events`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |
| TC-FR-704-NOT-001 | FR-704-NOT | 3 | P1 | IT | System event notification trigger API is idempotent and role-restricted | `test/phase3.notifications.test.ts` (`triggers FIAM-style notifications with idempotent deduplication and read flow`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |
| TC-FR-705-NOT-001 | FR-705-NOT | 3 | P1 | E2E | Notifications UI displays feed, trigger controls, and state banners | `e2e/phase3.notifications.spec.ts` (`renders notifications center shell`, `submits a manual notification trigger and shows it in feed`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |
| TC-FR-706-NOT-001 | FR-706-NOT | 3 | P1 | IT | Notification delivery queue retries pending records after connectivity restore | `test/phase3.notifications.test.ts` (`queues notification delivery while offline and flushes on retry when online`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |
| TC-FR-707-NOT-001 | FR-707-NOT | 3 | P1 | SEC | Notification feed enforces tenant/branch isolation and RBAC | `test/phase3.notifications.test.ts` (`keeps notification feeds tenant/branch scoped and serves phase3 UI module assets`) | RV-2026.02.20.3 | DV-2026-0003 | 2026-02-20 | PASS |

### 3.3 Phase 4 Loyalty, Offline & Reporting Traceability

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-801-LR-001 | FR-P4-801 | 4 | P1 | IT | Loyalty points accrual per transaction | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-802-LR-002 | FR-P4-802 | 4 | P1 | IT | Redeemable rewards calculation and ledger update | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-803-LR-003 | FR-P4-803 | 4 | P1 | IT | Loyalty tier recalculation after qualifying purchases | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-804-OFF-001 | FR-P4-804 | 4 | P1 | IT | Offline queue sync for sales and inventory events | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-805-OFF-002 | FR-P4-805 | 4 | P1 | IT | Offline conflict detection triggers alerts and prevents double-post | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-806-OFF-003 | FR-P4-806 | 4 | P2 | IT | Offline sync respects branch/tenant isolation | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-807-REP-001 | FR-P4-807 | 4 | P1 | IT | Reporting extensions expose additional metrics and filters | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-808-REP-002 | FR-P4-808 | 4 | P1 | IT | CSV/PDF export supports new reporting fields | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-809-REP-003 | FR-P4-809 | 4 | P2 | IT | Report access honors RBAC and tenant scoping | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-810-LR-004 | FR-P4-810 | 4 | P1 | E2E | Loyalty points UI update after redemption | `e2e/phase4.extensions.spec.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-811-OFF-004 | FR-P4-811 | 4 | P1 | E2E | Offline queue replay triggers correct inventory adjustments | `e2e/phase4.extensions.spec.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-812-REP-004 | FR-P4-812 | 4 | P1 | E2E | Reporting UI renders extension metrics with filters | `e2e/phase4.extensions.spec.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-813-LR-005 | FR-P4-813 | 4 | P2 | IT | Loyalty points expiry rules enforced and audited | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-814-OFF-005 | FR-P4-814 | 4 | P2 | IT | Offline sync failure escalation follows BLOCK/WARN policies | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |
| TC-FR-815-REP-005 | FR-P4-815 | 4 | P2 | IT | Reporting extensions audit logs include filter and payload references | `test/phase4.modules.test.ts` | RV-2026.02.20.4 | DV-2026-0004 | 2026-02-20 | PASS |

### 3.4 Phase 5 Runtime Traceability (FR-P5-816..FR-P5-830)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-816-INT-001 | FR-P5-816 | 5 | P1 | IT | Advanced discount engine applies stackable rules deterministically | `[INT] test/phase5.modules.test.ts` (`FR-P5-816: calculates stacked discounts correctly`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-817-INT-001 | FR-P5-817 | 5 | P1 | IT | Loyalty points state contributes to discount synergy percentage | `[INT] test/phase5.modules.test.ts` (`FR-P5-817: integrates loyalty points with discount rules`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-818-INT-001 | FR-P5-818 | 5 | P0 | IT | Cashier cannot apply manual discount override but can run baseline discount evaluation | `[INT] test/phase5.modules.test.ts` (`FR-P5-818: blocks cashier manual override while keeping baseline discount operations`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-819-INT-001 | FR-P5-819 | 5 | P1 | IT | Multi-store sales summary aggregates branch data under tenant scope | `[INT] test/phase5.modules.test.ts` (`FR-P5-819: aggregates branch sales across tenant scope`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-820-INT-001 | FR-P5-820 | 5 | P1 | IT | Multi-store report RBAC allows inventory staff and blocks cashier | `[INT] test/phase5.modules.test.ts` (`FR-P5-820: enforces multi-store reporting RBAC by role`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-821-INT-001 | FR-P5-821 | 5 | P0 | IT | Risk/compliance policies are upserted with tenant and branch enforcement | `[INT] test/phase5.modules.test.ts` (`FR-P5-821: upserts risk policies with tenant/branch enforcement`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-822-INT-001 | FR-P5-822 | 5 | P0 | IT | WARN mode allows operation and returns explicit warning mode state | `[INT] test/phase5.modules.test.ts` (`FR-P5-822: allows operations in WARN mode with explicit alert semantics`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-823-INT-001 | FR-P5-823 | 5 | P0 | IT | READ_ONLY mode denies write operations with explicit non-silent response | `[INT] test/phase5.modules.test.ts` (`FR-P5-823: enforces READ_ONLY write locks`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-824-INT-001 | FR-P5-824 | 5 | P0 | IT | BLOCK mode denies restricted operations with HTTP 403 and policy reason | `[INT] test/phase5.modules.test.ts` (`FR-P5-824: enforces BLOCK restrictions with 403 responses`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-825-INT-001 | FR-P5-825 | 5 | P2 | IT | Compliance event feed records mode/decision and is role-restricted | `[INT] test/phase5.modules.test.ts` (`FR-P5-825: records compliance events and restricts event feed access`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-826-E2E-001 | FR-P5-826 | 5 | P1 | E2E | POS phase5 panel applies advanced discounts and surfaces loyalty synergy in UI payload | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`FR-P5-826: POS applies advanced discounts with loyalty synergy`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-827-E2E-001 | FR-P5-827 | 5 | P1 | E2E | Dashboard phase5 module renders and executes multi-store report generation flow | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`FR-P5-827: Dashboard shows multi-store aggregated reporting module`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-828-E2E-001 | FR-P5-828 | 5 | P0 | E2E | Risk lock flow shows BLOCK state in dashboard and leaves audit evidence | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`FR-P5-828: Risk compliance lock evaluation shows BLOCK mode and logs audit evidence`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-829-INT-001 | FR-P5-829 | 5 | P2 | IT | Multi-store report audit entries include filter/payload reference tokens | `[INT] test/phase5.modules.test.ts` (`FR-P5-829: writes report audit entries with filter/payload references`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |
| TC-FR-830-INT-001 | FR-P5-830 | 5 | P1 | IT | Multi-store report exports produce CSV/PDF artifacts matching endpoint contract | `[INT] test/phase5.modules.test.ts` (`FR-P5-830: exports multi-store reports in CSV and PDF`) | RV-2026.02.20.5 | DV-2026-0005 | 2026-02-20 | PASS |

### 3.4.1 Phase 5.1 Hardening Evidence (No New FR IDs)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-816-INT-002 | FR-P5-816 | 5.1 | P1 | IT | Exact base cap boundary applies without false cap rejection | `[INT] test/phase5_1.hardening.test.ts` (`base automatic cap exact boundary`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |
| TC-FR-816-INT-003 | FR-P5-816 | 5.1 | P1 | IT | Exact promo cap boundary applies without false cap rejection | `[INT] test/phase5_1.hardening.test.ts` (`promo cap exact boundary`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |
| TC-FR-818-INT-002 | FR-P5-818 | 5.1 | P1 | IT | Discount rejection returns machine + UI readable reason codes | `[INT] test/phase5_1.hardening.test.ts` (`invalid manual override reasonCode`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |
| TC-FR-819-PERF-002 | FR-P5-819 | 5.1 | P1 | PERF | Multi-store report aggregation load test meets configured hard threshold at mocked scale | `[INT][PERF] test/phase5_1.hardening.test.ts` (`mocked-scale aggregation budget`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |
| TC-FR-825-INT-002 | FR-P5-825 | 5.1 | P1 | IT | Audit entries expose severity classification and remain read-only | `[INT] test/phase5_1.hardening.test.ts` (`audit severity classification`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |
| TC-FR-826-E2E-002 | FR-P5-826 | 5.1 | P1 | E2E | POS UI shows discount rule breakdown and policy reason visibility | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`Phase 5.1 discount breakdown`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |
| TC-FR-827-E2E-002 | FR-P5-827 | 5.1 | P1 | E2E | Dashboard exposes read-only admin audit panel | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`Phase 5.1 admin audit view`) | RV-2026.02.20.5.1 | DV-2026-0005.1 | 2026-02-20 | PASS |

### 3.5 Phase 6 Hardening & Scale Traceability (FR-P6-901..FR-P6-920)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-901-SEC-001 | FR-P6-901 | 6 | P0 | SEC | Audit trail is append-only with immutable chain metadata | `[INT] test/phase6.security.test.ts` (`FR-P6-901`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-902-SEC-001 | FR-P6-902 | 6 | P1 | SEC | Audit chain verification detects tamper/break conditions | `[UNIT][INT] src/services/auditService.ts`, `test/phase6.security.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-903-SEC-001 | FR-P6-903 | 6 | P1 | SEC | Security/compliance event endpoints are read-only | `[INT] test/phase6.security.test.ts` (`FR-P6-904 read-only contract`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-904-SEC-001 | FR-P6-904 | 6 | P0 | SEC | Risk events are classified as INFO/WARN/CRITICAL | `[INT] test/phase6.security.test.ts` (`FR-P6-904`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-905-SEC-001 | FR-P6-905 | 6 | P1 | SEC | Security events endpoint enforces tenant scope and RBAC | `[INT] test/phase6.security.test.ts` (`cashier denied for security events feed`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-906-SEC-001 | FR-P6-906 | 6 | P0 | SEC | Risk enforcement feature flag disables policy lock non-silently | `[INT] test/phase6.security.test.ts` (`risk enforcement flag disables block header path`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-907-INT-001 | FR-P6-907 | 6 | P0 | IT | Tenant-scoped feature flag service supports read/write governance | `[INT] test/phase6.security.test.ts` (`FR-P6-907`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-908-INT-001 | FR-P6-908 | 6 | P1 | IT | Advanced discounts fail closed when feature flag is disabled | `[INT] test/phase6.security.test.ts` (`FEATURE_FLAG_DISABLED for discounts`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-909-INT-001 | FR-P6-909 | 6 | P1 | IT | Loyalty mutations fail closed when feature flag is disabled | `[INT] test/phase6.security.test.ts` (`FEATURE_FLAG_DISABLED for loyalty`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-910-OPS-001 | FR-P6-910 | 6 | P1 | OPS | Release promotion, artifact versioning, and rollback policy are defined | `[INT][DOC] docs/release_governance.md` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-911-PERF-001 | FR-P6-911 | 6 | P1 | PERF | Multi-store reporting enforces pagination and response budget guardrails | `[INT] test/phase6.performance.test.ts` (`FR-P6-911`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-912-INT-001 | FR-P6-912 | 6 | P0 | IT | Offline status exposes retry/backoff/replay SLA policy | `[INT] test/phase6.performance.test.ts` (`FR-P6-912`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-913-UI-001 | FR-P6-913 | 6 | P1 | UI | POS UI surfaces prolonged offline warnings with explicit guidance | `[UI][INT] web/app.js`, `test/phase6.performance.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-914-INT-001 | FR-P6-914 | 6 | P0 | IT | Replay-window expiry blocks stale queue replay and emits escalation | `[INT] test/phase6.chaos.test.ts` (`FR-P6-917 replay expiry path`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-915-CHAOS-001 | FR-P6-915 | 6 | P1 | IT | Backoff window defers retry processing under network-loss simulation | `[INT] test/phase6.chaos.test.ts` (`FR-P6-915`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-916-CHAOS-001 | FR-P6-916 | 6 | P0 | IT | Duplicate sync storm remains idempotent and auditable | `[INT] test/phase6.chaos.test.ts` (`FR-P6-916`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-917-CHAOS-001 | FR-P6-917 | 6 | P1 | IT | Retry exhaustion/replay expiry produce explicit offline SLA escalation alerts | `[INT] test/phase6.chaos.test.ts` (`FR-P6-917`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-918-CHAOS-001 | FR-P6-918 | 6 | P1 | IT | Mid-session risk policy flip is explicit and audit-visible | `[INT] test/phase6.chaos.test.ts` (`FR-P6-918`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-919-UI-001 | FR-P6-919 | 6 | P1 | UI | Accessibility baseline and error severity hierarchy are governed | `[UI][DOC] docs/ui_guidelines.md` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-920-OPS-001 | FR-P6-920 | 6 | P0 | OPS | Phase 6 FR aliases are fully traced with PASS evidence and no pending gaps | `[INT][DOC] docs/TC_traceability_matrix.md`, `docs/change_log.md` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |

### 3.6 Phase 6.1 Operational Readiness Evidence (No New FR IDs)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-902-SEC-002 | FR-P6-902 | 6.1 | P0 | IT | Read-only audit integrity endpoint reports chain and downgrade checks | `[INT] test/phase6_1.operational.test.ts` (`read-only audit integrity verification endpoint`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-904-SEC-002 | FR-P6-904 | 6.1 | P1 | IT | Simulated CRITICAL incident captures DETECT/CLASSIFY/RESPOND/RESOLVE lifecycle evidence | `[INT] test/phase6_1.operational.test.ts` (`simulates one CRITICAL incident lifecycle`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-912-OPS-002 | FR-P6-912 | 6.1 | P1 | IT | SLI/SLO metadata and structured metrics expose offline retry and escalation indicators | `[INT] test/phase6_1.operational.test.ts` (`defines and exposes operational SLI/SLO contracts`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-915-CHAOS-002 | FR-P6-915 | 6.1 | P1 | IT | 10h simulated soak load preserves queue/audit integrity and emits metrics | `[INT][SOAK] test/phase6_1.operational.test.ts` (`runs 10h simulated soak load`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-920-INT-002 | FR-P6-920 | 6.1 | P0 | IT | Upgrade path from Phase 5 runtime flows into Phase 6 controls remains compatible | `[INT] test/phase6_1.operational.test.ts` (`verifies upgrade-path compatibility`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-816-INT-004 | FR-P5-816 | 6.1 | P1 | IT | Policy preview endpoint is read-only/cacheable and reasonCode enums stay stable under localization | `[INT] test/phase5_1.hardening.test.ts` (`policy preview cache + reasonCode stability`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-919-CHAOS-002 | FR-P6-919 | 6.1 | P1 | IT | Corrupted discount policy fails closed with explicit reason code | `[INT][CHAOS] test/phase6.chaos.test.ts` (`fails closed when discount policy is corrupted`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-920-CHAOS-002 | FR-P6-920 | 6.1 | P1 | IT | Audit overflow simulation keeps chain valid and downgrade count at zero | `[INT][CHAOS] test/phase6.chaos.test.ts` (`handles audit-volume overflow simulation`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-826-E2E-003 | FR-P5-826 | 6.1 | P1 | E2E | Cashier UI shows stable explanation code on discount rejection (snapshot-style evidence) | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`cashier receives minimal explanation code`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-825-E2E-003 | FR-P5-825 | 6.1 | P1 | E2E | Dashboard severity filter renders CRITICAL audit rows; non-admin role cannot access admin audit UI | `[E2E][UI] e2e/phase5.extensions.spec.ts` (`dashboard severity filter`, `admin audit viewer hidden`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-826-E2E-004 | FR-P5-826 | 6.1 | P1 | E2E | Mobile/tablet layout preserves offline status visibility and discount transparency | `[E2E][UI][MOBILE] e2e/phase5.extensions.spec.ts` (`mobile: offline status and discount transparency remain visible`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |

### 3.7 Phase 6 Traceability (Expansion FR-P6-921..FR-P6-933)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-P6-921-INT | FR-P6-921 | 6 | P1 | IT | Tenant-level read scaling abstraction emits read source and cache-hit metadata | `[INT][PERF] test/phase6.modules.test.ts`, `test/phase6.performance.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-922-INT | FR-P6-922 | 6 | P0 | IT | Background aggregation jobs enqueue asynchronously and persist snapshots | `[INT][PERF] test/phase6.modules.test.ts`, `test/phase6.performance.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-923-INT | FR-P6-923 | 6 | P0 | IT | External audit export is read-only, tenant-scoped, and CSV/JSON capable | `[INT][SEC] test/phase6.modules.test.ts`, `test/phase6.security.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-924-INT | FR-P6-924 | 6 | P1 | IT | Retention policy configuration validates bounds and records audit evidence | `[INT] test/phase6.modules.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-925-INT | FR-P6-925 | 6 | P1 | IT | Tenant SLA metrics endpoint returns read-only operational snapshot | `[INT] test/phase6.modules.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-926-INT | FR-P6-926 | 6 | P1 | IT | Historical trend reporting supports non-AI tenant metrics | `[INT] test/phase6.modules.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-927-INT | FR-P6-927 | 6 | P1 | IT | Comparative period analysis returns deterministic current/previous windows | `[INT] test/phase6.modules.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-928-INT | FR-P6-928 | 6 | P2 | IT | Export-ready analytics datasets support CSV and JSON parity | `[INT] test/phase6.modules.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-929-INT | FR-P6-929 | 6 | P0 | IT | Outbound webhook registry/dispatch is tenant-scoped and idempotent | `[INT] test/phase6.modules.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-930-INT | FR-P6-930 | 6 | P0 | IT | Webhook signature verification and retry semantics are enforced | `[INT][SEC] test/phase6.modules.test.ts`, `test/phase6.security.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-931-INT | FR-P6-931 | 6 | P1 | IT | Webhook failure chaos path preserves retry state without duplicate fan-out | `[INT][CHAOS] test/phase6.chaos.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-932-INT | FR-P6-932 | 6 | P1 | IT | Aggregation timeout simulation persists timeout state and error code | `[INT][CHAOS] test/phase6.chaos.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-933-INT | FR-P6-933 | 6 | P2 | IT | Cache eviction chaos path forces cache miss and controlled rebuild | `[INT][CHAOS] test/phase6.chaos.test.ts` | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-926-E2E | FR-P6-926 | 6 | P1 | E2E | End-to-end analytics trend and export flow works with feature flags | `[E2E] e2e/phase6.extensions.spec.ts` (`analytics trends and exports`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-929-E2E | FR-P6-929 | 6 | P0 | E2E | End-to-end outbound webhook dispatch remains idempotent and verifiable | `[E2E] e2e/phase6.extensions.spec.ts` (`outbound webhook dispatch`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |
| TC-FR-P6-922-E2E | FR-P6-922 | 6 | P0 | E2E | End-to-end background aggregation job completion exposes snapshots | `[E2E] e2e/phase6.extensions.spec.ts` (`background aggregation jobs`) | RV-2026.02.20.6 | DV-2026-0006 | 2026-02-20 | PASS |

### 3.8 Phase 6.1 Non-Functional Hardening Evidence (Existing FR IDs Only)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-P6-921-INT-002 | FR-P6-921 | 6.1 | P1 | IT | ScaleGuard contract tests enforce tenant-safe cache semantics and prefix eviction behavior | `[UNIT][INT] test/scaleGuard.contract.test.ts` | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-922-INT-002 | FR-P6-922 | 6.1 | P0 | IT | Background aggregation and retention jobs use system actor identity and emit job metrics | `[INT] test/phase6.modules.test.ts` (`system-actor aggregation + retention purge metrics`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-924-OPS-002 | FR-P6-924 | 6.1 | P1 | OPS | Retention purge scheduler runs policy-scoped automatic cleanup as an additive safeguard | `[INT][OPS] src/jobs/retention/retentionPurgeScheduler.ts`, `test/phase6.modules.test.ts` | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-923-INT-002 | FR-P6-923 | 6.1 | P1 | IT | Export audit collection endpoint enforces pagination bounds and metadata envelope | `[INT] test/phase6.modules.test.ts` (`pagination is enforced on analytics and exports`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-926-INT-002 | FR-P6-926 | 6.1 | P1 | IT | Analytics collection endpoint enforces pagination bounds and metadata envelope | `[INT] test/phase6.modules.test.ts` (`pagination is enforced on analytics and exports`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-928-INT-002 | FR-P6-928 | 6.1 | P1 | IT | Analytics dataset export schema and CSV headers remain stable via snapshot tests | `[UNIT][INT] test/phase6.analytics.snapshot.test.ts` | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-930-INT-002 | FR-P6-930 | 6.1 | P0 | IT | Webhook dispatch applies rate-limiting and circuit-breaker guardrails | `[INT] test/phase6.modules.test.ts` (`webhook dispatch enforces rate limit and circuit breaker`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-930-E2E-002 | FR-P6-930 | 6.1 | P0 | E2E | Negative webhook failure E2E preserves retry visibility and explicit guard responses | `[E2E] e2e/phase6.extensions.spec.ts` (`Phase 6.1 E2E negative: webhook failure path triggers retry and breaker/rate-limit guard`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-907-SEC-002 | FR-P6-907 | 6.1 | P1 | SEC | Core role/feature-flag contracts remain frozen and validated at startup | `[UNIT][SEC] src/config/coreContracts.ts`, `test/phase6.security.test.ts` (`core type contracts remain frozen`) | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |
| TC-FR-P6-920-OPS-002 | FR-P6-920 | 6.1 | P0 | OPS | Phase 6 is locked after non-functional hardening evidence and CI gate validation | `[OPS][DOC] docs/phase_summary.md`, `scripts/ci-gate.ts`, `docs/change_log.md` | RV-2026.02.20.6.1 | DV-2026-0006.1 | 2026-02-20 | PASS |

### 3.9 Phase 7 Operational Intelligence Traceability (FR-P7-1001..FR-P7-1020)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-1001-INT | FR-P7-1001 | 7 | P1 | IT | Observability dashboard exposes runtime health cards | `[INT] test/phase7.modules.test.ts` (`observability dashboard exposes SLA, alerts, and job metrics`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1002-INT | FR-P7-1002 | 7 | P0 | IT | SLA snapshot endpoint returns threshold-aware operational indicators | `[INT] test/phase7.modules.test.ts` (`observability dashboard exposes SLA, alerts, and job metrics`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1003-INT | FR-P7-1003 | 7 | P0 | IT | SLA threshold breach emits explicit WARN/CRITICAL alert records | `[INT][UI] test/phase7.modules.test.ts`, `web/ops-dashboard.js` | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1004-INT | FR-P7-1004 | 7 | P1 | IT | Job metric feed is queryable with pagination and role scope | `[INT] test/phase7.modules.test.ts` (`observability jobs page/pageSize`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1005-INT | FR-P7-1005 | 7 | P0 | IT | Predictive trend endpoint returns history + forecast rows | `[INT] test/phase7.modules.test.ts` (`predictive analytics returns read-only forecasts and CSV/JSON exports`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1006-E2E | FR-P7-1006 | 7 | P0 | E2E | Predictive SLA endpoint returns horizon risk and reasons | `[INT][E2E][UI] test/phase7.modules.test.ts`, `e2e/phase7.extensions.spec.ts` (`Predictive SLA alerts trigger on simulated violations`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1007-INT | FR-P7-1007 | 7 | P1 | IT | Predictive exports support CSV/JSON machine-readable datasets | `[INT] test/phase7.modules.test.ts` (`predictive analytics returns read-only forecasts and CSV/JSON exports`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1008-SEC | FR-P7-1008 | 7 | P0 | SEC | Predictive endpoints stay read-only and deny cross-tenant access | `[INT][SEC] test/phase7.modules.test.ts` (`queue length unchanged`, `cross-tenant predictive access returns 403`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1009-INT | FR-P7-1009 | 7 | P0 | IT | Integration client registry create/list flows are tenant-scoped | `[INT] test/phase7.modules.test.ts` (`webhook integration control plane enforces token verification and kill-switch`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1010-SEC | FR-P7-1010 | 7 | P0 | SEC | Integration token hash/verify/rotate flow is enforced | `[INT][SEC] test/phase7.modules.test.ts` (`token verify + rotate`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1011-INT | FR-P7-1011 | 7 | P0 | IT | Integration kill-switch blocks linked webhook dispatch non-silently | `[INT][CHAOS] test/phase7.modules.test.ts`, `test/phase7.chaos.test.ts` | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1012-E2E | FR-P7-1012 | 7 | P0 | E2E | Outbound webhook dispatch remains idempotent with signature and retry evidence | `[INT][E2E] test/phase7.modules.test.ts`, `e2e/phase7.extensions.spec.ts` (`Webhook events delivered with retry and idempotency controls`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1013-INT | FR-P7-1013 | 7 | P0 | IT | Compliance export endpoint returns read-only tenant-scoped datasets | `[INT][SEC] test/phase7.modules.test.ts` (`compliance exports and integration control stay tenant scoped`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1014-INT | FR-P7-1014 | 7 | P1 | IT | Legal-hold visibility endpoint returns tenant-scoped hold state | `[INT][CHAOS] test/phase7.chaos.test.ts` (`simulated node restart with control-plane records intact`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1015-INT | FR-P7-1015 | 7 | P1 | IT | Legal-hold create/release flows remain auditable and role-scoped | `[INT][CHAOS] test/phase7.chaos.test.ts` (`TENANT_OWNER legal-hold create`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1016-INT | FR-P7-1016 | 7 | P1 | IT | Observability and predictive feature flags default OFF and gate endpoints | `[INT] test/phase7.modules.test.ts` (`phase7 feature flags default off and can be enabled`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1017-INT | FR-P7-1017 | 7 | P1 | IT | Integration and compliance feature flags default OFF and gate endpoints | `[INT] test/phase7.modules.test.ts` (`phase7 feature flags default off and can be enabled`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1018-INT | FR-P7-1018 | 7 | P2 | IT | Scale guard feature flag defaults OFF and gates cache stats/eviction paths | `[INT] test/phase7.modules.test.ts` (`phase7 feature flags default off and can be enabled`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1019-E2E-UI | FR-P7-1019 | 7 | P1 | E2E | Ops dashboard UI renders observability cards and SLA payload with fallback messaging | `[E2E][UI] e2e/phase7.extensions.spec.ts` (`Observability dashboard shows aggregated metrics`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |
| TC-FR-1020-SEC | FR-P7-1020 | 7 | P0 | SEC | Routing and RBAC reject unauthorized cross-tenant phase7 access (`403`) | `[INT][SEC] test/phase7.modules.test.ts` (`cross-tenant predictive/compliance/control access returns 403`) | RV-2026.02.20.7 | DV-2026-0007 | 2026-02-20 | PASS |

### 3.10 Phase 8 Actionable Intelligence Traceability (FR-P8-1101..FR-P8-1120)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-FR-1101-INT | FR-P8-1101 | 8 | P0 | IT | Predictive actions endpoint returns actionable paginated records | `[INT] test/phase8.modules.test.ts` (`returns expected predictive actions and supports write decisions`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1102-INT | FR-P8-1102 | 8 | P0 | IT | Authorized users can acknowledge/execute/dismiss predictive actions | `[INT] test/phase8.modules.test.ts` (`returns expected predictive actions and supports write decisions`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1103-INT | FR-P8-1103 | 8 | P1 | IT | Predictive action derivation remains idempotent by source reference | `[INT] test/phase8.modules.test.ts` (`returns expected predictive actions and supports write decisions`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1104-INT | FR-P8-1104 | 8 | P1 | IT | Predictive action transitions emit audit and structured metric evidence | `[INT] test/phase8.modules.test.ts`, `[SEC] test/phase8.security.test.ts` (`keeps audit records immutable and append-only`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1105-INT | FR-P8-1105 | 8 | P1 | IT | Observability insights endpoint returns summary, alerts, and action rows | `[INT] test/phase8.modules.test.ts` (`renders enhanced insights and filters severity/status`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1106-E2E | FR-P8-1106 | 8 | P1 | E2E | Ops dashboard applies severity/status filters and supports actionable controls | `[E2E][UI] e2e/phase8.extensions.spec.ts` (`predictive actions are visible and actionable in ops dashboard`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1107-LOAD | FR-P8-1107 | 8 | P2 | PERF | Scale advisory stays within performance budget under repeated calls | `[LOAD] test/phase8.performance.test.ts` (`stable advisory latency`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1108-E2E-UI | FR-P8-1108 | 8 | P2 | E2E | Ops UI shows offline fallback and severity visual indicators | `[E2E][UI] e2e/phase8.extensions.spec.ts`, `[INT] test/phase8.chaos.test.ts` (`offline fallback explicit`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1109-INT | FR-P8-1109 | 8 | P0 | IT | Webhook dispatch remains outbound-only and idempotent | `[INT] test/phase8.modules.test.ts` (`outbound webhooks with idempotency`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1110-SEC | FR-P8-1110 | 8 | P0 | SEC | Webhook verification exposes valid signature evidence and algorithm metadata | `[INT][SEC] test/phase8.modules.test.ts`, `test/phase8.security.test.ts` | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1111-INT | FR-P8-1111 | 8 | P1 | IT | Integration control health endpoint reports tenant client/delivery state | `[INT] test/phase8.modules.test.ts` (`health visibility`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1112-INT | FR-P8-1112 | 8 | P1 | IT | Webhook failure path remains explicit with retry/failed state transitions | `[INT][CHAOS] test/phase8.chaos.test.ts` (`network failures with explicit retry path`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1113-INT | FR-P8-1113 | 8 | P0 | IT | Compliance export rows include legal-hold, retention, and immutability metadata | `[INT] test/phase8.modules.test.ts` (`retention metadata`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1114-INT | FR-P8-1114 | 8 | P1 | IT | Compliance retention view exposes append-only contract and hold summary | `[INT] test/phase8.modules.test.ts` (`retention view`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1115-INT | FR-P8-1115 | 8 | P1 | IT | Compliance export pagination contract remains explicit and bounded | `[INT] test/phase8.modules.test.ts` (`compliance exports pagination`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1116-E2E | FR-P8-1116 | 8 | P2 | E2E | Compliance CSV/JSON exports include aligned governance columns | `[E2E] e2e/phase8.extensions.spec.ts` (`compliance export includes legal-hold fields`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1117-SEC | FR-P8-1117 | 8 | P1 | SEC | Predictive action feature flag defaults OFF and fails closed | `[SEC] test/phase8.security.test.ts` (`feature-flag fail-closed behavior`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1118-SEC | FR-P8-1118 | 8 | P1 | SEC | Ops enhancement feature flag defaults OFF and fails closed | `[SEC] test/phase8.security.test.ts` (`feature-flag fail-closed behavior`) | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1119-SEC | FR-P8-1119 | 8 | P0 | SEC | Phase 8 routes reject cross-tenant access attempts with 403 | `[INT][SEC] test/phase8.modules.test.ts`, `test/phase8.security.test.ts` | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |
| TC-FR-1120-LOAD | FR-P8-1120 | 8 | P0 | PERF | Phase 8 release gate passes with no Phase 1-7 regression and budget compliance | `[LOAD][SEC] test/phase8.performance.test.ts`, `scripts/ci-gate.ts`, `npm run ci:gate` | RV-2026.02.20.8 | DV-2026-0008 | 2026-02-20 | PASS |

### 3.11 DB Provisioning & Migration Gate Traceability (AC-DB-01)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-AC-DB-01-OPS-001 | AC-DB-01 | G-DB | P0 | OPS | `full-sync -> main` gate fails when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing | `[OPS][CI] .github/workflows/full-sync-main-gate.yml`, `scripts/supabase-env-guard.ts` | RV-2026.02.21.1 | DV-2026-0009 | 2026-02-21 | PASS |
| TC-AC-DB-01-OPS-002 | AC-DB-01 | G-DB | P0 | OPS | Supabase migrations must apply successfully before merge gate passes | `[OPS][DB] .github/workflows/full-sync-main-gate.yml`, `scripts/supabase-migration-gate.ts`, `supabase/migrations/` | RV-2026.02.21.1 | DV-2026-0009 | 2026-02-21 | PASS |
| TC-AC-DB-01-OPS-003 | AC-DB-01 | G-DB | P0 | OPS | Migration drift check fails when history/schema drift is detected | `[OPS][DB] scripts/supabase-migration-gate.ts` (`supabase migration list`, `supabase db diff`) | RV-2026.02.21.1 | DV-2026-0009 | 2026-02-21 | PASS |

### 3.12 Phase 2 Foundation Traceability (Schema/API/Mobile)

| TC ID | Req ID | Phase | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-P2-DB-001 | FRD-v1.3-DB | P2-F | P0 | OPS | Core schema migration applies with tenant/branch-scoped RLS policies | `supabase/migrations/20260221120107_20260221_phase2_core_schema.sql`, `scripts/supabase-migration-gate.ts`, `npm run supabase:ci` (2026-02-25: migrations up-to-date, migration list matched, gate passed) | RV-2026.02.21.2 | DV-2026-0010 | 2026-02-25 | PASS |
| TC-P2-API-001 | FRD-v1.3-API | P2-F | P1 | IT | Backend scaffold health/auth/products/orders/reporting routes compile and execute basic API contracts | `backend/tests/backend.module.test.ts`, `backend/tests/api/health.test.ts` | RV-2026.02.21.2 | DV-2026-0010 | 2026-02-21 | PASS |
| TC-P2-MOB-001 | FRD-v1.3-MOBILE | P2-F | P1 | E2E | Flutter mobile shell loads module routes with EN/MM localization baseline and no DB/service-role secrets in client env contract | `grocery_pos_mobile/test/widget_test.dart`, `grocery_pos_mobile/lib/common/env.dart`, `.github/workflows/full-sync-main-gate.yml` | RV-2026.02.21.2 | DV-2026-0010 | 2026-02-21 | PASS |

---

## 4. REP Traceability Starter

| TC ID | Report ID | Priority | Level | Scenario | Evidence Ref | RV Tag | DV Tag | Last Updated | Status |
|---|---|---|---|---|---|---|---|---|---|
| TC-REP-T-001-INT-001 | REP-T-001 | P0 | IT | Validate daily sales formulas and branch rollup | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-002-INT-001 | REP-T-002 | P0 | IT | Validate monthly aggregation and growth formula | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-003-INT-001 | REP-T-003 | P0 | IT | Validate inventory on-hand/value calculations | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-004-INT-001 | REP-T-004 | P0 | IT | Validate low-stock filter and stock gap formula | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-005-INT-001 | REP-T-005 | P0 | IT | Validate profit and gross margin calculations | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-006-INT-001 | REP-T-006 | P0 | IT | Validate staff sales attribution and overrides | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-007-INT-001 | REP-T-007 | P0 | IT | Validate loyalty earned/redeemed reconciliations | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-T-008-INT-001 | REP-T-008 | P0 | IT | Validate tax summary grouping and totals | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-001-INT-001 | REP-O-001 | P0 | IT | Validate tenant activity aggregation and scope | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-002-INT-001 | REP-O-002 | P0 | IT | Validate platform GMV and tenant share percent | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-003-OPS-001 | REP-O-003 | P0 | OPS | Validate health metrics source alignment | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-004-SEC-001 | REP-O-004 | P0 | SEC | Validate risk event and override visibility | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-005-INT-001 | REP-O-005 | P0 | IT | Validate tenant growth and retention metrics | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-006-INT-001 | REP-O-006 | P0 | IT | Validate feature adoption metric calculations | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-007-INT-001 | REP-O-007 | P0 | IT | Validate endpoint error-rate denominators | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-O-008-OPS-001 | REP-O-008 | P0 | OPS | Validate backup success and restore-test fields | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-A-001-INT-001 | REP-A-001 | P2 | IT | Validate forecast output and model metadata | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-A-002-INT-001 | REP-A-002 | P2 | IT | Validate deterministic trend analysis output | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-A-003-INT-001 | REP-A-003 | P2 | IT | Validate authorized comparative scope controls | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-REP-A-004-SEC-001 | REP-A-004 | P2 | SEC | Validate custom report cannot bypass access rules | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |

---

## 5. Traceability Maintenance Workflow

1. Create/adjust requirement or report entry.
2. Add or revise impacted `TC-*` rows in this matrix.
3. Bump `RV-*`/`DV-*` tags if logic or decision changed.
4. Link evidence when test is implemented and executed.
5. Update `docs/change_log.md` entry with impact summary.

---

END OF DOCUMENT
