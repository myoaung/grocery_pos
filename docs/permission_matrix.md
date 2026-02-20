# Cosmic Forge Grocery POS
## API Permission Matrix v1.9

Version: v1.9  
Status: Draft for Review  
Date: 2026-02-20  
Owner: Application Owner  
References: `docs/CFGP-MES-v1.0.md`, `docs/FRD-v1.2.md`, `docs/release_governance.md`

---

## 1. Role Keys

- `AO`: APPLICATION_OWNER
- `TO`: TENANT_OWNER
- `MG`: MANAGER
- `CA`: CASHIER
- `IS`: INVENTORY_STAFF

Decision values:
- `ALLOW`
- `DENY`
- `ALLOW_SCOPE` (allowed only within defined tenant/branch scope)

---

## 2. Enforcement Rules

1. Every tenant endpoint must enforce resolved `tenant_id`.
2. Branch-scoped endpoints must validate branch membership.
3. `AO` global endpoints are read-only unless explicitly stated.
4. Denied access returns HTTP 403 and audit log entry for privileged resources.
5. All mutation endpoints require authenticated session (HTTP 401 otherwise).

---

## 3. Authentication and Session

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Public auth entry |
| POST | `/api/v1/auth/logout` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Session owner only |
| GET | `/api/v1/auth/me` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Own session context |
| POST | `/api/v1/auth/refresh` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Own session token |

---

## 4. Tenant and Branch Management

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants` | ALLOW | DENY | DENY | DENY | DENY | Global tenant list |
| GET | `/api/v1/tenants/{tenantId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | TO/MG own tenant only |
| PATCH | `/api/v1/tenants/{tenantId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | TO own tenant only |
| GET | `/api/v1/tenants/{tenantId}/branches` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Own tenant only |
| POST | `/api/v1/tenants/{tenantId}/branches` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Branch create |
| PATCH | `/api/v1/tenants/{tenantId}/branches/{branchId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Branch update |

---

## 5. User and Role Management

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/users` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | User list within tenant |
| POST | `/api/v1/tenants/{tenantId}/users` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | MG may create only non-owner staff |
| PATCH | `/api/v1/tenants/{tenantId}/users/{userId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | MG cannot assign TO/AO roles |
| PATCH | `/api/v1/tenants/{tenantId}/users/{userId}/status` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Activate/deactivate |
| PATCH | `/api/v1/tenants/{tenantId}/users/{userId}/role` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | RBAC validation required |

---

## 6. Device Registration and Location Risk

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/devices` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Device inventory |
| POST | `/api/v1/tenants/{tenantId}/devices/register` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Register current device in tenant scope |
| PATCH | `/api/v1/tenants/{tenantId}/devices/{deviceId}/status` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Revoke/block/allow |
| GET | `/api/v1/risk/sessions` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Risk events |
| POST | `/api/v1/risk/overrides` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Requires reason + expiry |

---

## 7. Product Catalog

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/products` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read catalog |
| GET | `/api/v1/tenants/{tenantId}/products/{productId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read product |
| POST | `/api/v1/tenants/{tenantId}/products` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Create product |
| PATCH | `/api/v1/tenants/{tenantId}/products/{productId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Update product |
| DELETE | `/api/v1/tenants/{tenantId}/products/{productId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Soft delete preferred |

---

## 8. Inventory and Transfers

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/inventory/ledger` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Branch filter enforced |
| POST | `/api/v1/tenants/{tenantId}/inventory/stock-in` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Mutation + audit |
| POST | `/api/v1/tenants/{tenantId}/inventory/stock-out` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Mutation + audit |
| POST | `/api/v1/tenants/{tenantId}/inventory/adjustments` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Reason required |
| POST | `/api/v1/tenants/{tenantId}/inventory/damage` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Reason required |
| POST | `/api/v1/tenants/{tenantId}/inventory/transfers` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Source/destination branch validation |

---

## 9. Sales, Pricing, Tax, and Offline Sync

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/sales` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Sales list |
| GET | `/api/v1/tenants/{tenantId}/sales/{saleId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Sale details |
| POST | `/api/v1/tenants/{tenantId}/sales/checkout` | DENY | DENY | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Owner roles are read-only for checkout module |
| POST | `/api/v1/tenants/{tenantId}/sales/{saleId}/void` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Higher privilege action |
| POST | `/api/v1/tenants/{tenantId}/discounts/evaluate` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Cashier discount actions are not permitted directly |
| POST | `/api/v1/tenants/{tenantId}/discounts/override` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Requires override permission + reason |
| GET | `/api/v1/tenants/{tenantId}/tax/rules` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read rules |
| POST | `/api/v1/tenants/{tenantId}/tax/rules` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Manage tax rules |
| PATCH | `/api/v1/tenants/{tenantId}/tax/rules/{ruleId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Manage tax rules |
| GET | `/api/v1/tenants/{tenantId}/sync/queue` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Own branch queue unless AO |
| POST | `/api/v1/tenants/{tenantId}/sync/retry` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Retry failed offline events |

### 9.1 Offline Conflict and Read-Only Controls

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/conflicts` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Non-silent conflict visibility for all operational roles |
| POST | `/api/v1/tenants/{tenantId}/conflicts/{conflictId}/resolve` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Resolution requires manager/owner authority with reason |
| POST | `/api/v1/tenants/{tenantId}/conflicts/{conflictId}/escalate` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Cashier/inventory can escalate only |

Conflict and read-only flow requirements:
1. Silent conflict resolution is forbidden.
2. Mutation endpoints are blocked for `CA` and `IS` while session state is `READ_ONLY`.
3. `TO` and `MG` can resolve conflicts only with resolution reason and audit trail.
4. `AO` can resolve cross-tenant/system conflicts.

---

## 10. Customer and Loyalty

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/customers` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read customer list |
| GET | `/api/v1/tenants/{tenantId}/customers/{customerId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read profile |
| POST | `/api/v1/tenants/{tenantId}/customers` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Create customer |
| PATCH | `/api/v1/tenants/{tenantId}/customers/{customerId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Update customer |
| GET | `/api/v1/tenants/{tenantId}/loyalty/ledger` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Loyalty history |
| POST | `/api/v1/tenants/{tenantId}/loyalty/redeem` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Cashier is read-only for loyalty module |
| PATCH | `/api/v1/tenants/{tenantId}/loyalty/tier-rules` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tier rule management |

---

## 11. Reporting

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/reports/tenant/{reportId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | `IS` limited to inventory reports |
| GET | `/api/v1/reports/tenant/{reportId}/export` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Same scope as report access |
| GET | `/api/v1/reports/owner/{reportId}` | ALLOW | DENY | DENY | DENY | DENY | Global owner reports only |
| GET | `/api/v1/reports/owner/{reportId}/export` | ALLOW | DENY | DENY | DENY | DENY | Global owner reports only |

Tenant report restrictions:
1. `CA` cannot access profit summary unless explicitly granted by tenant setting.
2. `IS` can access `REP-T-003` and `REP-T-004` only by default.

---

## 12. Monitoring, Backup, Audit, and Incidents

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/monitoring/health` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Health summary |
| GET | `/api/v1/monitoring/metrics` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant/global by role |
| GET | `/api/v1/ops/slis` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Operational SLI/SLO metadata (read-only) |
| GET | `/api/v1/ops/metrics` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Structured operational metrics feed |
| GET | `/api/v1/backups/status` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Backup run status |
| POST | `/api/v1/backups/restore-test` | ALLOW | DENY | DENY | DENY | DENY | Restricted owner action |
| GET | `/api/v1/audit/logs` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Privileged read-only audit view with severity tags |
| GET | `/api/v1/audit/integrity` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Privileged read-only audit integrity + severity downgrade check |
| GET | `/api/v1/incidents` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Risk/abuse incidents |
| PATCH | `/api/v1/incidents/{incidentId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Update incident status |

---

## 13. Configuration and Branding

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/config/brand/app` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Read app brand config |
| GET | `/api/v1/config/brand/tenant/{tenantId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Tenant brand read |
| PATCH | `/api/v1/config/brand/tenant/{tenantId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Tenant brand update |
| GET | `/api/v1/config/pricing/{tenantId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Read pricing config |
| PATCH | `/api/v1/config/pricing/{tenantId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Pricing rules update |
| GET | `/api/v1/config/tax/{tenantId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read tax config |
| PATCH | `/api/v1/config/tax/{tenantId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Tax config update |

---

## 14. Phase 2 Modular Extensions

### 14.1 Web Dashboard Management

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant list, scoped unless AO |
| GET | `/api/v1/tenants/{tenantId}/dashboard/kpis` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Tenant + branch scoped KPIs |
| GET | `/api/v1/tenants/{tenantId}/dashboard/charts/{metric}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | `metric`: sales/inventory/customers |
| GET | `/api/v1/tenants/{tenantId}/users` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant-scoped user list |
| POST | `/api/v1/tenants/{tenantId}/users` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | MG cannot create owner roles |
| PATCH | `/api/v1/tenants/{tenantId}/users/{userId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant-scoped user update |
| PATCH | `/api/v1/tenants/{tenantId}/users/{userId}/status` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Activate/deactivate user |
| PATCH | `/api/v1/tenants/{tenantId}/users/{userId}/role` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Role assignment constraints enforced |
| GET | `/api/v1/tenants/{tenantId}/branches` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Branch list |
| POST | `/api/v1/tenants/{tenantId}/branches` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Branch creation restricted to owner roles |
| PATCH | `/api/v1/tenants/{tenantId}/branches/{branchId}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Branch update restricted to owner roles |

### 14.2 Advanced Reporting

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/reports/advanced/templates` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Template + filter contract |
| GET | `/api/v1/reports/advanced/{reportId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | `compareTenantId` cross-tenant only for AO |
| GET | `/api/v1/reports/advanced/{reportId}/export` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Export CSV/PDF only |

### 14.3 Plugins / Payments

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/plugins` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Plugin catalog |
| GET | `/api/v1/tenants/{tenantId}/plugins` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant plugin registrations |
| POST | `/api/v1/tenants/{tenantId}/plugins/register` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Register/enable plugin for tenant |
| POST | `/api/v1/tenants/{tenantId}/plugins/{pluginId}/payments/charge` | ALLOW | DENY | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Checkout-compatible payment execution |

### 14.4 Offline Automation and Alerts

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/v1/tenants/{tenantId}/offline/automation/run` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Executes queue automation and alert generation |
| GET | `/api/v1/tenants/{tenantId}/offline/alerts` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Alert visibility across operational roles |
| PATCH | `/api/v1/tenants/{tenantId}/offline/alerts/{alertId}/ack` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Alert acknowledgment by manager/owner roles |

### 14.5 In-App Notifications (FIAM)

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/notifications/config` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Read-only provider/config metadata |
| POST | `/api/v1/tenants/{tenantId}/notifications/trigger` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Manual trigger endpoint with idempotency key |
| GET | `/api/v1/tenants/{tenantId}/notifications/feed` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Role-filtered feed within tenant+branch scope |
| PATCH | `/api/v1/tenants/{tenantId}/notifications/{notificationId}/read` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Mark visible notification as read |
| POST | `/api/v1/tenants/{tenantId}/notifications/retry` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Retry pending/failed notifications when online |
| PATCH | `/api/v1/tenants/{tenantId}/notifications/connectivity` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Branch-scoped delivery channel state override |

### 14.6 Phase 4 Extensions (Loyalty / Offline / Reporting Extensions)

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/rewards/rules` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Read reward rules in tenant scope |
| PATCH | `/api/v1/tenants/{tenantId}/rewards/rules` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Rule management restricted to owner roles |
| GET | `/api/v1/tenants/{tenantId}/rewards/balance/{customerId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Customer balance in tenant+branch scope |
| GET | `/api/v1/tenants/{tenantId}/rewards/history` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Reward ledger/history read access |
| GET | `/api/v1/tenants/{tenantId}/rewards/kpis` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Dashboard KPI visibility |
| POST | `/api/v1/tenants/{tenantId}/rewards/accrue` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Privileged write action |
| POST | `/api/v1/tenants/{tenantId}/rewards/redeem` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Cashier cannot redeem loyalty points |
| POST | `/api/v1/tenants/{tenantId}/offline/loyalty/queue` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Queue write with role checks per operation |
| POST | `/api/v1/tenants/{tenantId}/offline/reports/queue` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Queue report generation request |
| GET | `/api/v1/tenants/{tenantId}/offline/events` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | View offline event log |
| GET | `/api/v1/tenants/{tenantId}/offline/status` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | View offline enhanced status |
| POST | `/api/v1/tenants/{tenantId}/offline/reconcile` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Reconcile queued loyalty/report events |
| GET | `/api/v1/tenants/{tenantId}/reports/extensions/templates` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Template list filtered by role |
| GET | `/api/v1/tenants/{tenantId}/reports/extensions/{templateId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Role + template scope enforced |
| GET | `/api/v1/tenants/{tenantId}/reports/extensions/{templateId}/export` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Export supports CSV/PDF/print |

### 14.7 Phase 5 Runtime Modules

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/discounts/advanced/policy` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Read-only policy contract |
| GET | `/api/v1/tenants/{tenantId}/discounts/advanced/policy/preview` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Read-only preview with ETag/cache headers |
| POST | `/api/v1/tenants/{tenantId}/discounts/advanced/evaluate` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Advanced stackable discount preview |
| POST | `/api/v1/tenants/{tenantId}/discounts/advanced/apply` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Cashier apply allowed but manual override forbidden by service policy |
| GET | `/api/v1/tenants/{tenantId}/discounts/advanced/history` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | DENY | Discount evaluation/audit history |
| GET | `/api/v1/tenants/{tenantId}/reports/multi-store/{reportKey}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | `reportKey`: summary, inventory-risk, discount-compliance |
| GET | `/api/v1/tenants/{tenantId}/reports/multi-store/{reportKey}/export` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Export supports CSV/PDF/print (print optional) |
| GET | `/api/v1/tenants/{tenantId}/risk-compliance/policies` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | List risk/compliance policies |
| POST | `/api/v1/tenants/{tenantId}/risk-compliance/policies` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Create/update risk policy |
| POST | `/api/v1/tenants/{tenantId}/risk-compliance/evaluate` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | ALLOW_SCOPE | Evaluate WARN/READ_ONLY/BLOCK action decision |
| GET | `/api/v1/tenants/{tenantId}/risk-compliance/events` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Compliance event history by tenant/branch |
| GET | `/api/v1/tenants/{tenantId}/risk-compliance/incidents` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Incident lifecycle evidence feed |
| POST | `/api/v1/tenants/{tenantId}/risk-compliance/incidents/simulate-critical` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | CRITICAL incident drill (detect/classify/respond/resolve) |
| GET | `/api/v1/tenants/{tenantId}/risk-compliance/security-events` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Read-only security severity event feed |
| GET | `/api/v1/tenants/{tenantId}/feature-flags` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant-scoped feature flag visibility |
| PATCH | `/api/v1/tenants/{tenantId}/feature-flags/{flagKey}` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Feature flag management restricted to owner roles |

Phase 5 policy notes:
1. `WARN` mode allows operations with explicit warning output.
2. `READ_ONLY` denies write actions and allows read actions.
3. `BLOCK` denies restricted operations with HTTP 403.
4. Compliance and report actions must always emit tenant-aware audit entries.
5. Security events endpoint is read-only and severity-classified (`INFO`/`WARN`/`CRITICAL`).
6. Feature flags can disable advanced discounts, loyalty rules, and risk enforcement per tenant.
7. Lock/escalation responses must expose stable explanation codes for UI rendering.
8. Admin audit viewer UI is restricted to `AO`/`TO`/`MG` roles only.

### 14.8 Phase 6 Expansion Modules (Governed)

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/analytics/trends` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Requires `analytics_expansion` + `scale_reads` flags |
| GET | `/api/v1/tenants/{tenantId}/analytics/compare` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Comparative non-AI analysis |
| GET | `/api/v1/tenants/{tenantId}/analytics/sla` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Read-only SLA metric snapshot |
| GET | `/api/v1/tenants/{tenantId}/analytics/datasets/export` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Export-ready dataset in CSV/JSON |
| DELETE | `/api/v1/tenants/{tenantId}/analytics/cache` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Prefix-based cache eviction control |
| POST | `/api/v1/tenants/{tenantId}/aggregation/jobs` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Non-blocking background job enqueue |
| GET | `/api/v1/tenants/{tenantId}/aggregation/jobs` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Aggregation job status feed |
| GET | `/api/v1/tenants/{tenantId}/aggregation/jobs/{jobId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Single job state |
| GET | `/api/v1/tenants/{tenantId}/aggregation/snapshots` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Background snapshot evidence |
| GET | `/api/v1/tenants/{tenantId}/exports/audit` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Read-only external audit export (CSV/JSON) |
| GET | `/api/v1/tenants/{tenantId}/exports/retention-policy` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Retention policy visibility |
| PATCH | `/api/v1/tenants/{tenantId}/exports/retention-policy` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Retention policy update restricted to owner roles |
| GET | `/api/v1/tenants/{tenantId}/webhooks/endpoints` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Outbound endpoint registry read |
| POST | `/api/v1/tenants/{tenantId}/webhooks/endpoints` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Register outbound endpoint |
| PATCH | `/api/v1/tenants/{tenantId}/webhooks/endpoints/{endpointId}` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Update endpoint state/events |
| GET | `/api/v1/tenants/{tenantId}/webhooks/deliveries` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Delivery audit feed |
| POST | `/api/v1/tenants/{tenantId}/webhooks/dispatch` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Outbound dispatch only (idempotent) |
| POST | `/api/v1/tenants/{tenantId}/webhooks/retry` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Retry pending outbound deliveries |
| GET | `/api/v1/tenants/{tenantId}/webhooks/deliveries/{deliveryId}/verify` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Signature verification evidence |

Phase 6 expansion policy notes:
1. New expansion capabilities are feature-flagged and default OFF.
2. Webhook framework is outbound-only; inbound command/control endpoints are forbidden.
3. Aggregation jobs must be asynchronous and non-blocking for request thread.
4. External audit export endpoint is read-only and tenant-scoped.
5. Cache eviction controls are operationally restricted (`AO`/`TO`/`MG`).

### 14.9 Phase 7 Operational Intelligence Modules (FR-P7-1001..FR-P7-1020)

Traceability map:
- Endpoint and role contracts in this section correspond to `FR-P7-1001..FR-P7-1020`.

| Method | Endpoint | AO | TO | MG | CA | IS | Scope / Notes |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/{tenantId}/observability/overview` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Feature flag: `phase7_observability` |
| GET | `/api/v1/tenants/{tenantId}/observability/dashboard` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Cached operational dashboard feed |
| GET | `/api/v1/tenants/{tenantId}/observability/sla` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | SLA snapshot with threshold contracts |
| GET | `/api/v1/tenants/{tenantId}/observability/alerts` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | WARN/CRITICAL alert visibility |
| GET | `/api/v1/tenants/{tenantId}/observability/jobs` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Job metric feed, paginated |
| GET | `/api/v1/tenants/{tenantId}/predictive/trends` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Read-only predictive trend model |
| GET | `/api/v1/tenants/{tenantId}/predictive/sla` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | ALLOW_SCOPE | Read-only SLA violation risk forecast |
| GET | `/api/v1/tenants/{tenantId}/predictive/export` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Predictive CSV/JSON export |
| GET | `/api/v1/tenants/{tenantId}/webhooks/clients` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Integration client registry read |
| POST | `/api/v1/tenants/{tenantId}/webhooks/clients` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Integration client create + token issue |
| POST | `/api/v1/tenants/{tenantId}/webhooks/clients/{clientId}/rotate-token` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Token rotation control-plane action |
| PATCH | `/api/v1/tenants/{tenantId}/webhooks/clients/{clientId}/kill-switch` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Kill-switch toggles outbound dispatch |
| GET | `/api/v1/tenants/{tenantId}/webhooks/clients/{clientId}/token/verify` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Read-only token verification endpoint |
| GET | `/api/v1/tenants/{tenantId}/compliance/exports` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Read-only compliance export with legal-hold visibility |
| GET | `/api/v1/tenants/{tenantId}/compliance/legal-holds` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Legal-hold state visibility |
| POST | `/api/v1/tenants/{tenantId}/compliance/legal-holds` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Owner-only legal-hold creation |
| PATCH | `/api/v1/tenants/{tenantId}/compliance/legal-holds/{holdId}/release` | ALLOW | ALLOW_SCOPE | DENY | DENY | DENY | Owner-only legal-hold release |
| GET | `/api/v1/tenants/{tenantId}/scale-guard/stats` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Scale cache stats read endpoint |
| DELETE | `/api/v1/tenants/{tenantId}/scale-guard/cache` | ALLOW | ALLOW_SCOPE | ALLOW_SCOPE | DENY | DENY | Tenant-safe cache eviction control |

Phase 7 policy notes:
1. Phase 7 endpoints are control-plane/read-only and must not mutate POS transactional flows.
2. Phase 7 feature flags are default OFF and tenant-scoped.
3. integration token plaintext is never persisted; hash-only storage is mandatory.
4. cross-tenant access is denied for observability, predictive, integration, and compliance paths.

---

## 15. Policy Notes and Exceptions

1. Tenant can grant optional exceptions using explicit policy records.
2. Exception grants must include approver, reason, and expiry.
3. No exception can violate cross-tenant isolation.

---

## 16. Audit Requirements for Authorization

Must audit:
1. denied access to privileged endpoints
2. role changes and permission exceptions
3. high-risk actions: sale void, tax rule update, restore-test run, risk override

Minimum audit fields:
- actor_user_id
- role_at_time
- tenant_id
- branch_id
- endpoint
- method
- decision
- reason
- timestamp

---

END OF DOCUMENT
