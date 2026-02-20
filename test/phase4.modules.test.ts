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

describe("Phase 4 loyalty/offline/reporting extensions", () => {
  it("supports loyalty accrual/redeem/balance with RBAC enforcement", async () => {
    const app = createApp(createStore());

    const accrue = await request(app)
      .post("/api/v1/tenants/tenant-a/rewards/accrue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        customerId: "cust-a-1",
        points: 250,
        reason: "phase4 accrue",
      });
    expect(accrue.status).toBe(201);
    expect(accrue.body.item.pointsAdded).toBe(250);

    const cashierRedeemDenied = await request(app)
      .post("/api/v1/tenants/tenant-a/rewards/redeem")
      .set(h("u-ca-a", "CASHIER"))
      .send({
        customerId: "cust-a-1",
        points: 120,
        reason: "cashier redeem should fail",
      });
    expect(cashierRedeemDenied.status).toBe(403);

    const redeem = await request(app)
      .post("/api/v1/tenants/tenant-a/rewards/redeem")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        customerId: "cust-a-1",
        points: 120,
        reason: "phase4 redeem",
      });
    expect(redeem.status).toBe(201);
    expect(redeem.body.item.pointsRedeemed).toBe(120);

    const balance = await request(app)
      .get("/api/v1/tenants/tenant-a/rewards/balance/cust-a-1")
      .set(h("u-mg-a", "MANAGER"));
    expect(balance.status).toBe(200);
    expect(balance.body.item.currentPoints).toBe(130);

    const kpis = await request(app)
      .get("/api/v1/tenants/tenant-a/rewards/kpis")
      .set(h("u-mg-a", "MANAGER"));
    expect(kpis.status).toBe(200);
    expect(kpis.body.item.totalPointsAccrued).toBeGreaterThanOrEqual(250);
    expect(kpis.body.item.totalPointsRedeemed).toBeGreaterThanOrEqual(120);

    const history = await request(app)
      .get("/api/v1/tenants/tenant-a/rewards/history")
      .set(h("u-mg-a", "MANAGER"));
    expect(history.status).toBe(200);
    expect(history.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it("queues offline loyalty mutations and surfaces non-silent conflicts on reconcile", async () => {
    const app = createApp(createStore());

    const queue = await request(app)
      .post("/api/v1/tenants/tenant-a/offline/loyalty/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        operation: "REDEEM",
        customerId: "cust-a-1",
        points: 999,
        reason: "force conflict",
      });
    expect(queue.status).toBe(201);
    expect(queue.body.item.queue.eventType).toBe("LOYALTY");

    const reconcile = await request(app)
      .post("/api/v1/tenants/tenant-a/offline/reconcile")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(reconcile.status).toBe(200);
    expect(reconcile.body.conflicts).toBeGreaterThanOrEqual(1);

    const conflicts = await request(app)
      .get("/api/v1/tenants/tenant-a/conflicts")
      .set(h("u-mg-a", "MANAGER"));
    expect(conflicts.status).toBe(200);
    expect(conflicts.body.items.length).toBeGreaterThanOrEqual(1);

    const events = await request(app)
      .get("/api/v1/tenants/tenant-a/offline/events")
      .set(h("u-mg-a", "MANAGER"));
    expect(events.status).toBe(200);
    expect(events.body.items.some((item: any) => item.status === "CONFLICT")).toBe(true);
  });

  it("rejects duplicate idempotency during offline reconcile retry for queued reports", async () => {
    const store = createStore();
    const app = createApp(store);
    const key = "77777777-7777-4777-8777-777777777777";

    const queue = await request(app)
      .post("/api/v1/tenants/tenant-a/offline/reports/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        templateId: "REP-X-OPS-001",
        filters: {},
        idempotencyKey: key,
      });
    expect(queue.status).toBe(201);

    store.idempotencyKeys.add(`tenant-a:${key}`);

    const reconcile = await request(app)
      .post("/api/v1/tenants/tenant-a/offline/reconcile")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(reconcile.status).toBe(200);
    expect(reconcile.body.duplicates).toBeGreaterThanOrEqual(1);
    expect(reconcile.body.failed).toBeGreaterThanOrEqual(1);

    const events = await request(app)
      .get("/api/v1/tenants/tenant-a/offline/events")
      .set(h("u-mg-a", "MANAGER"));
    expect(events.status).toBe(200);
    expect(
      events.body.items.some((item: any) => item.status === "FAILED" && String(item.message).includes("Duplicate")),
    ).toBe(true);
  });

  it("serves reporting extension templates with CSV/PDF/print export and role filtering", async () => {
    const app = createApp(createStore());

    const templates = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/extensions/templates")
      .set(h("u-mg-a", "MANAGER"));
    expect(templates.status).toBe(200);
    expect(templates.body.items.some((item: any) => item.templateId === "REP-X-LOY-001")).toBe(true);

    const report = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/extensions/REP-X-LOY-001")
      .set(h("u-mg-a", "MANAGER"));
    expect(report.status).toBe(200);
    expect(Array.isArray(report.body.rows)).toBe(true);

    const csv = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/extensions/REP-X-LOY-001/export?format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(csv.status).toBe(200);
    expect(String(csv.headers["content-type"]).includes("text/csv")).toBe(true);

    const pdf = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/extensions/REP-X-LOY-001/export?format=pdf")
      .set(h("u-mg-a", "MANAGER"));
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers["content-type"]).includes("application/pdf")).toBe(true);

    const printable = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/extensions/REP-X-LOY-001/export?format=print")
      .set(h("u-mg-a", "MANAGER"));
    expect(printable.status).toBe(200);
    expect(String(printable.headers["content-type"]).includes("text/html")).toBe(true);

    const cashierDenied = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/extensions/REP-X-LOY-001")
      .set(h("u-ca-a", "CASHIER"));
    expect(cashierDenied.status).toBe(403);
  });

  it("accepts REPORT queue items in core sync queue API and confirms them during sync", async () => {
    const app = createApp(createStore());

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "88888888-8888-4888-8888-888888888888",
        payload: { templateId: "REP-X-OPS-001", filters: {} },
      });
    expect(queued.status).toBe(201);
    expect(queued.body.item.eventType).toBe("REPORT");

    const sync = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(sync.status).toBe(200);
    expect(sync.body.confirmed).toBeGreaterThanOrEqual(1);
  });
});
