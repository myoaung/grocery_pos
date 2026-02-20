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

describe("Phase 8 - Chaos and failure scenarios", () => {
  it("handles outbound webhook network failures with explicit retry path", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_integration_control", "webhook_outbound"]);

    const client = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "P8 Chaos Client", allowedEventTypes: ["P8_CHAOS"] });
    expect(client.status).toBe(201);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "P8 Chaos Endpoint",
        url: "https://fail.example.org/webhooks/p8-chaos",
        eventTypes: ["P8_CHAOS"],
        integrationClientId: client.body.item.clientId,
      });
    expect(endpoint.status).toBe(201);

    const failed = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "P8_CHAOS",
        idempotencyKey: "03e77508-6157-49ef-ad4d-8bdbe915b08a",
        payload: { run: "phase8-chaos" },
        simulateFailure: true,
      });
    expect(failed.status).toBe(202);
    expect(["RETRYING", "FAILED"]).toContain(failed.body.item.deliveries[0].status);
  });

  it("keeps offline fallback explicit in enhanced insights under queue pressure", async () => {
    const app = createApp(createStore());
    await enableFlags(app, [
      "phase8_ops_enhancements",
      "phase7_observability",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    for (let index = 0; index < 4; index += 1) {
      const queued = await request(app)
        .post("/api/v1/tenants/tenant-a/sync/queue")
        .set(h("u-mg-a", "MANAGER"))
        .send({
          eventType: "REPORT",
          idempotencyKey: `5e623211-c5f3-4eb0-9fef-0416cc89b5d${index}`,
          payload: { templateId: "REP-X-OPS-001", filters: { idx: index } },
        });
      expect(queued.status).toBe(201);
    }

    const insights = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/insights?page=1&pageSize=10")
      .set(h("u-mg-a", "MANAGER"));
    expect(insights.status).toBe(200);
    expect(insights.body.item.summary.offlineFallback).toBe(true);
    expect(insights.body.item.summary.pendingQueue).toBeGreaterThan(0);
  });

  it("fails closed when predictive action flag toggles OFF mid-run", async () => {
    const app = createApp(createStore());
    await enableFlags(app, [
      "phase8_predictive_actions",
      "phase7_predictive",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    const ok = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions?refresh=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(ok.status).toBe(200);

    const disable = await request(app)
      .patch("/api/v1/tenants/tenant-a/feature-flags/phase8_predictive_actions")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: false });
    expect(disable.status).toBe(200);

    const blocked = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions")
      .set(h("u-mg-a", "MANAGER"));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("FEATURE_FLAG_DISABLED");
  });
});
