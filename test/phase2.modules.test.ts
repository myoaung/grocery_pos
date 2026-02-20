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

describe("Phase 2 modular features", () => {
  it("supports dashboard tenant/branch/user management with RBAC and tenant isolation", async () => {
    const app = createApp(createStore());

    const kpis = await request(app).get("/api/v1/tenants/tenant-a/dashboard/kpis").set(h("u-mg-a", "MANAGER"));
    expect(kpis.status).toBe(200);
    expect(kpis.body.item.tenantId).toBe("tenant-a");

    const createUser = await request(app)
      .post("/api/v1/tenants/tenant-a/users")
      .set(h("u-mg-a", "MANAGER"))
      .send({ email: "phase2-cashier@tenant-a.local", role: "CASHIER", branchId: "branch-a-1" });
    expect(createUser.status).toBe(201);

    const managerCannotCreateOwner = await request(app)
      .post("/api/v1/tenants/tenant-a/users")
      .set(h("u-mg-a", "MANAGER"))
      .send({ email: "owner2@tenant-a.local", role: "TENANT_OWNER", branchId: "branch-a-1" });
    expect(managerCannotCreateOwner.status).toBe(403);

    const ownerCreatesBranch = await request(app)
      .post("/api/v1/tenants/tenant-a/branches")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ branchCode: "A3", branchName: "Tenant A East" });
    expect(ownerCreatesBranch.status).toBe(201);

    const crossTenantBlocked = await request(app).get("/api/v1/tenants/tenant-b/users").set(h("u-mg-a", "MANAGER"));
    expect(crossTenantBlocked.status).toBe(403);
  });

  it("supports advanced reporting templates, filters, exports, and comparative access controls", async () => {
    const app = createApp(createStore());

    const templates = await request(app).get("/api/v1/reports/advanced/templates").set(h("u-mg-a", "MANAGER"));
    expect(templates.status).toBe(200);
    expect(templates.body.items.length).toBeGreaterThanOrEqual(4);

    const trend = await request(app)
      .get("/api/v1/reports/advanced/REP-A-002?dateFrom=2026-01-01&dateTo=2026-12-31")
      .set(h("u-mg-a", "MANAGER"));
    expect(trend.status).toBe(200);

    const managerCompareDenied = await request(app)
      .get("/api/v1/reports/advanced/REP-A-003?compareTenantId=tenant-b")
      .set(h("u-mg-a", "MANAGER"));
    expect(managerCompareDenied.status).toBe(403);

    const ownerCompareAllowed = await request(app)
      .get("/api/v1/reports/advanced/REP-A-003?compareTenantId=tenant-b")
      .set(h("u-ao", "APPLICATION_OWNER"));
    expect(ownerCompareAllowed.status).toBe(200);
    expect(ownerCompareAllowed.body.rows.length).toBe(2);

    const exportCsv = await request(app)
      .get("/api/v1/reports/advanced/REP-A-001/export?format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(exportCsv.status).toBe(200);
    expect(String(exportCsv.headers["content-type"]).includes("text/csv")).toBe(true);

    const exportPdf = await request(app)
      .get("/api/v1/reports/advanced/REP-A-001/export?format=pdf")
      .set(h("u-mg-a", "MANAGER"));
    expect(exportPdf.status).toBe(200);
    expect(String(exportPdf.headers["content-type"]).includes("application/pdf")).toBe(true);
  });

  it("supports plugin registration and sandbox payment processing with tenant isolation", async () => {
    const app = createApp(createStore());

    const plugins = await request(app).get("/api/v1/plugins").set(h("u-mg-a", "MANAGER"));
    expect(plugins.status).toBe(200);
    expect(plugins.body.items.some((item: any) => item.pluginId === "mock-gateway-v1")).toBe(true);

    const register = await request(app)
      .post("/api/v1/tenants/tenant-a/plugins/register")
      .set(h("u-mg-a", "MANAGER"))
      .send({ pluginId: "mock-gateway-v1", pluginType: "PAYMENT", enabled: true });
    expect(register.status).toBe(201);

    const approvedCharge = await request(app)
      .post("/api/v1/tenants/tenant-a/plugins/mock-gateway-v1/payments/charge")
      .set(h("u-mg-a", "MANAGER"))
      .send({ amount: 12000, currency: "MMK", orderRef: "ORDER-2001", method: "CARD" });
    expect(approvedCharge.status).toBe(200);
    expect(approvedCharge.body.result.status).toBe("APPROVED");

    const declinedCharge = await request(app)
      .post("/api/v1/tenants/tenant-a/plugins/mock-gateway-v1/payments/charge")
      .set(h("u-mg-a", "MANAGER"))
      .send({ amount: 700000, currency: "MMK", orderRef: "ORDER-2002", method: "CARD" });
    expect(declinedCharge.status).toBe(402);
    expect(declinedCharge.body.result.status).toBe("DECLINED");

    const crossTenantBlocked = await request(app)
      .post("/api/v1/tenants/tenant-b/plugins/mock-gateway-v1/payments/charge")
      .set(h("u-mg-a", "MANAGER"))
      .send({ amount: 10000, currency: "MMK", orderRef: "ORDER-X", method: "CARD" });
    expect(crossTenantBlocked.status).toBe(403);
  });

  it("automates offline conflict/duplicate detection and alert lifecycle with audit evidence", async () => {
    const store = createStore();
    const app = createApp(store);
    const duplicateKey = "44444444-4444-4444-8444-444444444444";

    const queuedSale = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        offline: true,
        idempotencyKey: duplicateKey,
        lines: [{ productId: "prod-a-001", quantity: 1 }],
      });
    expect(queuedSale.status).toBe(201);

    store.idempotencyKeys.add(`tenant-a:${duplicateKey}`);

    const automation = await request(app)
      .post("/api/v1/tenants/tenant-a/offline/automation/run")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(automation.status).toBe(200);
    expect(automation.body.duplicates).toBeGreaterThanOrEqual(1);
    expect(automation.body.enforcementMode).toBe("READ_ONLY");

    const alerts = await request(app).get("/api/v1/tenants/tenant-a/offline/alerts").set(h("u-mg-a", "MANAGER"));
    expect(alerts.status).toBe(200);
    expect(alerts.body.items.length).toBeGreaterThan(0);

    const ack = await request(app)
      .patch(`/api/v1/tenants/tenant-a/offline/alerts/${alerts.body.items[0].alertId}/ack`)
      .set(h("u-mg-a", "MANAGER"))
      .send({ note: "resolved after review" });
    expect(ack.status).toBe(200);
    expect(ack.body.item.acknowledged).toBe(true);

    const audit = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(audit.status).toBe(200);
    expect(
      audit.body.items.some(
        (item: any) => item.tenantId === "tenant-a" && String(item.actionType).includes("OFFLINE_AUTOMATION"),
      ),
    ).toBe(true);
  });

  it("serves phase2 dashboard UI contracts for reports/plugins/offline automation controls", async () => {
    const app = createApp(createStore());

    const dashboardPage = await request(app).get("/web/dashboard.html");
    expect(dashboardPage.status).toBe(200);
    expect(dashboardPage.text.includes("Phase 2 Control Plane")).toBe(true);
    expect(dashboardPage.text.includes("Marketplace / Payment Plugins")).toBe(true);

    const dashboardJs = await request(app).get("/web/dashboard.js");
    expect(dashboardJs.status).toBe(200);
    expect(dashboardJs.text.includes("/api/v1/reports/advanced")).toBe(true);
    expect(dashboardJs.text.includes("/api/v1/tenants/${tenantId}/plugins/register")).toBe(true);
    expect(dashboardJs.text.includes("/api/v1/tenants/${tenantId}/offline/automation/run")).toBe(true);
  });
});
