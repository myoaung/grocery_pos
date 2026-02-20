# CODEX EXECUTION DIRECTIVE v1.0
Multi-Tenant Grocery POS Mobile Application

---

## 0. Authority & Scope

This document defines **mandatory execution order, analysis responsibilities, and development priorities** for CodeX.

Failure to follow this directive exactly will result in:
- Rejected output
- Rework
- Production block

This document overrides:
- Partial interpretations
- Assumptions
- “Reasonable defaults”

---

## 1. Canonical Document Hierarchy (READ FIRST)

CodeX MUST treat documents in the following authority order:

1. CFGP-MES-v1.0.md            ← SYSTEM LAW
2. Release-Gatekeeper.md       ← PRODUCTION BLOCK RULES
3. ACP.md                      ← ACCEPTANCE CRITERIA
4. FRD-v1.1.md                 ← FUNCTIONAL SCOPE
5. permission_matrix.md        ← ACCESS CONTROL
6. report_catalog.md           ← REPORT CONTRACT
7. db_schema.sql               ← PHYSICAL DATA MODEL
8. ui_guidelines.md            ← UI GOVERNANCE
9. TC_traceability_matrix.md   ← QA VERIFICATION MAP
10. change_log.md              ← CHANGE HISTORY

If conflicts exist:
➡️ Higher document WINS  
➡️ Lower document MUST be fixed

---

## 2. PHASE 0 — MANDATORY ANALYSIS (NO CODE)

### 2.1 Consistency Audit (REQUIRED OUTPUT)

CodeX MUST produce:
- A **Conflict Report** listing:
  - Missing tenant_id usage
  - Undefined offline behavior
  - Role mismatches
  - Report definition gaps

No development is allowed until:
- Conflicts are documented
- Fix recommendations are proposed

---

## 3. PHASE 1 — FOUNDATIONAL SYSTEM WORK (HIGHEST PRIORITY)

### 3.1 Multi-Tenant Isolation (NON-NEGOTIABLE)

CodeX MUST verify and enforce:

- Every table includes:
  - tenant_id (NOT NULL)
  - branch_id (where applicable)
- All queries are tenant-scoped
- Logs include tenant_id
- RLS or equivalent enforced

❌ Any feature without tenant isolation is INVALID.

---

### 3.2 Role & Permission Enforcement

Using `permission_matrix.md`:

- Roles must be typed (not string-based)
- Permissions must be enforced:
  - API level
  - Service level
- UI hiding is NOT security

❌ Missing enforcement = BLOCKER

---

### 3.3 Offline-First Transaction Engine

CodeX MUST implement:

#### Transaction Queue
- Immutable records
- UUID idempotency
- Ordered replay

#### Transaction States
- PENDING
- SYNCING
- CONFLICT
- FAILED
- CONFIRMED

#### Rules
- Duplicate UUIDs ignored
- Conflicts surfaced to user
- Silent resolution forbidden

❌ Offline behavior without protocol = BLOCKER

---

## 4. PHASE 2 — CORE BUSINESS FLOWS (AFTER PHASE 1)

### 4.1 Sales Flow (Retail & Wholesale)

MUST support:
- Offline checkout
- Discount rules
- Dynamic tax calculation
- Receipt generation offline

Performance SLA:
- Checkout < 2 seconds (offline & online)

---

### 4.2 Inventory Integrity

MUST enforce:
- No negative stock
- Atomic inventory updates
- Sync-safe adjustments
- Branch-aware transfers

Inventory mismatch = **SEV-1 defect**

---

### 4.3 Product Management

MUST support:
- MM / EN naming
- Price tiers
- Tax category mapping
- Stock alert thresholds

---

## 5. PHASE 3 — SECURITY & CONTROL LAYERS

### 5.1 Location & VPN Enforcement

MUST be:
- Risk-based
- Explainable
- Auditable

Enforcement Levels:
- Warn
- Read-only
- Block

Admin override MUST:
- Require reason
- Be logged

---

### 5.2 Audit Logging (MANDATORY)

Every critical action logs:
- tenant_id
- user_id
- action_type
- device_id
- timestamp
- sync_state

Missing audit data = **release block**

---

## 6. PHASE 4 — REPORTING (CONTRACT-BASED)

Using `report_catalog.md`:

Each report MUST define:
- Fields
- Filters
- Formulas
- Role access
- Export format

❌ “Placeholder report” is forbidden.

---

## 7. PHASE 5 — UI IMPLEMENTATION RULES

UI MUST:
- Follow ui_guidelines.md strictly
- Use service-driven branding
- Reflect offline / read-only / conflict states
- Avoid visual-only enforcement

❌ UI that hides logic violations = REJECTED

---

## 8. TESTING & TRACEABILITY (MANDATORY)

CodeX MUST maintain:
- Test Case ↔ Requirement traceability
- Acceptance Criteria validation
- Offline chaos tests

Use:
- TC_traceability_matrix_v1.1.md

Untested feature = **non-existent feature**

---

## 9. RELEASE READINESS CHECK (NO EXCEPTIONS)

Before any release:
- All ACP passed
- All blockers resolved
- Backup restore tested
- CI pipeline green
- Release-Gatekeeper approved

---

## 10. EXECUTION PHILOSOPHY (FINAL)

This system prioritizes:
- Safety over speed
- Isolation over convenience
- Auditability over elegance

Any shortcut violating these principles MUST be rejected.

---

END OF DIRECTIVE