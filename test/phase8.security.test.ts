import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { AuditService } from "../src/services/auditService";
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

describe("Phase 8 - Security hardening", () => {
  it("enforces feature-flag fail-closed behavior for Phase 8 endpoints", async () => {
    const app = createApp(createStore());

    const predictive = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions")
      .set(h("u-mg-a", "MANAGER"));
    expect(predictive.status).toBe(409);
    expect(predictive.body.error).toBe("FEATURE_FLAG_DISABLED");

    await enableFlags(app, ["phase7_observability", "phase7_scale_guard", "scale_reads"]);
    const insights = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/insights")
      .set(h("u-mg-a", "MANAGER"));
    expect(insights.status).toBe(409);
    expect(insights.body.error).toBe("FEATURE_FLAG_DISABLED");
  });

  it("keeps audit records immutable and append-only under Phase 8 activity", async () => {
    const store = createStore();
    const app = createApp(store);
    const audit = new AuditService(store);
    await enableFlags(app, [
      "phase7_predictive",
      "phase8_predictive_actions",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "6c1319e5-f57f-4dc8-ba8d-f2efe22c565f",
        payload: { templateId: "REP-X-OPS-001", filters: {} },
      });
    expect(queued.status).toBe(201);

    const listed = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions?metric=queue_pending&refresh=true")
      .set(h("u-mg-a", "MANAGER"));
    expect(listed.status).toBe(200);
    expect(listed.body.item.items.length).toBeGreaterThan(0);

    const actionId = listed.body.item.items[0].actionId as string;
    const acted = await request(app)
      .post(`/api/v1/tenants/tenant-a/predictive/actions/${actionId}/act`)
      .set(h("u-mg-a", "MANAGER"))
      .send({ decision: "EXECUTE" });
    expect(acted.status).toBe(200);

    const integrity = await request(app).get("/api/v1/audit/integrity").set(h("u-mg-a", "MANAGER"));
    expect(integrity.status).toBe(200);
    expect(integrity.body.item.chainValid).toBe(true);
    expect(integrity.body.item.severityDowngradeCount).toBe(0);

    const log = store.auditLogs[0];
    expect(Object.isFrozen(log)).toBe(true);
    expect(() => {
      (log as any).reason = "MUTATED";
    }).toThrow();

    try {
      audit.updateEntry();
      throw new Error("Expected AUDIT_IMMUTABLE update error");
    } catch (error) {
      expect((error as any).code).toBe("AUDIT_IMMUTABLE");
    }

    try {
      audit.deleteEntry();
      throw new Error("Expected AUDIT_IMMUTABLE delete error");
    } catch (error) {
      expect((error as any).code).toBe("AUDIT_IMMUTABLE");
    }
  });

  it("enforces webhook signature evidence and tenant isolation", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_integration_control", "webhook_outbound"]);

    const client = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/clients")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "P8 Security Client", allowedEventTypes: ["P8_SEC"] });
    expect(client.status).toBe(201);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "P8 Security Endpoint",
        url: "https://example.org/webhooks/p8-sec",
        eventTypes: ["P8_SEC"],
        integrationClientId: client.body.item.clientId,
      });
    expect(endpoint.status).toBe(201);

    const dispatch = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "P8_SEC",
        idempotencyKey: "95e7da94-7c41-4e8f-a7a4-a9d28457e6e2",
        payload: { checkpoint: "phase8-security" },
      });
    expect(dispatch.status).toBe(202);

    const verify = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/deliveries/${dispatch.body.item.deliveries[0].deliveryId}/verify`)
      .set(h("u-mg-a", "MANAGER"));
    expect(verify.status).toBe(200);
    expect(verify.body.item.signatureValid).toBe(true);
    expect(verify.body.item.signatureAlgorithm).toBe("HMAC-SHA256");

    const crossTenant = await request(app)
      .get("/api/v1/tenants/tenant-b/webhooks/deliveries")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossTenant.status).toBe(403);
  });
});
