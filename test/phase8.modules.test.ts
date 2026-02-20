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

describe("Phase 8 - Predictive Actions", () => {
  it("FR-P8-1101..FR-P8-1104: returns expected predictive actions and supports write decisions", async () => {
    const store = createStore();
    const app = createApp(store);
    await enableFlags(app, [
      "phase7_predictive",
      "phase8_predictive_actions",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    store.addStructuredMetric({
      metricName: "offline_escalation_rate_pct",
      metricUnit: "ratio",
      metricValue: 35,
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      tags: { source: "seed" },
      source: "SYSTEM",
    });

    const queue = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "64d6e32e-4054-4245-b86f-c72767087eec",
        payload: { templateId: "REP-X-OPS-001", filters: {} },
      });
    expect(queue.status).toBe(201);

    const listed = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions?metric=queue_pending&refresh=true&page=1&pageSize=20")
      .set(h("u-mg-a", "MANAGER"));
    expect(listed.status).toBe(200);
    expect(listed.body.item.items.length).toBeGreaterThanOrEqual(1);
    const first = listed.body.item.items[0];
    expect(["SLA", "TREND"]).toContain(first.dataset);
    expect(["INFO", "WARN", "CRITICAL"]).toContain(first.severity);

    const acted = await request(app)
      .post(`/api/v1/tenants/tenant-a/predictive/actions/${first.actionId}/act`)
      .set(h("u-mg-a", "MANAGER"))
      .send({ decision: "ACKNOWLEDGE", note: "phase8-check" });
    expect(acted.status).toBe(200);
    expect(acted.body.item.status).toBe("ACKNOWLEDGED");
  });

  it("FR-P8-1105..FR-P8-1106: applies RBAC and feature-flag gates for predictive actions", async () => {
    const app = createApp(createStore());

    const disabled = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions")
      .set(h("u-mg-a", "MANAGER"));
    expect(disabled.status).toBe(409);
    expect(disabled.body.error).toBe("FEATURE_FLAG_DISABLED");

    await enableFlags(app, ["phase8_predictive_actions", "phase7_predictive", "phase7_scale_guard", "scale_reads"]);
    const list = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions?refresh=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(list.status).toBe(200);

    const seeded = list.body.item.items[0];
    if (seeded) {
      const cashierDenied = await request(app)
        .post(`/api/v1/tenants/tenant-a/predictive/actions/${seeded.actionId}/act`)
        .set(h("u-ca-a", "CASHIER"))
        .send({ decision: "EXECUTE" });
      expect(cashierDenied.status).toBe(403);
    }
  });
});

describe("Phase 8 - Ops Dashboard Enhancements", () => {
  it("FR-P8-1107..FR-P8-1110: renders enhanced insights and filters severity/status", async () => {
    const store = createStore();
    const app = createApp(store);
    await enableFlags(app, [
      "phase7_observability",
      "phase7_predictive",
      "phase8_predictive_actions",
      "phase8_ops_enhancements",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    store.addStructuredMetric({
      metricName: "offline_escalation_rate_pct",
      metricUnit: "ratio",
      metricValue: 45,
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      tags: { source: "seed" },
      source: "SYSTEM",
    });

    const created = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions?metric=queue_pending&refresh=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(created.status).toBe(200);

    const insights = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/insights?severity=CRITICAL&page=1&pageSize=25")
      .set(h("u-mg-a", "MANAGER"));
    expect(insights.status).toBe(200);
    expect(insights.body.item.severityLegend.CRITICAL).toBeDefined();
    expect(insights.body.item.pagination.pageSize).toBe(25);
    expect(Array.isArray(insights.body.item.actions)).toBe(true);
    expect(insights.body.item.actions.every((item: any) => item.severity === "CRITICAL")).toBe(true);

    const advisory = await request(app)
      .get("/api/v1/tenants/tenant-a/scale-guard/advisory")
      .set(h("u-mg-a", "MANAGER"));
    expect(advisory.status).toBe(200);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(advisory.body.item.throughputClass);
    expect(Array.isArray(advisory.body.item.hints)).toBe(true);
  });
});

describe("Phase 8 - Webhooks and Compliance", () => {
  it("FR-P8-1111..FR-P8-1114: delivers outbound webhooks with idempotency, retry, signature, and health visibility", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_integration_control", "webhook_outbound"]);

    const client = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "Phase8 Client", allowedEventTypes: ["P8_EVENT"] });
    expect(client.status).toBe(201);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Phase8 Endpoint",
        url: "https://example.org/webhooks/p8",
        eventTypes: ["P8_EVENT"],
        integrationClientId: client.body.item.clientId,
      });
    expect(endpoint.status).toBe(201);

    const dispatchA = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "P8_EVENT",
        idempotencyKey: "f9f682ba-ab2d-4f89-a512-a309d12af8d0",
        payload: { stage: "A" },
      });
    expect(dispatchA.status).toBe(202);
    expect(dispatchA.body.item.outboundOnly).toBe(true);

    const dispatchB = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "P8_EVENT",
        idempotencyKey: "f9f682ba-ab2d-4f89-a512-a309d12af8d0",
        payload: { stage: "A" },
      });
    expect(dispatchB.status).toBe(202);

    const deliveries = await request(app)
      .get("/api/v1/tenants/tenant-a/webhooks/deliveries")
      .set(h("u-mg-a", "MANAGER"));
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.items.length).toBe(1);

    const verified = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/deliveries/${deliveries.body.items[0].deliveryId}/verify`)
      .set(h("u-mg-a", "MANAGER"));
    expect(verified.status).toBe(200);
    expect(verified.body.item.signatureValid).toBe(true);
    expect(verified.body.item.signatureAlgorithm).toBe("HMAC-SHA256");

    const health = await request(app)
      .get("/api/v1/tenants/tenant-a/webhooks/control/health")
      .set(h("u-mg-a", "MANAGER"));
    expect(health.status).toBe(200);
    expect(health.body.item.outboundOnly).toBe(true);
  });

  it("FR-P8-1115..FR-P8-1118: compliance exports include legal-hold visibility and retention metadata", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_compliance_exports", "phase8_ops_enhancements"]);

    const hold = await request(app)
      .post("/api/v1/tenants/tenant-a/compliance/legal-holds")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ scope: "TENANT", reason: "phase8-compliance-check" });
    expect(hold.status).toBe(201);

    const exported = await request(app)
      .get("/api/v1/tenants/tenant-a/compliance/exports?format=json&page=1&pageSize=20")
      .set(h("u-mg-a", "MANAGER"));
    expect(exported.status).toBe(200);
    expect(Array.isArray(exported.body.item.rows)).toBe(true);
    const row = exported.body.item.rows[0];
    if (row) {
      expect(row.legal_hold_active).toBeDefined();
      expect(row.retention_days).toBeDefined();
      expect(row.retention_expires_at).toBeDefined();
      expect(row.immutable_record).toBe(true);
    }

    const retention = await request(app)
      .get("/api/v1/tenants/tenant-a/compliance/exports/retention")
      .set(h("u-mg-a", "MANAGER"));
    expect(retention.status).toBe(200);
    expect(retention.body.item.appendOnlyContract).toBe(true);
    expect(retention.body.item.retention.auditDays).toBeGreaterThan(0);
  });

  it("FR-P8-1119..FR-P8-1120 security: predictive/compliance routes remain tenant-scoped", async () => {
    const app = createApp(createStore());
    await enableFlags(app, [
      "phase8_predictive_actions",
      "phase7_predictive",
      "phase7_scale_guard",
      "scale_reads",
      "phase7_compliance_exports",
    ]);

    const crossPredictive = await request(app)
      .get("/api/v1/tenants/tenant-b/predictive/actions")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossPredictive.status).toBe(403);

    const crossCompliance = await request(app)
      .get("/api/v1/tenants/tenant-b/compliance/exports?format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossCompliance.status).toBe(403);
  });
});
