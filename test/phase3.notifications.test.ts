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

describe("Phase 3 notifications", () => {
  it("triggers FIAM-style notifications with idempotent deduplication and read flow", async () => {
    const app = createApp(createStore());
    const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const first = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/trigger")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "SYSTEM_EVENT",
        severity: "INFO",
        title: "System Broadcast",
        body: "This is a system-level notification.",
        idempotencyKey: key,
      });
    expect(first.status).toBe(201);
    expect(first.body.item.status).toBe("SENT");

    const duplicate = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/trigger")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "SYSTEM_EVENT",
        severity: "INFO",
        title: "System Broadcast",
        body: "This is a system-level notification.",
        idempotencyKey: key,
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.deduplicated).toBe(true);
    expect(duplicate.body.item.notificationId).toBe(first.body.item.notificationId);

    const feed = await request(app)
      .get("/api/v1/tenants/tenant-a/notifications/feed?includeRead=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(feed.status).toBe(200);
    expect(feed.body.items.length).toBe(1);

    const markRead = await request(app)
      .patch(`/api/v1/tenants/tenant-a/notifications/${first.body.item.notificationId}/read`)
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(markRead.status).toBe(200);
    expect(markRead.body.item.readBy.includes("u-mg-a")).toBe(true);
  });

  it("enforces RBAC for trigger endpoints while allowing role-scoped feed visibility", async () => {
    const app = createApp(createStore());

    const managerTrigger = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/trigger")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "SYSTEM_EVENT",
        severity: "WARN",
        title: "Manager Trigger",
        body: "Manager event",
      });
    expect(managerTrigger.status).toBe(201);

    const cashierTriggerDenied = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/trigger")
      .set(h("u-ca-a", "CASHIER"))
      .send({
        eventType: "SYSTEM_EVENT",
        severity: "WARN",
        title: "Cashier Trigger",
        body: "Not allowed",
      });
    expect(cashierTriggerDenied.status).toBe(403);

    const cashierFeed = await request(app)
      .get("/api/v1/tenants/tenant-a/notifications/feed?includeRead=true")
      .set(h("u-ca-a", "CASHIER"));
    expect(cashierFeed.status).toBe(200);
    expect(cashierFeed.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("creates trigger-based notifications from loyalty, low-stock, conflict, and risk events", async () => {
    const app = createApp(createStore());

    const loyaltySale = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        customerId: "cust-a-1",
        lines: [{ productId: "prod-a-001", quantity: 2 }],
      });
    expect(loyaltySale.status).toBe(201);

    const lowStock = await request(app)
      .post("/api/v1/tenants/tenant-a/inventory/stock-out")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        productId: "prod-a-002",
        quantity: 60,
        reason: "phase3 low stock",
      });
    expect(lowStock.status).toBe(201);

    const offlineCheckout = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        offline: true,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
      });
    expect(offlineCheckout.status).toBe(201);

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

    const blockedAttempt = await request(app)
      .get("/api/v1/tenants/tenant-a/products")
      .set({ ...h("u-mg-a", "MANAGER"), "x-risk-mode": "BLOCK", "x-risk-vpn": "true" });
    expect(blockedAttempt.status).toBe(403);

    const feed = await request(app)
      .get("/api/v1/tenants/tenant-a/notifications/feed?includeRead=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(feed.status).toBe(200);

    const eventTypes = new Set(feed.body.items.map((item: any) => item.eventType));
    expect(eventTypes.has("LOYALTY_POINTS")).toBe(true);
    expect(eventTypes.has("LOW_STOCK")).toBe(true);
    expect(eventTypes.has("OFFLINE_CONFLICT")).toBe(true);
  });

  it("queues notification delivery while offline and flushes on retry when online", async () => {
    const app = createApp(createStore());

    const offline = await request(app)
      .patch("/api/v1/tenants/tenant-a/notifications/connectivity")
      .set(h("u-mg-a", "MANAGER"))
      .send({ online: false });
    expect(offline.status).toBe(200);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/trigger")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "SYSTEM_EVENT",
        severity: "WARN",
        title: "Offline Queue",
        body: "Queue this notification while offline",
      });
    expect(queued.status).toBe(201);
    expect(queued.body.item.status).toBe("PENDING");

    const retryOffline = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(retryOffline.status).toBe(200);
    expect(retryOffline.body.sent).toBe(0);
    expect(retryOffline.body.stillPending).toBeGreaterThanOrEqual(1);

    const online = await request(app)
      .patch("/api/v1/tenants/tenant-a/notifications/connectivity")
      .set(h("u-mg-a", "MANAGER"))
      .send({ online: true });
    expect(online.status).toBe(200);

    const retryOnline = await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(retryOnline.status).toBe(200);
    expect(retryOnline.body.sent).toBeGreaterThanOrEqual(1);
  });

  it("keeps notification feeds tenant/branch scoped and serves phase3 UI module assets", async () => {
    const app = createApp(createStore());

    await request(app)
      .post("/api/v1/tenants/tenant-a/notifications/trigger")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "SYSTEM_EVENT",
        severity: "INFO",
        title: "Tenant A notice",
        body: "Tenant A only",
      });

    const tenantAFeed = await request(app)
      .get("/api/v1/tenants/tenant-a/notifications/feed?includeRead=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(tenantAFeed.status).toBe(200);
    expect(tenantAFeed.body.items.length).toBeGreaterThanOrEqual(1);

    const otherBranchFeed = await request(app)
      .get("/api/v1/tenants/tenant-a/notifications/feed?includeRead=true")
      .set(h("u-ao", "APPLICATION_OWNER", "tenant-a", "branch-a-2"));
    expect(otherBranchFeed.status).toBe(200);
    expect(otherBranchFeed.body.items.length).toBe(0);

    const crossTenantDenied = await request(app)
      .get("/api/v1/tenants/tenant-a/notifications/feed?includeRead=true")
      .set(h("u-to-b", "TENANT_OWNER", "tenant-b", "branch-b-1"));
    expect(crossTenantDenied.status).toBe(403);

    const notificationsPage = await request(app).get("/web/notifications.html");
    expect(notificationsPage.status).toBe(200);
    expect(notificationsPage.text.includes("Notifications Center")).toBe(true);

    const notificationsScript = await request(app).get("/web/notifications.js");
    expect(notificationsScript.status).toBe(200);
    expect(notificationsScript.text.includes("/api/v1/tenants/${tenantId}/notifications/trigger")).toBe(true);
    expect(notificationsScript.text.includes("/api/v1/tenants/${tenantId}/notifications/retry")).toBe(true);
  });
});
