# Cosmic Forge Grocery POS
## Functional Requirements Document (FRD) v1.2 - Phase 5/6 Addendum

Version: v1.2  
Status: Draft for Review  
Date: 2026-02-20  
Owner: Application Owner  
Base Reference: `docs/FRD-v1.1.md` (v1.4)

---

## 1. Scope

This addendum formalizes Phase 5 runtime scope:
- Advanced Discounts module
- Multi-Store Reporting module
- Risk and Compliance module
- Phase 6 hardening and production readiness modules
- Phase 6 governed expansion modules:
  - analytics
  - external exports
  - outbound webhooks
  - background aggregation jobs
  - scale guard read abstraction

All Phase 5 requirements use alias-safe IDs `FR-P5-816..FR-P5-830`.
Phase 6 requirements use alias-safe IDs `FR-P6-901..FR-P6-933`.

---

## 2. Phase 5 Functional Requirements

### FR-P5-816 Advanced Discount Stacking (P1)
Requirement:
- support stackable discount rules with explicit precedence and conflict resolution in one deterministic calculation.

Acceptance criteria:
1. rule evaluation order is fixed and documented (`VOLUME`, `BASKET`, `CATEGORY`, `COUPON`, `LOYALTY`, `MANUAL`).
2. `COUPON` and `MANUAL` conflict resolution is explicit (same promo bucket, higher/equal precedence wins).
3. cap policy is enforced for base, promo, loyalty, and global totals.
4. line output includes subtotal, discount, and net totals.

### FR-P5-817 Loyalty Synergy Discount (P1)
Requirement:
- loyalty balance must influence eligible discount synergy percentage.

Acceptance criteria:
1. loyalty points produce tiered synergy percentage.
2. synergy appears in discount rule breakdown.
3. projected points after discounted total are returned.

### FR-P5-818 Cashier Discount Restriction (P0)
Requirement:
- cashier cannot apply manual override discounts.

Acceptance criteria:
1. manual override attempt by cashier is denied (`403`).
2. cashier can still run baseline discount evaluation.
3. denial is explicit and non-silent.

### FR-P5-819 Multi-Store Sales Aggregation (P1)
Requirement:
- provide tenant-level branch rollup for sales metrics.

Acceptance criteria:
1. report includes all in-scope branches.
2. branch metrics include receipts, gross, discount, and net totals.
3. filtering by branch/date is supported.
4. aggregation behavior is `LIVE_WITH_SNAPSHOT` (live query + snapshot evidence persisted at generation time).
5. paginated response contract is defined with `page`, `pageSize`, `totalRows`, `totalPages`.
6. page size limit is enforced (`1..200`).

### FR-P5-820 Multi-Store Reporting RBAC (P1)
Requirement:
- enforce role-based access on multi-store report endpoints.

Acceptance criteria:
1. authorized roles can access configured report variants.
2. unauthorized roles receive `403`.
3. no cross-tenant leakage occurs.

### FR-P5-821 Risk Policy Management (P0)
Requirement:
- allow privileged roles to create/update tenant and branch risk policies.

Acceptance criteria:
1. policy requires at least one active condition.
2. branch-scoped policy must reference valid tenant branch.
3. policy writes are audit logged.

### FR-P5-822 WARN Enforcement Mode (P0)
Requirement:
- WARN policy mode allows operation with explicit warning result.

Acceptance criteria:
1. evaluation returns mode `WARN`.
2. operation remains allowed.
3. warning context is captured in compliance event logs.

### FR-P5-823 READ_ONLY Enforcement Mode (P0)
Requirement:
- READ_ONLY mode blocks writes and allows reads.

Acceptance criteria:
1. write evaluation returns deny state and `409`.
2. read evaluation remains allowed.
3. mode/decision are logged.

### FR-P5-824 BLOCK Enforcement Mode (P0)
Requirement:
- BLOCK mode denies restricted operations.

Acceptance criteria:
1. evaluation returns `403` for blocked actions.
2. deny reason is explicit.
3. mode/decision are logged.

### FR-P5-825 Compliance Event Trail (P2)
Requirement:
- maintain tenant/branch-scoped compliance event history.

Acceptance criteria:
1. events include mode, decision, action, endpoint, actor.
2. event feed is role-restricted.
3. cross-tenant access is denied.
4. audit log records are append-only and immutable after creation.

### FR-P5-826 POS Phase 5 Module UI (P1)
Requirement:
- POS UI exposes advanced discount and risk compliance actions.

Acceptance criteria:
1. discount preview/apply controls are visible.
2. risk evaluation controls show mode result payload.
3. UI requests use tenant/branch scoped context headers.

### FR-P5-827 Dashboard Phase 5 Module UI (P1)
Requirement:
- dashboard UI exposes multi-store reporting and risk/compliance administration.

Acceptance criteria:
1. dashboard renders Phase 5 section.
2. multi-store report can be generated from dashboard controls.
3. risk policy and evaluation flows are wired to API.

### FR-P5-828 Risk Lock UI Evidence (P0)
Requirement:
- UI must visibly represent lock decisions from risk evaluation.

Acceptance criteria:
1. BLOCK decisions are displayed in dashboard output.
2. lock action leaves corresponding audit evidence.
3. evidence can be traced to user/session scope.

### FR-P5-829 Report Payload Audit References (P2)
Requirement:
- report generation audit logs include filter/payload references.

Acceptance criteria:
1. audit reason includes template and filter tokens.
2. references are tenant/branch scoped.
3. log entries are queryable through audit API.

### FR-P5-830 Multi-Store Export Contract (P1)
Requirement:
- multi-store reports export in CSV and PDF.

Acceptance criteria:
1. CSV export returns `text/csv`.
2. PDF export returns `application/pdf`.
3. export access follows report RBAC policy.
4. exports return full filtered dataset and are not truncated by pagination window used for on-screen responses.

### Phase 5.1 Hardening Completion (No New FR IDs)

This hardening pass does not introduce new FR IDs. It strengthens FR-P5 runtime behavior with:
1. policy-as-data discount configuration (`src/config/discountPolicy.ts`).
2. explicit discount rejection reason codes for machine/UI consumption.
3. exact-cap boundary validation tests for discount policy enforcement.
4. mocked-scale multi-store load test against defined response budget.
5. read-only admin audit visibility in dashboard and POS discount breakdown transparency.
6. policy versioning window (`policyVersion`, `effectiveFrom`, `effectiveTo`) and read-only preview API contract.
7. policy reason code enums are frozen for client compatibility; localized reason messages are supported without changing enums.

### Phase 5.x Closure and Phase 6.1 Operational Readiness (No New FR IDs)

This closure batch extends existing FR-P5/FR-P6 requirements without adding new aliases:
1. audit integrity verification endpoint (`GET /api/v1/audit/integrity`) with chain status, anchor head, and severity-downgrade checks.
2. startup hard-fail when audit chain is broken or severity downgrade is detected.
3. CRITICAL incident lifecycle simulation with full evidence for `DETECT -> CLASSIFY -> RESPOND -> RESOLVE`.
4. observability SLI/SLO runtime contract for:
   - offline retry success rate
   - offline escalation rate
   - audit write latency
5. structured metrics emission endpoint (`GET /api/v1/ops/metrics`) and SLO metadata endpoint (`GET /api/v1/ops/slis`).
6. runtime report performance budget enforcement with explicit block response on hard-limit breach.
7. policy preview API caching (`ETag`, `Cache-Control`) and policy failure fallback UX for POS flows.
8. admin-only audit viewer behavior enforced in dashboard UI.

---

## 3. Implementation References

- Discounts module:
  - `src/modules/discounts/discountsService.ts`
  - `src/modules/discounts/discountsRoutes.ts`
- Multi-store reporting extension:
  - `src/modules/reporting-extensions/reportingExtensionsService.ts`
  - `src/modules/reporting-extensions/reportingExtensionsRoutes.ts`
- Risk/compliance module:
  - `src/modules/risk-compliance/riskComplianceService.ts`
  - `src/modules/risk-compliance/riskComplianceRoutes.ts`
- Router integration:
  - `src/routes/api.ts`
- Permission updates:
  - `src/config/permissions.ts`
- Policy impact governance:
  - `docs/discount_policy_change_template.md`

---

## 4. Test Evidence References

- Integration: `test/phase5.modules.test.ts`
- E2E: `e2e/phase5.extensions.spec.ts`
- Traceability: `docs/TC_traceability_matrix.md` section 3.4

---

## 5. Phase 6 Hardening Requirements

### FR-P6-901 Audit Append-Only Contract (P0)
Requirement:
- audit records must be append-only with immutable chain metadata.

Acceptance criteria:
1. each audit record includes `sequence`, `previousHash`, and `entryHash`.
2. update/delete attempts are rejected by service contract.
3. actor and timestamp are mandatory on every entry.

### FR-P6-902 Audit Chain Verification (P1)
Requirement:
- audit chain integrity must be verifiable at runtime.

Acceptance criteria:
1. chain verification reports valid/invalid state deterministically.
2. broken links identify failing sequence index.

### FR-P6-903 Immutable Compliance Event Handling (P1)
Requirement:
- compliance and security event logs must be append-only and query-only.

Acceptance criteria:
1. event feeds are read-only.
2. no mutation endpoint exists for event rows.

### FR-P6-904 Security Event Taxonomy (P0)
Requirement:
- risk/security events must be classified into `INFO`, `WARN`, `CRITICAL`.

Acceptance criteria:
1. risk mode and factors map to deterministic severity.
2. severity filter is supported on security events endpoint.

### FR-P6-905 Security Events Read API (P1)
Requirement:
- expose tenant/branch scoped, read-only security event feed.

Acceptance criteria:
1. endpoint is role-restricted to owner/manager roles.
2. cross-tenant access is denied.

### FR-P6-906 Risk Enforcement Toggle (P0)
Requirement:
- risk enforcement must support tenant-scoped feature flag control.

Acceptance criteria:
1. `risk_enforcement=false` bypasses policy lock while remaining explicit/non-silent.
2. bypass actions are audit logged.

### FR-P6-907 Tenant Feature Flags (P0)
Requirement:
- tenant-scoped feature flags must manage hardening-controlled modules.

Acceptance criteria:
1. flags exist for `advanced_discounts`, `loyalty_rules`, `risk_enforcement`.
2. owner roles can update flags; manager is read-only.

### FR-P6-908 Discount Module Flag Enforcement (P1)
Requirement:
- advanced discount operations must fail closed when disabled.

Acceptance criteria:
1. evaluate/apply return explicit `FEATURE_FLAG_DISABLED` when flag is off.
2. no hidden fallback logic runs.

### FR-P6-909 Loyalty Rule Flag Enforcement (P1)
Requirement:
- loyalty rule mutation paths must fail closed when disabled.

Acceptance criteria:
1. accrue/redeem/rule update operations return `FEATURE_FLAG_DISABLED` when disabled.
2. writes are blocked consistently across API and offline mutation paths.

### FR-P6-910 Dev/Staging/Prod Promotion Contract (P1)
Requirement:
- release governance must formalize environment promotion and rollback controls.

Acceptance criteria:
1. promotion model, rollback triggers, and artifact versioning are documented.
2. release governance references release gate blockers.

### FR-P6-911 Reporting Performance Guardrails (P1)
Requirement:
- multi-store reporting must enforce pagination budgets for large tenants.

Acceptance criteria:
1. page/pageSize limits are enforced at API layer.
2. response includes pagination metadata and aggregation mode.

### FR-P6-912 Offline Sync SLA Contract (P0)
Requirement:
- offline sync must define retry, backoff, and replay window constraints.

Acceptance criteria:
1. queue items include retry and replay metadata.
2. offline status exposes SLA policy details.

### FR-P6-913 Prolonged Offline UX Signaling (P1)
Requirement:
- UI must show non-silent prolonged-offline feedback.

Acceptance criteria:
1. status response includes prolonged-offline indicator.
2. UI surfaces warning state with operator guidance.

### FR-P6-914 Replay Window Enforcement (P0)
Requirement:
- queued operations beyond replay window must be blocked and escalated.

Acceptance criteria:
1. expired replay items are marked failed with explicit error code.
2. escalation alert is generated.

### FR-P6-915 Retry Backoff Enforcement (P1)
Requirement:
- sync retry flow must defer processing until next retry window.

Acceptance criteria:
1. deferred item count is reported.
2. retry schedule follows bounded exponential backoff.

### FR-P6-916 Duplicate Sync Storm Resilience (P0)
Requirement:
- duplicate replay storms must remain idempotent and auditable.

Acceptance criteria:
1. duplicates are rejected deterministically.
2. stock/ledger integrity is preserved.

### FR-P6-917 Offline Failure Escalation Policy (P1)
Requirement:
- repeated sync failures must escalate with explicit alerts.

Acceptance criteria:
1. retry exhaustion emits read-only escalation alert.
2. replay-window expiry emits block escalation alert.

### FR-P6-918 Mid-Session Risk Policy Flip Behavior (P1)
Requirement:
- policy/flag changes during active sessions must be explicit and testable.

Acceptance criteria:
1. behavior changes immediately after flag update.
2. transitions are audit visible.

### FR-P6-919 Accessibility Baseline (P1)
Requirement:
- UI governance must define accessibility baseline and keyboard behavior.

Acceptance criteria:
1. guidelines include keyboard navigation and focus visibility.
2. alert severity visual hierarchy is documented.

### FR-P6-920 Phase 6 Traceability Closure (P0)
Requirement:
- all Phase 6 requirements must map to passing test evidence.

Acceptance criteria:
1. `docs/TC_traceability_matrix.md` contains `FR-P6-901..FR-P6-933` as `PASS`.
2. `docs/change_log.md` records evidence and release-readiness note.

---

## 6. Phase 6 Implementation References

- Audit/security services:
  - `src/services/auditService.ts`
  - `src/store/memoryStore.ts`
  - `src/modules/risk-compliance/riskComplianceService.ts`
  - `src/modules/risk-compliance/riskComplianceRoutes.ts`
- Feature flags:
  - `src/services/featureFlagService.ts`
  - `src/modules/feature-flags/featureFlagRoutes.ts`
  - `src/routes/api.ts`
- Offline SLA hardening:
  - `src/services/posService.ts`
  - `src/modules/offline-enhancements/offlineEnhancementsService.ts`
  - `web/app.js`
- Release governance:
  - `docs/release_governance.md`

---

## 7. Phase 6 Test Evidence References

- Security: `test/phase6.security.test.ts`
- Performance: `test/phase6.performance.test.ts`
- Chaos: `test/phase6.chaos.test.ts`
- Regression: `npm test`, `npm run test:e2e`, `npm run build`
- Traceability: `docs/TC_traceability_matrix.md` sections 3.5 and 3.7

---

## 8. Phase 6 Governed Expansion Requirements

### FR-P6-921 Tenant-Level Read Scaling Abstraction (P1)
Requirement:
- read-heavy tenant analytics/reporting endpoints must support cache and replica-hinted read abstraction.

Acceptance criteria:
1. reads are routed through scale-guard cache abstraction.
2. responses expose read source (`PRIMARY`/`REPLICA`/`CACHE`) and cache-hit signal.
3. capability is tenant-scoped and feature-flagged (`scale_reads`, default OFF).

### FR-P6-922 Background Aggregation Jobs (P0)
Requirement:
- aggregation must run asynchronously so POS/API mutation paths remain non-blocking.

Acceptance criteria:
1. aggregation enqueue endpoint returns `202` with job reference.
2. job states include queued/running/succeeded/timeout/failed.
3. snapshot outputs are tenant/branch-scoped and auditable.
4. capability is feature-flagged (`background_aggregation`, default OFF).

### FR-P6-923 External Audit Export (Read-Only) (P0)
Requirement:
- external audit export must be read-only and tenant-scoped.

Acceptance criteria:
1. export supports CSV and JSON.
2. no mutation endpoint exists for external audit export.
3. access is feature-flagged (`external_audit_exports`, default OFF).

### FR-P6-924 Configurable Data Retention Policies (P1)
Requirement:
- tenant owners must manage retention policy values for audit/security/compliance/metrics.

Acceptance criteria:
1. policy read/write APIs are tenant-scoped.
2. validation enforces bounded day ranges.
3. policy changes are auditable.
4. access is feature-flagged (`data_retention_policies`, default OFF).

### FR-P6-925 Tenant SLA Metrics Exposure (Read-Only) (P1)
Requirement:
- tenant SLA snapshots must expose offline retry success, escalation rate, and audit latency.

Acceptance criteria:
1. endpoint is read-only.
2. SLA metrics are tenant/branch-scoped.
3. access is feature-flagged (`analytics_expansion`, default OFF).

### FR-P6-926 Historical Trend Reports (P1)
Requirement:
- analytics must provide historical trend output for non-AI operational metrics.

Acceptance criteria:
1. trend API supports `net_sales`, `receipts`, and `queue_pending`.
2. day-window filters are validated and tenant-scoped.
3. access is feature-flagged (`analytics_expansion`, default OFF).

### FR-P6-927 Comparative Period Analysis (P1)
Requirement:
- analytics must provide deterministic current-vs-previous period comparison.

Acceptance criteria:
1. response contains current period, previous period, delta, and delta percent.
2. analysis remains tenant/branch-scoped and non-AI.

### FR-P6-928 Export-Ready Analytics Datasets (P2)
Requirement:
- analytics datasets must be exportable in machine-ready formats.

Acceptance criteria:
1. format support includes CSV and JSON.
2. export rows align with trend dataset schema.

### FR-P6-929 Outbound Webhook Framework (P0)
Requirement:
- outbound-only webhook framework must support tenant endpoint registration and event dispatch.

Acceptance criteria:
1. endpoint registration is tenant-scoped and auditable.
2. dispatch supports idempotent fan-out per endpoint.
3. no inbound command/control webhook endpoint is available.
4. access is feature-flagged (`webhook_outbound`, default OFF).

### FR-P6-930 Webhook Idempotency, Retry, and Signature Verification (P0)
Requirement:
- webhook dispatch must include signature generation/verification and retry semantics.

Acceptance criteria:
1. duplicate idempotency keys do not create duplicate deliveries.
2. failures transition to retry/failed states deterministically.
3. signature verification endpoint reports validity for delivery evidence.

### FR-P6-931 Webhook Failure Chaos Behavior (P1)
Requirement:
- webhook failures must be explicit, retriable, and non-silent.

Acceptance criteria:
1. forced failure transitions to retry path.
2. retry logic preserves idempotent delivery count.

### FR-P6-932 Aggregation Timeout Chaos Behavior (P1)
Requirement:
- timeout simulation must mark aggregation jobs as timeout without blocking request thread.

Acceptance criteria:
1. enqueue call remains fast/non-blocking.
2. timeout status and error code are persisted.

### FR-P6-933 Cache Eviction Chaos Behavior (P2)
Requirement:
- cache eviction controls must invalidate analytics cache safely.

Acceptance criteria:
1. eviction endpoint removes tenant cache entries by prefix.
2. subsequent read path returns cache miss and rebuilds cache.

---

## 9. Phase 6 Expansion References

- Modules:
  - `src/modules/analytics/analyticsService.ts`
  - `src/modules/analytics/analyticsRoutes.ts`
  - `src/modules/exports/exportsService.ts`
  - `src/modules/exports/exportsRoutes.ts`
  - `src/modules/webhooks/webhookService.ts`
  - `src/modules/webhooks/webhookRoutes.ts`
- Jobs and services:
  - `src/jobs/aggregation/aggregationJobService.ts`
  - `src/services/scaleGuardService.ts`
- Test evidence:
  - `test/phase6.modules.test.ts`
  - `test/phase6.performance.test.ts`
  - `test/phase6.security.test.ts`
  - `test/phase6.chaos.test.ts`
  - `e2e/phase6.extensions.spec.ts`
- Traceability:
  - `docs/TC_traceability_matrix.md` section 3.7

---

## 10. Phase 6.1 Non-Functional Hardening Addendum (No New FR IDs)

Scope rule:
- additive safeguards only; no Phase 5.x or previously accepted Phase 6 behavior drift.

Mapped safeguards to existing FRs:
1. FR-P6-921: ScaleGuard contract validation is formalized with contract tests for cache/read-source/tenant isolation and prefix eviction behavior.
2. FR-P6-922: background aggregation and retention purge jobs must emit standard job metrics (`job_duration_ms`, `job_retry_count`, `job_failure_count`) and use system-actor identity.
3. FR-P6-924: scheduled retention purge execution is required as an operational guardrail (policy-driven, tenant-scoped).
4. FR-P6-926 and FR-P6-923: analytics and external export collection endpoints must enforce pagination bounds consistently.
5. FR-P6-928: analytics dataset export schema/header stability is verified with snapshot tests.
6. FR-P6-930: outbound webhook dispatch adds rate-limit and circuit-breaker safeguards; negative E2E failure path must remain explicit and non-silent.
7. FR-P6-920: Phase 6 is marked `LOCKED` after hardening evidence and `ci:gate` pass.

Verification references:
- `test/scaleGuard.contract.test.ts`
- `test/phase6.modules.test.ts`
- `test/phase6.analytics.snapshot.test.ts`
- `e2e/phase6.extensions.spec.ts`
- `scripts/ci-gate.ts`

---

## 11. Phase 7 Operational Intelligence Requirements (FR-P7-1001..FR-P7-1020)

Scope guardrails:
1. additive-only capability expansion.
2. no POS transaction, pricing, or discount mutation behavior changes.
3. control-plane and read-only intelligence features only.
4. Phase 7 feature flags default OFF.

### 11.1 Observability and Health (FR-P7-1001..FR-P7-1004)

| FR ID | Priority | Requirement | Acceptance Summary |
|---|---|---|---|
| FR-P7-1001 | P1 | Expose observability overview cards for runtime health. | Tenant-scoped cards for metrics volume, webhook retrying, aggregation queue/running, and cache entries. |
| FR-P7-1002 | P0 | Provide SLA snapshot endpoint with threshold references. | Offline retry success, escalation rate, and audit latency p95 are returned with target thresholds. |
| FR-P7-1003 | P0 | Trigger explicit alert records from SLA threshold breaches. | WARN/CRITICAL alerts are non-silent, machine-readable, and support UI severity rendering. |
| FR-P7-1004 | P1 | Expose recent job metric feed for operations review. | `job_duration_ms`, `job_retry_count`, and `job_failure_count` are queryable with pagination and tenant scope. |

### 11.2 Predictive Analytics (Read-Only) (FR-P7-1005..FR-P7-1008)

| FR ID | Priority | Requirement | Acceptance Summary |
|---|---|---|---|
| FR-P7-1005 | P0 | Predictive trend endpoint for operational metrics. | Forecast output includes history + projected rows with confidence score. |
| FR-P7-1006 | P0 | Predictive SLA violation risk endpoint. | Horizon-based prediction returns INFO/WARN/CRITICAL risk with reasons. |
| FR-P7-1007 | P1 | Predictive export in CSV/JSON. | Read-only export dataset supports deterministic CSV + JSON parity. |
| FR-P7-1008 | P0 | Predictive safety and isolation contract. | Predictive routes are read-only, queue-safe, and reject cross-tenant/cross-branch access. |

### 11.3 Integration Control Plane (FR-P7-1009..FR-P7-1012)

| FR ID | Priority | Requirement | Acceptance Summary |
|---|---|---|---|
| FR-P7-1009 | P0 | Integration client registry for outbound webhook control. | Tenant-scoped client create/list flows are auditable. |
| FR-P7-1010 | P0 | Integration token generation/rotation/verification. | Token hash is stored; raw token returned only at creation/rotation; verify endpoint is read-only. |
| FR-P7-1011 | P0 | Per-client kill-switch for outbound events. | Active kill-switch prevents linked dispatch non-silently with explicit control-plane status. |
| FR-P7-1012 | P0 | Outbound webhook integrity contract. | Idempotent dispatch, signature verification, and retry evidence remain explicit and auditable. |

### 11.4 Compliance Export and Legal Hold (FR-P7-1013..FR-P7-1015)

| FR ID | Priority | Requirement | Acceptance Summary |
|---|---|---|---|
| FR-P7-1013 | P0 | Read-only compliance export dataset. | CSV/JSON export is tenant/branch-scoped and includes legal-hold visibility fields. |
| FR-P7-1014 | P1 | Legal-hold visibility endpoints. | Legal-hold lists are read-only for authorized roles and enforce tenant scope. |
| FR-P7-1015 | P1 | Legal-hold control actions. | Create/release actions are owner-scoped and audit logged with immutable records. |

### 11.5 Feature Flag Expansion (FR-P7-1016..FR-P7-1018)

| FR ID | Priority | Requirement | Acceptance Summary |
|---|---|---|---|
| FR-P7-1016 | P1 | Add observability/predictive feature flags (default OFF). | `phase7_observability` and `phase7_predictive` fail closed when disabled. |
| FR-P7-1017 | P1 | Add integration/compliance feature flags (default OFF). | `phase7_integration_control` and `phase7_compliance_exports` fail closed when disabled. |
| FR-P7-1018 | P2 | Add scale-guard phase flag (default OFF). | `phase7_scale_guard` gates cache/stats/eviction controls and fail-closed behavior. |

### 11.6 Scale Guard, Aggregation, and Routing Enforcement (FR-P7-1019..FR-P7-1020)

| FR ID | Priority | Requirement | Acceptance Summary |
|---|---|---|---|
| FR-P7-1019 | P1 | Scale guard and aggregation observability contract. | Read source hints, cache stats, queue/running job metrics, and timeout states are explicit and queryable. |
| FR-P7-1020 | P0 | Route/RBAC isolation contract for Phase 7 endpoints. | Tenant/branch isolation and role enforcement reject unauthorized cross-scope access (`403`) across observability/predictive/integration/compliance/scale-guard paths. |

## 12. Phase 7 References

- Modules:
  - `src/modules/observability/metricsService.ts`
  - `src/modules/observability/metricsRoutes.ts`
  - `src/modules/analytics/predictiveService.ts`
  - `src/modules/analytics/predictiveRoutes.ts`
  - `src/modules/compliance/complianceService.ts`
  - `src/modules/compliance/complianceRoutes.ts`
  - `src/modules/webhooks/integrationControlService.ts`
  - `src/modules/webhooks/webhookService.ts`
  - `src/modules/webhooks/webhookRoutes.ts`
  - `src/services/scaleGuardService.ts`
- UI:
  - `web/ops-dashboard.html`
  - `web/ops-dashboard.js`
  - `web/ops-dashboard.css`
- Test evidence:
  - `test/phase7.modules.test.ts`
  - `test/phase7.performance.test.ts`
  - `test/phase7.chaos.test.ts`
  - `e2e/phase7.extensions.spec.ts`
- Release and gate:
  - `scripts/ci-gate.ts`
  - `docs/TC_traceability_matrix.md` (Phase 7 section)

---

END OF DOCUMENT
