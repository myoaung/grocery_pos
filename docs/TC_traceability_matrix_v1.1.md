# Cosmic Forge Grocery POS
## TC Traceability Matrix v1.1 (Starter)

Version: v1.1  
Status: Legacy (Superseded)  
Date: 2026-02-20  
Owner: Application Owner  
Superseded by: `docs/TC_traceability_matrix.md`  
Top Authority: `docs/CFGP-MES-v1.0.md`  
References: `docs/CFGP-MES-v1.0.md`, `docs/FRD-v1.1.md`, `docs/report_catalog.md`, `docs/change_log.md`

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
| TC-FR-001-INT-001 | FR-001 | 1 | P0 | IT | Block cross-tenant read/write access | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-002-SEC-001 | FR-002 | 1 | P0 | SEC | Enforce tenant RLS policy isolation | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-003-INT-001 | FR-003 | 1 | P0 | IT | Restrict user actions to assigned branch | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-004-INT-001 | FR-004 | 1 | P1 | IT | Require device registration for unknown device | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-100-SEC-001 | FR-100 | 1 | P0 | SEC | Reject unauthenticated access to protected endpoints | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-101-SEC-001 | FR-101 | 1 | P0 | SEC | Enforce endpoint-level RBAC matrix decisions | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-102-INT-001 | FR-102 | 5 | P1 | IT | Deactivated user cannot authenticate | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-200-UT-001 | FR-200 | 2 | P0 | UT | Validate product required fields and price rules | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-201-INT-001 | FR-201 | 2 | P0 | IT | Inventory ledger replay equals computed on-hand stock | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-202-INT-001 | FR-202 | 2 | P1 | IT | Trigger low-stock alert at configured threshold | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-203-INT-001 | FR-203 | 2 | P1 | IT | Ensure transfer creates paired outbound/inbound events | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-300-E2E-001 | FR-300 | 3 | P0 | E2E | Complete retail and wholesale checkout flow | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-301-INT-001 | FR-301 | 3 | P0 | IT | Apply deterministic discount precedence rules | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-302-UT-001 | FR-302 | 3 | P0 | UT | Resolve tax rule by effective date and tax category | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-303-E2E-001 | FR-303 | 3 | P0 | E2E | Queue offline sale/inventory event and persist locally | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-304-INT-001 | FR-304 | 3 | P0 | IT | Idempotent replay and conflict resolution on reconnect | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-305-E2E-001 | FR-305 | 3 | P1 | E2E | Generate receipt with config-driven brand asset | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-400-INT-001 | FR-400 | 4 | P1 | IT | Search customer by name/phone and view history | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-401-INT-001 | FR-401 | 4 | P1 | IT | Validate points accrual/redemption and ledger auditability | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-402-INT-001 | FR-402 | 4 | P2 | IT | Recalculate tier after qualifying purchases | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-500-SEC-001 | FR-500 | 7 | P1 | SEC | Enforce risk policy actions WARN/READ_ONLY/BLOCK | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-501-SEC-001 | FR-501 | 7 | P1 | SEC | Require reason and expiry for risk override | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-600-INT-001 | FR-600 | 6 | P0 | IT | Verify all mandatory report IDs are implemented | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-601-INT-001 | FR-601 | 6 | P2 | IT | Confirm optional reports are feature-flag controlled | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-FR-602-INT-001 | FR-602 | 6 | P1 | IT | Validate CSV/print export parity and timezone behavior | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
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
| TC-NFR-005-SEC-001 | NFR-005 | 7 | P0 | SEC | Verify TLS, encryption at rest, and privileged auth | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-006-OPS-001 | NFR-006 | 7 | P0 | OPS | Validate RPO/RTO compliance via drill evidence | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |
| TC-NFR-007-UAT-001 | NFR-007 | 5 | P1 | UAT | Confirm MM/EN localization and locale formats | TBD | RV-2026.02.20.1 | DV-2026-0001 | 2026-02-20 | PLANNED |

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
