import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

function h(userId: string, role: string, tenantId = "tenant-a", branchId = "branch-a-1") {
  return {
    "x-user-id": userId,
    "x-role": role,
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
  };
}

describe("Phase 1 API governance", () => {
  it("enforces tenant isolation and 403 for missing context", async () => {
    const app = createApp(createStore());

    const ok = await request(app).get("/api/v1/tenants/tenant-a/products").set(h("u-ca-a", "CASHIER"));
    expect(ok.status).toBe(200);
    expect(ok.body.items.length).toBeGreaterThan(0);
    expect(ok.body.items.every((item: any) => item.tenantId === "tenant-a")).toBe(true);

    const forbiddenCrossTenant = await request(app)
      .get("/api/v1/tenants/tenant-b/products")
      .set(h("u-ca-a", "CASHIER", "tenant-a", "branch-a-1"));
    expect(forbiddenCrossTenant.status).toBe(403);

    const missingContext = await request(app)
      .get("/api/v1/tenants/tenant-a/products")
      .set({ "x-user-id": "u-ca-a", "x-role": "CASHIER" });
    expect(missingContext.status).toBe(403);
  });

  it("enforces RBAC for cashier and owner checkout restrictions", async () => {
    const app = createApp(createStore());

    const cashierOverride = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/override")
      .set(h("u-ca-a", "CASHIER"))
      .send({ reason: "manual" });
    expect(cashierOverride.status).toBe(403);

    const cashierRedeem = await request(app)
      .post("/api/v1/tenants/tenant-a/loyalty/redeem")
      .set(h("u-ca-a", "CASHIER"))
      .send({ customerId: "cust-a-1", points: 10, reason: "test" });
    expect(cashierRedeem.status).toBe(403);

    const ownerCheckout = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ mode: "RETAIL", lines: [{ productId: "prod-a-001", quantity: 1 }] });
    expect(ownerCheckout.status).toBe(403);
  });

  it("supports offline queue, conflict visibility, and read-only fallback", async () => {
    const app = createApp(createStore());

    const offlineCheckout = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        offline: true,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
      });

    expect(offlineCheckout.status).toBe(201);
    expect(offlineCheckout.body.queued).toBe(true);
    expect(offlineCheckout.body.localCommitMs).toBeLessThanOrEqual(2000);

    const updatePrice = await request(app)
      .patch("/api/v1/tenants/tenant-a/products/prod-a-001")
      .set(h("u-mg-a", "MANAGER"))
      .send({ retailPrice: 9999 });
    expect(updatePrice.status).toBe(200);

    const sync = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});

    expect(sync.status).toBe(200);
    expect(sync.body.conflicts).toBeGreaterThanOrEqual(1);

    const cashierMutationBlocked = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set(h("u-ca-a", "CASHIER"))
      .send({ name: "Blocked User", phone: "09999" });
    expect(cashierMutationBlocked.status).toBe(409);

    const listConflicts = await request(app)
      .get("/api/v1/tenants/tenant-a/conflicts")
      .set(h("u-mg-a", "MANAGER"));
    expect(listConflicts.status).toBe(200);
    expect(listConflicts.body.items.length).toBeGreaterThan(0);

    const conflictId = listConflicts.body.items[0].conflictId;
    const resolve = await request(app)
      .post(`/api/v1/tenants/tenant-a/conflicts/${conflictId}/resolve`)
      .set(h("u-mg-a", "MANAGER"))
      .send({ note: "server wins" });
    expect(resolve.status).toBe(200);

    const cashierMutationAfterResolve = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set(h("u-ca-a", "CASHIER"))
      .send({ name: "Now Allowed", phone: "09888" });
    expect(cashierMutationAfterResolve.status).toBe(201);
  });

  it("enforces report access and supports CSV/PDF export", async () => {
    const app = createApp(createStore());

    const invStaffAllowed = await request(app)
      .get("/api/v1/reports/tenant/REP-T-003")
      .set(h("u-is-a", "INVENTORY_STAFF"));
    expect(invStaffAllowed.status).toBe(200);

    const invStaffDenied = await request(app)
      .get("/api/v1/reports/tenant/REP-T-005")
      .set(h("u-is-a", "INVENTORY_STAFF"));
    expect(invStaffDenied.status).toBe(403);

    const cashierOwnerReportDenied = await request(app)
      .get("/api/v1/reports/owner/REP-O-001")
      .set(h("u-ca-a", "CASHIER"));
    expect(cashierOwnerReportDenied.status).toBe(403);

    const csvExport = await request(app)
      .get("/api/v1/reports/tenant/REP-T-001/export?format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(csvExport.status).toBe(200);
    expect(String(csvExport.headers["content-type"]).includes("text/csv")).toBe(true);

    const pdfExport = await request(app)
      .get("/api/v1/reports/tenant/REP-T-001/export?format=pdf")
      .set(h("u-mg-a", "MANAGER"));
    expect(pdfExport.status).toBe(200);
    expect(String(pdfExport.headers["content-type"]).includes("application/pdf")).toBe(true);
  });

  it("keeps audit logs tenant-aware and non-null", async () => {
    const app = createApp(createStore());

    const created = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "Audit User", phone: "09777" });
    expect(created.status).toBe(201);

    const auditLogs = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(auditLogs.status).toBe(200);
    expect(auditLogs.body.items.length).toBeGreaterThan(0);
    expect(
      auditLogs.body.items.every(
        (item: any) =>
          typeof item.tenantId === "string" &&
          item.tenantId.length > 0 &&
          typeof item.branchId === "string" &&
          item.branchId.length > 0,
      ),
    ).toBe(true);
  });

  it("rejects duplicate idempotency replay, preserves stock integrity, and remains tenant-isolated", async () => {
    const app = createApp(createStore());
    const duplicateKey = "22222222-2222-4222-8222-222222222222";

    const before = await request(app)
      .get("/api/v1/tenants/tenant-a/products/prod-a-001")
      .set(h("u-mg-a", "MANAGER"));
    expect(before.status).toBe(200);
    const beforeStock = before.body.item.stockByBranch.find((row: any) => row.branchId === "branch-a-1").onHandQty;
    expect(beforeStock).toBe(100);

    const firstOfflineSale = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        offline: true,
        idempotencyKey: duplicateKey,
        lines: [{ productId: "prod-a-001", quantity: 100 }],
      });
    expect(firstOfflineSale.status).toBe(201);

    const duplicateReplay = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        offline: true,
        idempotencyKey: duplicateKey,
        lines: [{ productId: "prod-a-001", quantity: 1 }],
      });
    expect(duplicateReplay.status).toBe(409);
    expect(duplicateReplay.body.error).toBe("DUPLICATE_IDEMPOTENCY_KEY");

    const after = await request(app)
      .get("/api/v1/tenants/tenant-a/products/prod-a-001")
      .set(h("u-mg-a", "MANAGER"));
    expect(after.status).toBe(200);
    const afterStock = after.body.item.stockByBranch.find((row: any) => row.branchId === "branch-a-1").onHandQty;
    expect(afterStock).toBe(0);

    const noNegativeStock = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        offline: true,
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
      });
    expect(noNegativeStock.status).toBe(409);
    expect(noNegativeStock.body.error).toBe("NEGATIVE_STOCK_BLOCKED");

    const crossTenantAllowed = await request(app)
      .post("/api/v1/tenants/tenant-b/sync/queue")
      .set(h("u-to-b", "TENANT_OWNER", "tenant-b", "branch-b-1"))
      .send({
        eventType: "SALE",
        idempotencyKey: duplicateKey,
        payload: { saleId: "sale-b-1", amount: 1000 },
      });
    expect(crossTenantAllowed.status).toBe(201);

    const script = await request(app).get("/web/app.js");
    expect(script.status).toBe(200);
    expect(script.text.includes("DUPLICATE_IDEMPOTENCY_KEY")).toBe(true);

    const auditLogs = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(auditLogs.status).toBe(200);
    expect(
      auditLogs.body.items.some(
        (item: any) => item.tenantId === "tenant-a" && String(item.reason).includes("DUPLICATE_IDEMPOTENCY_KEY"),
      ),
    ).toBe(true);
  });

  it("enforces WARN/READ_ONLY/BLOCK risk modes with audit evidence and UI lock cues", async () => {
    const app = createApp(createStore());
    const riskSignals = {
      "x-risk-vpn": "true",
      "x-risk-location-restricted": "true",
      "x-risk-device-untrusted": "true",
      "x-risk-factors": "vpn_detected,restricted_location",
    };

    const warnMutation = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set({ ...h("u-mg-a", "MANAGER"), ...riskSignals, "x-risk-mode": "WARN" })
      .send({ name: "Warn Allowed", phone: "09666" });
    expect(warnMutation.status).toBe(201);
    expect(warnMutation.headers["x-risk-mode"]).toBe("WARN");

    const readOnlyRead = await request(app)
      .get("/api/v1/tenants/tenant-a/products")
      .set({ ...h("u-mg-a", "MANAGER"), ...riskSignals, "x-risk-mode": "READ_ONLY" });
    expect(readOnlyRead.status).toBe(200);
    expect(readOnlyRead.headers["x-risk-mode"]).toBe("READ_ONLY");

    const readOnlyWrite = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set({ ...h("u-mg-a", "MANAGER"), ...riskSignals, "x-risk-mode": "READ_ONLY" })
      .send({ name: "ReadOnly Blocked", phone: "09555" });
    expect(readOnlyWrite.status).toBe(409);
    expect(readOnlyWrite.body.error).toBe("READ_ONLY_RISK_POLICY");

    const blockedWrite = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set({ ...h("u-mg-a", "MANAGER"), ...riskSignals, "x-risk-mode": "BLOCK" })
      .send({ name: "Blocked User", phone: "09444" });
    expect(blockedWrite.status).toBe(403);
    expect(blockedWrite.body.error).toBe("RISK_POLICY_BLOCKED");

    const blockedSessionInspection = await request(app)
      .get("/api/v1/risk/sessions")
      .set({ ...h("u-mg-a", "MANAGER"), ...riskSignals, "x-risk-mode": "BLOCK" });
    expect(blockedSessionInspection.status).toBe(200);
    expect(blockedSessionInspection.body.session.mode).toBe("BLOCK");

    const script = await request(app).get("/web/app.js");
    expect(script.status).toBe(200);
    expect(script.text.includes("READ_ONLY_RISK_POLICY")).toBe(true);
    expect(script.text.includes("syncBtn.disabled = riskLock")).toBe(true);

    const auditLogs = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(auditLogs.status).toBe(200);

    const riskModeLogs = auditLogs.body.items.filter((item: any) => String(item.reason).includes("RISK_MODE="));
    expect(riskModeLogs.length).toBeGreaterThan(0);
    expect(riskModeLogs.some((item: any) => String(item.reason).includes("RISK_MODE=WARN"))).toBe(true);
    expect(riskModeLogs.some((item: any) => String(item.reason).includes("RISK_MODE=READ_ONLY"))).toBe(true);
    expect(riskModeLogs.some((item: any) => String(item.reason).includes("RISK_MODE=BLOCK"))).toBe(true);
    expect(riskModeLogs.every((item: any) => item.tenantId === "tenant-a" && item.branchId === "branch-a-1")).toBe(true);
  });
});
