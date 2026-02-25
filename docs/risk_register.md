# Cosmic Forge Grocery POS
## Risk Register v1.1

Version: v1.1  
Status: Active  
Date: 2026-02-20  
Owner: Application Owner  
References: `docs/CFGP-MES-v1.0.md`, `docs/release_governance.md`, `docs/Release-Gatekeeper.md`

---

| Risk ID | Category | Description | Severity | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| RISK-001 | Security | Cross-tenant data access regression | CRITICAL | Low | Maintain tenant/branch enforcement tests and release gate blocker checks. Approver: Security & Product Governance. Date: 2026-02-25. | Platform | MITIGATED |
| RISK-002 | Security | Audit chain tamper or corruption | CRITICAL | Low | Append-only immutable log contract + chain verification test | Platform | MITIGATED |
| RISK-003 | Offline | Replay storm/duplicate queue causing double-post | WARN | Medium | Idempotency keys + retry/backoff + replay window expiry | POS Runtime | MITIGATED |
| RISK-004 | Reporting | Large tenant aggregation latency degradation | WARN | Medium | Pagination limits + performance budget + load tests | Reporting | MITIGATED |
| RISK-005 | Governance | Release promoted without complete evidence | CRITICAL | Low | Go/No-Go checklist + traceability PASS requirement. Approver: Security & Product Governance. Date: 2026-02-25. | Release Manager | ACCEPTED |
| RISK-006 | UX | Operators miss discount policy suppression reasons | INFO | Medium | POS discount breakdown panel + rejection reason codes | Product/UX | MITIGATED |
| RISK-007 | Security | Audit severity downgraded below expected level | CRITICAL | Low | Startup integrity gate + CI gate downgrade detection + integrity endpoint checks | Platform | MITIGATED |
| RISK-008 | Operations | Phase drift after freeze causes uncontrolled release scope | WARN | Medium | Phase 5.x exit gate + Phase 6 freeze + Phase 7 boundary lock | PMO | MITIGATED |

---

Update rules:
1. Any new CRITICAL production issue must be registered before release close.
2. Status values: `OPEN`, `MITIGATED`, `ACCEPTED`, `CLOSED`.
3. Accepted risk requires documented approver and expiry review date.

Security governance notes:
1. TLS/in-transit encryption is MITIGATED via Supabase + HTTPS. Approver: Security Governance. Date: 2026-02-25.
2. Encryption at rest is ACCEPTED as platform-managed control. Approver: Security Governance. Date: 2026-02-25.

---

END OF DOCUMENT
