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

describe("Phase 7 - Operational intelligence modules", () => {
  it("FR-P7-1001..FR-P7-1004: observability dashboard exposes SLA, alerts, and job metrics", async () => {
    const store = createStore();
    const app = createApp(store);
    await enableFlags(app, ["phase7_observability", "phase7_scale_guard"]);

    store.addStructuredMetric({
      metricName: "offline_retry_success_rate_pct",
      metricUnit: "ratio",
      metricValue: 82,
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      tags: { source: "seed" },
      source: "SYSTEM",
    });
    store.addStructuredMetric({
      metricName: "offline_escalation_rate_pct",
      metricUnit: "ratio",
      metricValue: 11,
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      tags: { source: "seed" },
      source: "SYSTEM",
    });
    store.addStructuredMetric({
      metricName: "job_duration_ms",
      metricUnit: "ms",
      metricValue: 124,
      tenantId: "tenant-a",
      branchId: "system",
      tags: { jobType: "aggregation", status: "SUCCEEDED" },
      source: "SYSTEM",
    });

    const dashboard = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/dashboard")
      .set(h("u-mg-a", "MANAGER"));
    expect(dashboard.status).toBe(200);
    expect(["PRIMARY", "REPLICA", "CACHE"]).toContain(dashboard.body.item.readSource);
    expect(dashboard.body.item.cards.metricsLastHour).toBeGreaterThan(0);

    const alerts = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/alerts")
      .set(h("u-mg-a", "MANAGER"));
    expect(alerts.status).toBe(200);
    expect(alerts.body.item.items.length).toBeGreaterThan(0);

    const jobs = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/jobs?page=1&pageSize=10")
      .set(h("u-mg-a", "MANAGER"));
    expect(jobs.status).toBe(200);
    expect(Array.isArray(jobs.body.item.items)).toBe(true);
  });

  it("FR-P7-1005..FR-P7-1008: predictive analytics returns read-only forecasts and CSV/JSON exports", async () => {
    const store = createStore();
    const app = createApp(store);
    await enableFlags(app, ["phase7_predictive", "phase7_scale_guard"]);
    const queueBefore = store.queue.length;

    store.addStructuredMetric({
      metricName: "offline_retry_success_rate_pct",
      metricUnit: "ratio",
      metricValue: 91,
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      tags: { source: "seed" },
      source: "SYSTEM",
    });

    const trend = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/trends?metric=net_sales&historyDays=30&forecastDays=5")
      .set(h("u-mg-a", "MANAGER"));
    expect(trend.status).toBe(200);
    expect(trend.body.item.item.rows.length).toBe(35);

    const sla = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/sla?horizonDays=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(sla.status).toBe(200);
    expect(["INFO", "WARN", "CRITICAL"]).toContain(sla.body.item.item.riskLevel);

    const jsonExport = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/export?dataset=sla&format=json&horizonDays=5")
      .set(h("u-mg-a", "MANAGER"));
    expect(jsonExport.status).toBe(200);
    expect(Array.isArray(jsonExport.body.item.rows)).toBe(true);

    const csvExport = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/export?dataset=trend&format=csv&metric=net_sales")
      .set(h("u-mg-a", "MANAGER"));
    expect(csvExport.status).toBe(200);
    expect(csvExport.headers["content-type"]).toContain("text/csv");

    const queueAfter = store.queue.length;
    expect(queueAfter).toBe(queueBefore);

    const crossTenant = await request(app)
      .get("/api/v1/tenants/tenant-b/predictive/sla?horizonDays=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossTenant.status).toBe(403);
  });

  it("FR-P7-1009..FR-P7-1012: webhook integration control plane enforces token verification and kill-switch", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_integration_control", "webhook_outbound"]);

    const client = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Phase7 Ops Client",
        description: "control-plane test",
        allowedEventTypes: ["PHASE7_EVENT"],
      });
    expect(client.status).toBe(201);
    expect(typeof client.body.token).toBe("string");
    expect(client.body.item.tokenHash).toBeUndefined();
    const clientId = client.body.item.clientId as string;

    const validToken = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/clients/${clientId}/token/verify`)
      .query({ token: client.body.token })
      .set(h("u-mg-a", "MANAGER"));
    expect(validToken.status).toBe(200);
    expect(validToken.body.item.valid).toBe(true);

    const invalidToken = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/clients/${clientId}/token/verify`)
      .query({ token: "invalid-token" })
      .set(h("u-mg-a", "MANAGER"));
    expect(invalidToken.status).toBe(200);
    expect(invalidToken.body.item.valid).toBe(false);

    const rotated = await request(app)
      .post(`/api/v1/tenants/tenant-a/webhooks/clients/${clientId}/rotate-token`)
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(rotated.status).toBe(200);
    expect(typeof rotated.body.token).toBe("string");

    const rotatedValid = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/clients/${clientId}/token/verify`)
      .query({ token: rotated.body.token })
      .set(h("u-mg-a", "MANAGER"));
    expect(rotatedValid.status).toBe(200);
    expect(rotatedValid.body.item.valid).toBe(true);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Phase7 Endpoint",
        url: "https://example.org/webhooks/phase7",
        eventTypes: ["PHASE7_EVENT"],
        integrationClientId: clientId,
      });
    expect(endpoint.status).toBe(201);

    const dispatch = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "PHASE7_EVENT",
        idempotencyKey: "9c935818-4ad3-4fd6-9f66-9f915814cf3a",
        payload: { ok: true },
      });
    expect(dispatch.status).toBe(202);
    expect(dispatch.body.item.deliveries.length).toBe(1);

    const verify = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/deliveries/${dispatch.body.item.deliveries[0].deliveryId}/verify`)
      .set(h("u-mg-a", "MANAGER"));
    expect(verify.status).toBe(200);
    expect(verify.body.item.signatureValid).toBe(true);

    const kill = await request(app)
      .patch(`/api/v1/tenants/tenant-a/webhooks/clients/${clientId}/kill-switch`)
      .set(h("u-mg-a", "MANAGER"))
      .send({ enabled: true });
    expect(kill.status).toBe(200);
    expect(kill.body.item.killSwitch).toBe(true);

    const blocked = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "PHASE7_EVENT",
        idempotencyKey: "c6f6f9f5-cf7d-423d-80c7-9708ed4d8c2c",
        payload: { ok: true },
      });
    expect(blocked.status).toBe(404);
    expect(blocked.body.error).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
  });

  it("FR-P7-1016..FR-P7-1018: phase7 feature flags default off and can be enabled per tenant", async () => {
    const app = createApp(createStore());

    const before = await request(app)
      .get("/api/v1/tenants/tenant-a/feature-flags")
      .set(h("u-mg-a", "MANAGER"));
    expect(before.status).toBe(200);
    expect(before.body.item.flags.phase7_observability).toBe(false);
    expect(before.body.item.flags.phase7_predictive).toBe(false);
    expect(before.body.item.flags.phase7_integration_control).toBe(false);
    expect(before.body.item.flags.phase7_compliance_exports).toBe(false);
    expect(before.body.item.flags.phase7_scale_guard).toBe(false);

    await enableFlags(app, [
      "phase7_observability",
      "phase7_predictive",
      "phase7_integration_control",
      "phase7_compliance_exports",
      "phase7_scale_guard",
    ]);

    const after = await request(app)
      .get("/api/v1/tenants/tenant-a/feature-flags")
      .set(h("u-mg-a", "MANAGER"));
    expect(after.status).toBe(200);
    expect(after.body.item.flags.phase7_observability).toBe(true);
    expect(after.body.item.flags.phase7_predictive).toBe(true);
    expect(after.body.item.flags.phase7_integration_control).toBe(true);
    expect(after.body.item.flags.phase7_compliance_exports).toBe(true);
    expect(after.body.item.flags.phase7_scale_guard).toBe(true);
  });

  it("FR-P7-1019: aggregation health and non-blocking job processing remain queryable", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["background_aggregation", "phase7_observability"]);

    const startedAt = Date.now();
    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/aggregation/jobs")
      .set(h("u-mg-a", "MANAGER"))
      .send({ window: "24h" });
    const enqueueLatencyMs = Date.now() - startedAt;
    expect(queued.status).toBe(202);
    expect(enqueueLatencyMs).toBeLessThanOrEqual(500);

    await new Promise((resolve) => setTimeout(resolve, 40));
    const jobs = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/jobs?page=1&pageSize=50&jobType=aggregation")
      .set(h("u-mg-a", "MANAGER"));
    expect(jobs.status).toBe(200);
    expect(Array.isArray(jobs.body.item.items)).toBe(true);
  });

  it("FR-P7-1019..FR-P7-1020: scale-guard stats and tenant-safe eviction are exposed", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_predictive", "phase7_scale_guard", "scale_reads"]);

    const seeded = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/trends?metric=receipts&historyDays=30&forecastDays=5")
      .set(h("u-mg-a", "MANAGER"));
    expect(seeded.status).toBe(200);
    expect(["PRIMARY", "REPLICA", "CACHE"]).toContain(seeded.body.item.readSource);

    const stats = await request(app)
      .get("/api/v1/tenants/tenant-a/scale-guard/stats")
      .set(h("u-mg-a", "MANAGER"));
    expect(stats.status).toBe(200);
    expect(stats.body.item.entries).toBeGreaterThanOrEqual(1);

    const evicted = await request(app)
      .delete("/api/v1/tenants/tenant-a/scale-guard/cache?prefix=phase7:")
      .set(h("u-mg-a", "MANAGER"));
    expect(evicted.status).toBe(200);
    expect(evicted.body.item.removed).toBeGreaterThanOrEqual(1);

    const metrics = await request(app)
      .get("/api/v1/ops/metrics?metricName=scale_read_latency_ms")
      .set(h("u-mg-a", "MANAGER"));
    expect(metrics.status).toBe(200);
    expect(metrics.body.items.some((item: any) => item.tags?.hint === "PREDICTIVE")).toBe(true);
  });

  it("FR-P7-1013..FR-P7-1020 security: compliance exports and integration control stay tenant scoped", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_compliance_exports", "phase7_integration_control"]);

    const crossTenantExport = await request(app)
      .get("/api/v1/tenants/tenant-b/compliance/exports?format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossTenantExport.status).toBe(403);

    const crossTenantControl = await request(app)
      .get("/api/v1/tenants/tenant-b/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossTenantControl.status).toBe(403);
  });
});
