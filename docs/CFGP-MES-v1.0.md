# CFGP-MES v1.0
Cosmic Forge Grocery POS  
Master Engineering Specification

---

## 1. Purpose

This document defines the **mandatory system behavior, architecture rules, and failure handling** for the Cosmic Forge Grocery POS system.

This document is the **highest authority**.
If any document conflicts with this one, **this document wins**.

---

## 2. System Principles (LOCKED)

- Offline-first
- Multi-tenant isolation (hard enforced)
- Configuration-driven branding & tax
- Auditability over convenience
- Minimal refactor tolerance

---

## 3. Tenant & Isolation Rules (NON-NEGOTIABLE)

### 3.1 Tenant Scope

Every data object MUST include:
- tenant_id (required)
- branch_id (if branch-scoped)

Applies to:
- users
- products
- inventory
- sales
- logs
- reports
- configuration

### 3.2 Enforcement

- Database-level constraints
- Row-Level Security (RLS)
- All queries MUST include tenant scope
- No shared tables without tenant_id

Violation = **production block**

---

## 4. Offline-First Behavior

### 4.1 Offline Capabilities

The system MUST support:
- Product lookup
- Sales creation
- Receipt generation
- Inventory deduction
- Customer loyalty update (pending state)

### 4.2 Transaction Queue

Offline transactions are stored as:
- Immutable records
- UUID-based idempotency keys
- Status-driven lifecycle

Transaction States:
- PENDING
- SYNCING
- CONFLICT
- FAILED
- CONFIRMED

---

## 5. Sync & Conflict Resolution

### 5.1 Sync Rules

- Sync occurs automatically when online
- Transactions are replayed in order
- Duplicate UUIDs MUST be ignored

### 5.2 Conflict Rules

- Price: server wins
- Quantity: local wins
- Tax: server recalculates
- User is notified for conflicts

Silent conflict resolution is FORBIDDEN.

---

## 6. Failure Handling (COMPLETED)

### 6.1 Network Failure

- No data loss
- UI enters offline mode
- User is informed

### 6.2 Partial Sync Failure

- Rollback to last confirmed state
- Failed transaction marked FAILED
- Retry requires explicit user action

### 6.3 Data Corruption

- System enters read-only mode
- Incident logged
- Admin notification triggered

---

## 7. Branding & Theming

- UI must never embed logos
- BrandService is the only source
- App brand ≠ Tenant brand
- Color themes must be runtime configurable

---

## 8. Logging & Audit Trail

Every critical action MUST log:
- tenant_id
- user_id
- action_type
- timestamp
- device_id
- sync_state

Logs without tenant_id are INVALID.

---

## 9. Security Controls

- Location & VPN controls are risk-based
- Soft block preferred
- All enforcement actions logged
- Admin override requires reason

---

## 10. Release Authority

Any feature violating this document MUST NOT be released.

---

END OF DOCUMENT