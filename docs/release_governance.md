# Cosmic Forge Grocery POS
## Release Governance v1.1

Version: v1.1  
Status: Draft for Review  
Date: 2026-02-20  
Owner: Application Owner  
References: `docs/CFGP-MES-v1.0.md`, `docs/Release-Gatekeeper.md`, `docs/ACP.md`, `docs/risk_register.md`

---

## 1. Environment Promotion Model

Promotion path:
1. `DEV`
2. `STAGING`
3. `PROD`

Rules:
1. Promotion is one-way only (`DEV -> STAGING -> PROD`).
2. Every promotion requires:
   - `npm test` pass
   - `npm run build` pass
   - required E2E/smoke pass for target environment
   - updated traceability and change log evidence
3. Manual hotfix promotion must still pass Release Gatekeeper blockers.

---

## 2. Release Artifact Versioning

Artifact format:
- `cfgp-pos-{YYYY.MM.DD}.{build}`

Required metadata:
- git commit SHA
- RV tag
- DV tag
- environment target
- build timestamp (UTC)

Retention policy:
1. Keep last 30 production artifacts.
2. Keep all artifacts associated with incident windows until incident closure.

---

## 3. Rollback Rules

Rollback triggers:
1. tenant isolation breach
2. risk enforcement bypass not controlled by feature flag governance
3. audit pipeline integrity failure
4. P0 regression in checkout/offline sync

Rollback execution:
1. revert to most recent known-good production artifact
2. run smoke checks:
   - authentication + context
   - tenant scoped reads
   - checkout + queue
   - risk mode enforcement
3. open incident and attach evidence links

---

## 4. Feature Flag Rollout Policy

Supported Phase 6 tenant-scoped flags:
- `advanced_discounts`
- `loyalty_rules`
- `risk_enforcement`

Policy:
1. Enable/disable only by `APPLICATION_OWNER` or `TENANT_OWNER`.
2. Flag flips must generate tenant-aware audit entries.
3. Flag flips in production require change ticket reference.
4. Emergency disable is allowed for containment, then backfilled in change log.

---

## 5. Smoke Test Tier

Minimum smoke suite before prod promotion:
1. auth context + tenant path validation
2. product list tenant scope
3. offline queue enqueue/retry
4. risk `WARN` / `READ_ONLY` / `BLOCK`
5. audit log read endpoint

---

## 6. Incident Lifecycle

Operational incident flow:
1. `DETECT`
2. `CLASSIFY`
3. `RESPOND`
4. `RESOLVE`

Lifecycle expectations:
1. `DETECT`: alert or observation is logged with timestamp, actor, tenant/branch scope.
2. `CLASSIFY`: assign severity (`INFO`, `WARN`, `CRITICAL`) and impacted module.
3. `RESPOND`: apply containment (feature flag, rollback, policy lock) with audit evidence.
4. `RESOLVE`: confirm recovery, attach root-cause notes, close with verification evidence.

---

## 7. Go/No-Go Checklist

`GO` requires all:
1. release blockers in `docs/Release-Gatekeeper.md` are clear.
2. `npm test`, `npm run test:e2e`, `npm run build` all pass.
3. traceability rows for active phase are `PASS` and evidence-linked.
4. risk register has no unaccepted open `CRITICAL` risk.
5. rollback artifact and owner are confirmed.

`NO-GO` if any:
1. tenant isolation evidence missing.
2. offline replay/idempotency behavior undefined or failing.
3. audit trail integrity check fails.
4. unresolved `CRITICAL` risk without approved mitigation.

---

## 8. Phase 5.x Exit Gate (Mandatory Before Phase 6.1 Close)

`PASS` required for all:
1. discount policy payload includes `policyVersion`, `effectiveFrom`, and `effectiveTo`.
2. policy preview endpoint is read-only and cacheable (`ETag`, `max-age`).
3. reason code enums remain stable while reason messages support locale overlays.
4. audit chain startup validation and integrity endpoint are both green.
5. CI gate confirms:
   - report latency under hard runtime budget
   - no audit severity downgrade

`NO-GO` if any:
1. policy corruption allows discount execution.
2. audit severity downgrade is detected in integrity report.
3. runtime report budget is exceeded without explicit block response.

---

## 9. Phase Freeze and Boundary

Phase state:
1. Phase 5.x is locked after exit gate pass and changelog sign-off.
2. Phase 6 scope is frozen for hardening-only controls (no net-new revenue features).
3. Phase 7 boundary starts only after:
   - Phase 6 traceability rows are all `PASS`
   - release owner signs freeze record
   - risk register has no unaccepted open `CRITICAL` item

---

## 10. Phase 7 Operational Intelligence Gate (FR-P7-1001..FR-P7-1020)

Mandatory gate checks:
1. `npm run build` passes.
2. `npm test` passes with no regressions in Phases 1-6.
3. `npm run test:e2e` passes including Phase 7 E2E suite.
4. `npm run ci:gate` passes with mandatory Phase 7 test packs:
   - `test/phase7.modules.test.ts`
   - `test/phase7.performance.test.ts`
   - `test/phase7.chaos.test.ts`
5. Phase 7 traceability rows are updated with executed evidence and no `PENDING` rows.
6. Phase 7 FR/TC namespace alignment is complete (`FR-P7-1001..FR-P7-1020` -> `TC-FR-1001..TC-FR-1020-*`).

Phase 7 go/no-go:
1. `GO`:
   - observability dashboard is usable without training
   - predictive endpoints remain read-only
   - integration kill-switch/token verification controls are validated
   - compliance export and legal-hold visibility are validated
2. `NO-GO`:
   - any Phase 1-6 regression
   - any cross-tenant leak in phase 7 endpoints
   - token/security/export tests failing

Phase lock rule:
1. Phase 7 is marked `LOCKED` before any Phase 8 planning or implementation merge.

---

END OF DOCUMENT
