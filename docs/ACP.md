# Acceptance Criteria Pack
Cosmic Forge Grocery POS

---

## 1. Multi-Tenant Isolation

### AC-MT-01
Given: Two tenants exist  
When: Tenant A user queries data  
Then: Tenant B data must never appear  

Pass Condition:
- Verified at DB and API level

---

## 2. Offline Sales

### AC-OS-01
Given: Device is offline  
When: A sale is completed  
Then:
- Sale completes within 2 seconds
- Receipt is generated
- Transaction is queued

---

### AC-OS-02
Given: Device reconnects  
When: Sync begins  
Then:
- No duplicate sales
- UUID idempotency enforced

---

## 3. Conflict Resolution

### AC-CR-01
Given: Price changed on server  
When: Offline sale syncs  
Then:
- Server price applied
- User is notified

Silent resolution = FAIL

---

## 4. Inventory Integrity

### AC-INV-01
Given: Stock deducted offline  
When: Sync completes  
Then:
- Inventory reflects correct quantity
- No negative stock allowed

---

## 5. Location & VPN Control

### AC-SEC-01
Given: VPN detected  
When: Risk score is medium  
Then:
- Warning displayed
- Read-only mode applied

---

### AC-SEC-02
Given: Admin override  
Then:
- Override reason is required
- Action is logged

---

## 6. Reports

### AC-REP-01
Each report MUST define:
- Fields
- Filters
- Formula
- Export (CSV / PDF)

Missing definition = FAIL

---

## 7. Performance

### AC-PERF-01
Sales checkout must complete in:
- < 2 seconds online
- < 2 seconds offline

---

## 8. Backup & Recovery

### AC-BACKUP-01
Given: Data loss scenario  
Then:
- Restore within RTO
- Data loss ≤ RPO

---

## 9. RBAC Edge Cases

### AC-RBAC-01
Given: A user calls an endpoint outside role permissions  
When: Request is processed  
Then:
- HTTP 403 is returned
- Denial is audit logged with tenant_id and actor

### AC-RBAC-02
Given: UI hides an action but user sends direct API request  
When: API authorization runs  
Then:
- Request is still denied
- No data mutation occurs

### AC-RBAC-03
Given: Session enters READ_ONLY mode by policy  
When: Cashier or inventory staff attempts mutation  
Then:
- Mutation is blocked
- User sees explicit read-only reason

---

## 10. Branding Governance

### AC-BRAND-01
Given: App is rendered in any module  
Then:
- No hardcoded logo path exists in UI
- Branding is loaded from BrandService only

### AC-BRAND-02
Given: Tenant branding changes  
When: Next UI load occurs  
Then:
- Updated tenant brand appears without code change
- App brand remains isolated from tenant brand

---

## 11. Report Access by Role

### AC-REP-ROLE-01
Given: Cashier requests restricted tenant report (for example profit summary)  
Then:
- Access is denied unless explicitly granted by policy

### AC-REP-ROLE-02
Given: Non-application-owner requests owner global report  
Then:
- Access is denied

### AC-REP-ROLE-03
Given: Report export is requested  
Then:
- Export is available only in CSV and PDF
- Export totals equal on-screen totals

---

## 12. In-App Notifications (Phase 3)

### AC-NOT-01
Given: Loyalty points are earned or redeemed  
When: Points ledger changes are committed  
Then:
- A tenant/branch-scoped in-app notification is generated
- Notification respects role scope and includes event metadata

### AC-NOT-02
Given: Stock reaches alert threshold  
When: Inventory action completes  
Then:
- Low-stock notification is generated
- Notification is visible to manager/owner/inventory roles in same tenant+branch

### AC-NOT-03
Given: Offline conflict or risk enforcement mode occurs (`WARN` / `READ_ONLY` / `BLOCK`)  
When: Session or sync processing updates enforcement state  
Then:
- Explicit in-app warning notification is generated
- Read-only or block state is visible in UI (banner/toast/overlay)

### AC-NOT-04
Given: Notification delivery channel is offline  
When: A notification is triggered  
Then:
- Notification is queued as pending
- Retry endpoint delivers queued notifications after connectivity restore
- Duplicate trigger idempotency key does not create duplicate notification records

### AC-NOT-05
Given: User from another tenant/branch queries notification feed  
When: Request is processed  
Then:
- Access is denied or out-of-scope notifications are excluded
- No cross-tenant notification leakage occurs

---

## 13. Release Gate Requirement Link

Release cannot proceed unless this ACP is fully satisfied and signed off per:
- `docs/Release-Gatekeeper.md` section "Required Evidence for Release"
- `docs/Release-Gatekeeper.md` section "Absolute Production Blockers"

Any unmet ACP item = release block.

---

## 14. Phase 4 Extensions (Loyalty / Offline / Reporting)

### AC-P4-LOY-01
Given: Manager or owner submits loyalty accrual  
When: Request is accepted  
Then:
- Points are added to customer balance
- Loyalty ledger and reward history entries are created
- Tenant/branch/user audit record exists

### AC-P4-LOY-02
Given: Cashier attempts loyalty redemption write  
When: Request is processed  
Then:
- HTTP 403 is returned
- No loyalty mutation occurs

### AC-P4-LOY-03
Given: Authorized user redeems points  
When: Points are below minimum redeem threshold or balance  
Then:
- Request is rejected with explicit error
- Balance remains unchanged

### AC-P4-OFF-01
Given: Loyalty/report operation is queued offline  
When: Queue write succeeds  
Then:
- Queue item includes idempotency key, tenant_id, branch_id
- Offline event log records QUEUED state

### AC-P4-OFF-02
Given: Offline reconcile processes queued events  
When: Duplicate idempotency key is detected  
Then:
- Event is marked FAILED with duplicate reason
- No duplicate transaction record is created

### AC-P4-OFF-03
Given: Offline loyalty reconcile hits balance mismatch/insufficient points  
When: Reconcile runs  
Then:
- Event is marked CONFLICT
- Conflict record is created and visible
- Conflict handling is explicit (non-silent)

### AC-P4-REP-01
Given: Reporting extension template is requested  
When: User role is unauthorized for template  
Then:
- HTTP 403 is returned
- Template data is not exposed

### AC-P4-REP-02
Given: Reporting extension is exported  
When: Export format is CSV/PDF/Printable  
Then:
- Endpoint returns matching content type
- Exported row values match generated report rows

### AC-P4-UI-01
Given: POS and dashboard Phase 4 modules load  
When: User opens UI pages  
Then:
- Loyalty balance/redeem controls are visible in POS
- Reward KPI/offline/reports-extension controls are visible in dashboard
- UI shows offline enhanced status indicators

---

## 15. Phase 5 Runtime Acceptance (Discounts / Multi-Store Reporting / Risk Compliance)

### AC-P5-01
Given: Advanced discount payload is submitted  
When: system evaluates stackable rules  
Then:
- rule evaluation order is deterministic (`VOLUME`, `BASKET`, `CATEGORY`, `COUPON`, `LOYALTY`, `MANUAL`)
- conflict rule is explicit: `COUPON` and `MANUAL` share one promo bucket and highest/equal-precedence rule wins
- caps are enforced for base, promo, loyalty, and global discount totals
- loyalty synergy can contribute to discount
- cashier manual override is denied

### AC-P5-02
Given: Multi-store report is requested  
When: manager/owner role executes report endpoint  
Then:
- data is tenant-scoped and aggregated by branch
- unauthorized cashier access is denied
- CSV and PDF exports are available

### AC-P5-03
Given: Risk policy evaluation is executed  
When: factors match configured WARN / READ_ONLY / BLOCK policy  
Then:
- WARN allows action with warning state
- READ_ONLY denies writes
- BLOCK denies restricted operations with HTTP 403

### AC-P5-04
Given: Risk/compliance and reporting actions run  
When: audit and compliance logs are queried  
Then:
- logs include tenant_id, branch_id, actor, decision, and mode
- multi-store report audit reason includes template + filter references
- event feed access is role-restricted

### AC-P5-06
Given: audit entries are created  
When: mutation attempts target existing audit records  
Then:
- audit trail is append-only (no update/delete behavior)
- persisted audit entries remain immutable after creation
- negative test evidence confirms overwrite/delete attempts do not alter stored records

### AC-P5-05
Given: POS and Dashboard UIs load Phase 5 modules  
When: user executes discount/report/risk flows  
Then:
- POS shows advanced discount and risk evaluation controls
- dashboard shows phase5 module section and report/risk controls
- E2E evidence validates UI behavior

---

## 16. Phase 6 Hardening Acceptance (Security / Scale / Governance)

### AC-P6-01
Given: Any audit entry is persisted  
When: an update/delete mutation is attempted through service contracts  
Then:
- mutation is rejected with immutable error
- append-only chain metadata (`sequence`, `previousHash`, `entryHash`) remains intact

### AC-P6-02
Given: Risk/compliance evaluation runs  
When: severity is computed from mode/factors  
Then:
- security events are classified as `INFO`, `WARN`, or `CRITICAL`
- security events endpoint is read-only and role-restricted

### AC-P6-03
Given: Tenant feature flags are changed  
When: `advanced_discounts`, `loyalty_rules`, or `risk_enforcement` are disabled  
Then:
- affected module paths return explicit `FEATURE_FLAG_DISABLED` or bypass response
- behavior change is immediate and audit visible

### AC-P6-04
Given: Offline queue enters retry/failure scenarios  
When: sync retries execute  
Then:
- retry/backoff windows are enforced
- replay window expiry blocks stale replay
- escalation alerts are generated with explicit severity

### AC-P6-05
Given: Multi-store report volume grows  
When: report endpoints are called  
Then:
- pagination limits are enforced
- aggregation mode and paging metadata are returned
- performance budget checks remain within threshold envelope

### AC-P6-06
Given: UI renders operational states during prolonged offline conditions  
When: pending queue age crosses SLA threshold  
Then:
- UI displays explicit warning state
- no silent degradation occurs

### AC-P6-07
Given: Phase 6 release candidate is prepared  
When: release governance checklist is reviewed  
Then:
- DEV->STAGING->PROD promotion rules are documented
- artifact versioning and rollback triggers are documented
- smoke test tier is defined

### AC-P6-08
Given: Phase 6 traceability is reviewed  
When: matrix is checked against FR aliases  
Then:
- `FR-P6-901..FR-P6-933` are mapped to evidence and marked PASS
- no PENDING rows remain for Phase 6

---

## 17. Incident Lifecycle Acceptance

### AC-INC-01
Given: security/compliance incident is detected  
When: operations workflow starts  
Then:
- lifecycle must follow `detect -> classify -> respond -> resolve`
- each stage is timestamped and auditable

### AC-INC-02
Given: incident is classified  
When: severity is assigned  
Then:
- severity must be `INFO`, `WARN`, or `CRITICAL`
- classification drives response path and release decision gates

---

## 18. Phase 5.1 Hardening Acceptance (No New FR IDs)

### AC-P5H-01
Given: Discount evaluation/apply is executed  
When: policy conflict or cap enforcement occurs  
Then:
- response includes rejection reason codes and human-readable messages
- POS UI exposes rule breakdown and rejection visibility

### AC-P5H-02
Given: Admin dashboard loads audit module  
When: user is manager/owner role  
Then:
- read-only audit entries are visible with severity tags
- no UI path exists for audit mutation

### AC-P5H-03
Given: Multi-store reporting is executed at mocked scale  
When: performance/load test runs  
Then:
- response remains within defined hard threshold budget
- pagination limits remain enforced

---

## 19. Phase 6.1 Operational Readiness Acceptance (No New FR IDs)

### AC-P6R-01
Given: Audit subsystem is active  
When: `GET /api/v1/audit/integrity` is called  
Then:
- endpoint is read-only
- response includes chain validity, anchor head, and severity downgrade count
- chain must be valid before release

### AC-P6R-02
Given: Startup sequence initializes runtime  
When: audit chain is broken or severity downgrade exists  
Then:
- app startup fails closed
- release is blocked

### AC-P6R-03
Given: Incident drill is executed  
When: CRITICAL simulation runs  
Then:
- evidence exists for `detect -> classify -> respond -> resolve`
- each lifecycle stage is tenant/branch scoped and auditable

### AC-P6R-04
Given: Offline/report/audit operations are exercised  
When: metrics endpoint is queried  
Then:
- structured metrics include offline retry success rate, escalation rate, and audit latency
- SLI/SLO metadata endpoint returns target contract values

### AC-P6R-05
Given: Discount policy preview endpoint is called  
When: policy state is unchanged  
Then:
- response supports `ETag` and cache policy (`max-age`)
- reason code enums remain stable across locale changes

### AC-P6R-06
Given: Non-admin dashboard role opens audit UI  
When: page renders  
Then:
- admin audit section is hidden
- no read path bypass exists through UI controls

### AC-P6R-07
Given: Report request runtime exceeds hard budget  
When: endpoint enforces runtime budget  
Then:
- request fails with explicit block response
- performance violation is auditable

### AC-P6R-08
Given: Phase 5.x closure is reviewed  
When: release gate executes  
Then:
- Phase 5.x exit gate is signed
- Phase 6 freeze and Phase 7 boundary are documented

---

## 20. Phase 6 Expansion Acceptance (Governed)

### AC-P6E-01
Given: analytics expansion and scale-read flags are enabled for a tenant  
When: trend endpoint is called repeatedly with same scope  
Then:
- first call returns cache miss with primary/replica source
- subsequent call can return cache hit
- response remains tenant-scoped

### AC-P6E-02
Given: background aggregation flag is enabled  
When: aggregation job is enqueued  
Then:
- enqueue returns `202` without blocking
- job transitions through explicit states
- snapshot evidence is queryable

### AC-P6E-03
Given: external audit export flag is enabled  
When: audit export endpoint is called  
Then:
- CSV/JSON export is available
- endpoint is read-only
- cross-tenant access is denied

### AC-P6E-04
Given: retention policy flag is enabled  
When: owner updates retention values  
Then:
- values are validated with bounded range
- update is persisted and auditable

### AC-P6E-05
Given: analytics expansion flag is enabled  
When: tenant SLA endpoint is called  
Then:
- response includes offline retry success rate
- response includes escalation rate
- response includes audit latency metric

### AC-P6E-06
Given: webhook outbound flag is enabled  
When: event dispatch is executed with endpoint registration  
Then:
- delivery is outbound-only
- duplicate idempotency key does not duplicate fan-out
- signature verification endpoint confirms delivery signature

### AC-P6E-07
Given: chaos simulation is executed for expansion modules  
When: webhook failure, aggregation timeout, and cache eviction are triggered  
Then:
- failure and retry states are explicit
- timeout state is persisted with error code
- cache eviction forces miss/rebuild behavior

### AC-P6E-08
Given: Phase 6 expansion traceability is reviewed  
When: FR aliases `FR-P6-921..FR-P6-933` are checked  
Then:
- mapped TC rows are present with evidence
- status is PASS only after test execution

---

## 21. Phase 6.1 Non-Functional Hardening Acceptance (No New FR IDs)

### AC-P6NF-01
Given: Outbound webhook dispatch volume spikes or repeated failures occur  
When: dispatch endpoint processes requests  
Then:
- tenant-level rate limiting is enforced
- circuit breaker opens after threshold failures
- failure mode is explicit (`WEBHOOK_RATE_LIMITED` or `WEBHOOK_CIRCUIT_OPEN`)

### AC-P6NF-02
Given: Retention policies are configured per tenant  
When: scheduler interval elapses  
Then:
- retention purge runs automatically
- purge respects tenant policy windows
- run emits structured job metrics and audit evidence

### AC-P6NF-03
Given: Background jobs write audit evidence  
When: aggregation/retention jobs execute  
Then:
- actor identity is `system:background-job`
- actor role is system-authorized and non-interactive

### AC-P6NF-04
Given: Analytics/export collection endpoints are queried  
When: `pageSize` exceeds contract maximum  
Then:
- request fails validation explicitly
- accepted requests return pagination metadata envelope

### AC-P6NF-05
Given: Core role/feature-flag contracts are loaded at startup  
When: contract integrity is checked  
Then:
- core contracts are frozen
- startup rejects contract drift

### AC-P6NF-06
Given: Webhook failure path is tested end-to-end  
When: delivery failure is forced repeatedly  
Then:
- retries and guard responses remain explicit
- no silent success state is reported

### AC-P6NF-07
Given: Analytics exports are generated in JSON/CSV  
When: snapshot tests run  
Then:
- dataset schema and CSV header remain stable
- drift is caught as a test failure

### AC-P6NF-08
Given: Phase 6.1 hardening is complete  
When: release gate checks execute  
Then:
- `ci:gate` passes
- traceability rows for mapped existing FRs are PASS
- Phase 6 is marked `LOCKED`

---

## 22. Phase 7 Operational Intelligence Acceptance (FR-P7-1001..FR-P7-1020)

Traceability alignment:
- Phase 7 acceptance criteria map to `FR-P7-1001..FR-P7-1020` and corresponding `TC-FR-1001..TC-FR-1020` evidence rows.

### AC-P7-01
Given: observability flag is enabled  
When: tenant operations query dashboard endpoints  
Then:
- overview cards, SLA snapshot, alerts, and job metrics are returned
- responses are tenant-scoped and paginated where applicable

### AC-P7-02
Given: predictive flag is enabled  
When: predictive trend/SLA endpoints are called  
Then:
- outputs remain read-only
- trend and SLA predictions include explicit risk/context metadata
- no transactional side effects occur

### AC-P7-03
Given: predictive export endpoint is used  
When: format is `csv` or `json`  
Then:
- export schema is deterministic and machine-readable
- CSV and JSON parity is preserved

### AC-P7-04
Given: integration control flag is enabled  
When: integration clients are created/rotated/verified  
Then:
- raw token is returned only on create/rotate
- token verification is read-only
- stored token value is hashed (no plaintext storage)

### AC-P7-05
Given: integration kill-switch is enabled for a client  
When: linked webhook dispatch is attempted  
Then:
- dispatch is blocked explicitly (non-silent)
- audit evidence records the blocked control-plane state

### AC-P7-06
Given: compliance export flag is enabled  
When: compliance export is requested  
Then:
- output includes audit/security/compliance evidence rows
- legal-hold visibility is included in row context
- export remains read-only

### AC-P7-07
Given: legal hold control endpoint is used  
When: owner role creates/releases hold  
Then:
- hold state is visible in legal-hold list
- actions are tenant-scoped and auditable

### AC-P7-08
Given: scale guard flag is enabled  
When: scale stats and cache eviction endpoints are used  
Then:
- stats are read-only and tenant-scoped
- eviction is tenant-safe and audited

### AC-P7-09
Given: chaos/performance suites execute  
When: webhook failure, delayed aggregation, restart, and cache-eviction scenarios run  
Then:
- failure states remain explicit
- no silent data loss or tenant leakage occurs

### AC-P7-10
Given: Phase 7 release candidate is validated  
When: `npm run build`, `npm test`, `npm run test:e2e`, and `npm run ci:gate` execute  
Then:
- all Phase 7 mapped tests pass
- no regressions are present in Phases 1-6
- Phase 7 can be marked `LOCKED`

---

## 23. Phase 8 Actionable Intelligence Acceptance (FR-P8-1101..FR-P8-1120)

Traceability alignment:
- Phase 8 acceptance criteria map to `FR-P8-1101..FR-P8-1120` and corresponding `TC-FR-1101..TC-FR-1120` evidence rows.

### AC-P8-01
Given: predictive action feature flag is enabled  
When: manager/owner queries predictive action endpoint  
Then:
- paginated action list is returned
- action rows include severity, dataset, status, recommendation, and source reference
- tenant/branch isolation is preserved

### AC-P8-02
Given: predictive action exists  
When: authorized user executes `ACKNOWLEDGE`/`EXECUTE`/`DISMISS`  
Then:
- status transition is explicit and persisted
- corresponding audit and structured metric records are created
- unauthorized write roles are denied

### AC-P8-03
Given: ops enhancement feature flag is enabled  
When: observability insights endpoint is queried  
Then:
- severity/status filters are applied deterministically
- response includes summary counters, action rows, and severity legend
- offline fallback state is explicit when queue backlog is present

### AC-P8-04
Given: scale guard and ops enhancement flags are enabled  
When: scale advisory endpoint is queried  
Then:
- response includes throughput class, latency summary, cache hit-rate, and advisory hints
- output remains tenant/branch scoped

### AC-P8-05
Given: integration control and webhook outbound flags are enabled  
When: webhook dispatch and verification flows run  
Then:
- outbound-only contract is explicit in dispatch result
- duplicate idempotency key does not duplicate deliveries
- signature verification endpoint returns validity and algorithm metadata

### AC-P8-06
Given: webhook failure is simulated  
When: dispatch is attempted  
Then:
- response preserves explicit retry/failed status
- no silent success is reported

### AC-P8-07
Given: compliance export is requested  
When: JSON/CSV export is generated  
Then:
- rows include `legal_hold_active`, `retention_days`, `retention_expires_at`, and `immutable_record`
- pagination metadata is returned for collection responses
- export remains read-only

### AC-P8-08
Given: legal-hold and retention views are queried  
When: compliance governance endpoints return  
Then:
- append-only contract signal is present
- active legal-hold scope/count is explicit
- tenant retention values are visible

### AC-P8-09
Given: Phase 8 feature flags are disabled (default state)  
When: phase8-protected routes are called  
Then:
- fail-closed response is explicit (`FEATURE_FLAG_DISABLED`)
- no fallback mutation behavior occurs

### AC-P8-10
Given: Phase 8 release candidate is validated  
When: build, unit/integration, e2e, performance, security, chaos, and `ci:gate` run  
Then:
- all Phase 8 mapped tests pass
- no regression is introduced for Phases 1-7
- Phase 8 can be marked `PASS` and `LOCKED`

---

## 24. DB Provisioning & Migration Gate (Enforced)

### AC-DB-01
Given: a pull request targets `main` from `full-sync`  
When: merge gate workflow runs  
Then:
- `npm run build`, `npm test`, `npm run test:e2e`, `npm run test:security`, `npm run test:chaos`, `npm run test:performance`, and `npm run ci:gate` all pass
- CI fails if `SUPABASE_URL` is missing
- CI fails if `SUPABASE_SERVICE_ROLE_KEY` is missing
- Supabase migrations apply successfully
- migration drift checks return no drift (history and schema)

---

## 25. Phase 2 Foundation Acceptance (Schema / API / Mobile)

### AC-P2-01
Given: Phase 2 migration artifacts are present  
When: migration gate executes in CI  
Then:
- core schema migration file is detected in `supabase/migrations/`
- migration apply/list commands run with DB URL hidden in logs
- Windows local drift checks are skipped without blocking local apply/list validation

### AC-P2-02
Given: backend Phase 2 scaffold is present  
When: backend gates run  
Then:
- `npm run test:backend` passes
- `npm run test:api` passes
- route shell contracts for auth/products/orders/reporting return explicit JSON responses

### AC-P2-03
Given: mobile Phase 2 scaffold is present  
When: widget tests run  
Then:
- `flutter test` passes
- EN/MM localization assets load
- mobile environment contract exposes client keys only and does not embed DB/service-role secrets

---

END OF DOCUMENT
