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

async function enableFlags(app: any, keys: string[]) {
  for (const key of keys) {
    const updated = await request(app)
      .patch(`/api/v1/tenants/tenant-a/feature-flags/${key}`)
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: true });
    expect(updated.status).toBe(200);
  }
}

describe("Phase 7 - Chaos and failure injection", () => {
  it("handles webhook failure and kill-switch escalation without silent success", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_integration_control", "webhook_outbound"]);

    const client = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Chaos Client",
        allowedEventTypes: ["CHAOS_EVENT"],
      });
    expect(client.status).toBe(201);
    const clientId = client.body.item.clientId as string;

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Chaos Fail Endpoint",
        url: "https://fail.example.org/webhooks/chaos",
        eventTypes: ["CHAOS_EVENT"],
        integrationClientId: clientId,
      });
    expect(endpoint.status).toBe(201);

    const failed = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "CHAOS_EVENT",
        idempotencyKey: "f0e46f2b-742b-4f54-9f85-e4c9a50d32e1",
        payload: { run: 1 },
        simulateFailure: true,
      });
    expect(failed.status).toBe(202);
    expect(["RETRYING", "FAILED"]).toContain(failed.body.item.deliveries[0].status);

    const kill = await request(app)
      .patch(`/api/v1/tenants/tenant-a/webhooks/clients/${clientId}/kill-switch`)
      .set(h("u-mg-a", "MANAGER"))
      .send({ enabled: true });
    expect(kill.status).toBe(200);

    const blocked = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "CHAOS_EVENT",
        idempotencyKey: "287d4d91-6df4-49ff-93ec-eb1f89e02070",
        payload: { run: 2 },
      });
    expect(blocked.status).toBe(404);
    expect(blocked.body.error).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
  });

  it("keeps aggregation timeout explicit under delayed job simulation", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["background_aggregation", "phase7_observability"]);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/aggregation/jobs")
      .set(h("u-mg-a", "MANAGER"))
      .send({ window: "24h", simulateTimeout: true });
    expect(queued.status).toBe(202);
    const jobId = queued.body.item.jobId as string;

    await new Promise((resolve) => setTimeout(resolve, 40));

    const status = await request(app)
      .get(`/api/v1/tenants/tenant-a/aggregation/jobs/${jobId}`)
      .set(h("u-mg-a", "MANAGER"));
    expect(status.status).toBe(200);
    expect(status.body.item.status).toBe("TIMEOUT");
    expect(status.body.item.errorCode).toBe("AGGREGATION_TIMEOUT");
  });

  it("survives simulated node restart with control-plane records intact", async () => {
    const store = createStore();
    const appA = createApp(store);
    await enableFlags(appA, ["phase7_integration_control", "phase7_compliance_exports"]);

    const created = await request(appA)
      .post("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "Restart Client" });
    expect(created.status).toBe(201);
    const clientId = created.body.item.clientId as string;

    const hold = await request(appA)
      .post("/api/v1/tenants/tenant-a/compliance/legal-holds")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ scope: "TENANT", reason: "restart-drill" });
    expect(hold.status).toBe(201);

    // Simulated restart: create a new app instance using the same in-memory store.
    const appB = createApp(store);

    const clients = await request(appB)
      .get("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"));
    expect(clients.status).toBe(200);
    expect(clients.body.items.some((item: any) => item.clientId === clientId)).toBe(true);

    const holds = await request(appB)
      .get("/api/v1/tenants/tenant-a/compliance/legal-holds")
      .set(h("u-mg-a", "MANAGER"));
    expect(holds.status).toBe(200);
    expect(holds.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("handles cache eviction storm without tenant leakage", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_predictive", "phase7_scale_guard", "scale_reads"]);

    for (let i = 0; i < 8; i += 1) {
      const seeded = await request(app)
        .get("/api/v1/tenants/tenant-a/predictive/trends?metric=queue_pending&historyDays=30&forecastDays=5")
        .set(h("u-mg-a", "MANAGER"));
      expect(seeded.status).toBe(200);
    }

    const evicted = await request(app)
      .delete("/api/v1/tenants/tenant-a/scale-guard/cache?prefix=phase7:")
      .set(h("u-mg-a", "MANAGER"));
    expect(evicted.status).toBe(200);
    expect(evicted.body.item.removed).toBeGreaterThanOrEqual(1);

    const crossTenantStats = await request(app)
      .get("/api/v1/tenants/tenant-b/scale-guard/stats")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossTenantStats.status).toBe(403);
  });
});
