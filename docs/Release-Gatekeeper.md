# Release Gatekeeper Rules
Cosmic Forge Grocery POS

---

## 1. Absolute Production Blockers

Release MUST be BLOCKED if ANY of the following occur:

- CFGP-MES violated
- Tenant isolation not enforced at DB level
- Offline sync behavior undefined
- Acceptance criteria missing
- Logs missing tenant_id
- Silent conflict resolution exists
- UI embeds branding directly

---

## 2. Required Evidence for Release

Before production deployment, ALL must exist:

- Passing automated tests
- Offline chaos test results
- Backup restore verification
- Security enforcement audit
- CI pipeline green
- Acceptance Criteria signed off

---

## 3. Release Checklist

- Tenant data isolation verified
- Offline sales verified
- Sync idempotency verified
- Reports validated
- Audit logs reviewed
- Rollback plan confirmed

---

## 4. Authority Statement

The Release Gatekeeper has full authority to:
- Delay release
- Reject features
- Demand redesign
- Enforce rollback

No exception allowed.

---

END OF DOCUMENT