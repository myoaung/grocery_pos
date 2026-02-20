import { randomUUID } from "crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import {
  clearDiscountPolicyOverrideForTesting,
  setDiscountPolicyOverrideForTesting,
} from "../src/config/discountPolicy";
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

describe("Phase 6 - Chaos and failure injection", () => {
  it("FR-P6-915: defers retries when offline backoff window is active", async () => {
    const store = createStore();
    const app = createApp(store);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "66666666-6666-4666-8666-666666666666",
        payload: {
          templateId: "REP-X-LOY-001",
          filters: {},
        },
      });
    expect(queued.status).toBe(201);

    const row = store.queue.find((item) => item.idempotencyKey === "66666666-6666-4666-8666-666666666666");
    expect(row).toBeDefined();
    if (row) {
      row.state = "FAILED";
      row.nextRetryAt = new Date(Date.now() + 60 * 1000).toISOString();
      row.errorCode = "SYNC_FAILED";
      row.errorMessage = "simulated network outage";
    }

    const sync = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(sync.status).toBe(200);
    expect(sync.body.deferred).toBeGreaterThanOrEqual(1);
  });

  it("FR-P6-916: handles duplicate sync storm and keeps idempotency protection active", async () => {
    const store = createStore();
    const app = createApp(store);
    const duplicateKey = "77777777-7777-4777-8777-777777777777";

    const queuedA = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: duplicateKey,
        payload: {
          templateId: "REP-X-LOY-001",
          filters: {},
        },
      });
    expect(queuedA.status).toBe(201);

    // Inject a storm duplicate directly to chaos-test replay safety.
    store.queue.push({
      queueId: randomUUID(),
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      deviceId: "device-chaos",
      idempotencyKey: duplicateKey,
      eventType: "REPORT",
      payload: { templateId: "REP-X-LOY-001", filters: {} },
      state: "PENDING",
      retryCount: 0,
      replayDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      nextRetryAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: store.nowIso(),
      updatedAt: store.nowIso(),
    });

    const sync = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(sync.status).toBe(200);
    expect(sync.body.failed).toBeGreaterThanOrEqual(1);
    expect(store.queue.some((item) => item.errorCode === "DUPLICATE_IDEMPOTENCY_KEY")).toBe(true);
  });

  it("FR-P6-917: expires replay window and escalates with offline SLA alert", async () => {
    const store = createStore();
    const app = createApp(store);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "88888888-8888-4888-8888-888888888888",
        payload: {
          templateId: "REP-X-LOY-001",
          filters: {},
        },
      });
    expect(queued.status).toBe(201);

    const row = store.queue.find((item) => item.idempotencyKey === "88888888-8888-4888-8888-888888888888");
    expect(row).toBeDefined();
    if (row) {
      row.replayDeadlineAt = new Date(Date.now() - 1000).toISOString();
    }

    const sync = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(sync.status).toBe(200);
    expect(sync.body.expired).toBeGreaterThanOrEqual(1);

    const slaAlert = store.offlineAlerts.find(
      (item) => item.source === "OFFLINE_SLA" && item.severity === "BLOCK" && item.tenantId === "tenant-a",
    );
    expect(slaAlert).toBeDefined();
  });

  it("FR-P6-918: handles mid-session risk policy flip via feature flag without silent behavior", async () => {
    const app = createApp(createStore());

    const blocked = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set({ ...h("u-mg-a", "MANAGER"), "x-risk-mode": "BLOCK" })
      .send({ name: "Blocked Before Flip", phone: "0944444444" });
    expect(blocked.status).toBe(403);

    const flip = await request(app)
      .patch("/api/v1/tenants/tenant-a/feature-flags/risk_enforcement")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: false });
    expect(flip.status).toBe(200);

    const afterFlip = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set({ ...h("u-mg-a", "MANAGER"), "x-risk-mode": "BLOCK", "x-risk-vpn": "true" })
      .send({ name: "Allowed After Flip", phone: "0955555555" });
    expect(afterFlip.status).toBe(201);
    expect(afterFlip.headers["x-risk-mode"]).toBe("ALLOW");

    const audit = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(audit.status).toBe(200);
    expect(audit.body.items.some((item: any) => item.actionType === "RISK_POLICY_BYPASS")).toBe(true);
  });

  it("FR-P6-919: fails closed when discount policy is corrupted", async () => {
    const app = createApp(createStore());
    setDiscountPolicyOverrideForTesting("tenant-a", {
      caps: {
        manualOverrideMaxPct: 30,
        globalPct: 10,
      },
    });
    try {
      const result = await request(app)
        .post("/api/v1/tenants/tenant-a/discounts/advanced/evaluate")
        .set(h("u-mg-a", "MANAGER"))
        .send({
          mode: "RETAIL",
          lines: [{ productId: "prod-a-001", quantity: 1 }],
        });

      expect(result.status).toBe(409);
      expect(result.body.error).toBe("DISCOUNT_POLICY_CORRUPTED");
      expect(result.body.reasonCode).toBe("DISC_POLICY_CORRUPTED");
    } finally {
      clearDiscountPolicyOverrideForTesting("tenant-a");
    }
  });

  it("FR-P6-920: handles audit-volume overflow simulation and keeps chain integrity", async () => {
    const app = createApp(createStore());

    for (let index = 0; index < 750; index += 1) {
      const result = await request(app)
        .post("/api/v1/tenants/tenant-a/customers")
        .set(h("u-mg-a", "MANAGER"))
        .send({ name: `Overflow ${index}`, phone: `0999${String(index).padStart(6, "0")}` });
      expect(result.status).toBe(201);
    }

    const integrity = await request(app)
      .get("/api/v1/audit/integrity")
      .set(h("u-mg-a", "MANAGER"));
    expect(integrity.status).toBe(200);
    expect(integrity.body.item.chainValid).toBe(true);
    expect(integrity.body.item.totalEntries).toBeGreaterThanOrEqual(750);
    expect(integrity.body.item.severityDowngradeCount).toBe(0);
  }, 20000);

  it("FR-P6-931: handles webhook delivery failure and retries without duplicate fan-out", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["webhook_outbound"]);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Failing Sink",
        url: "https://fail.example.org/webhooks",
        eventTypes: ["AGGREGATION_READY"],
      });
    expect(endpoint.status).toBe(201);

    const dispatch = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "AGGREGATION_READY",
        idempotencyKey: "f89f9ff2-5cc8-4c9d-ad44-54774f940f36",
        payload: { snapshotId: "snap-chaos-1" },
        simulateFailure: true,
      });
    expect(dispatch.status).toBe(202);
    expect(dispatch.body.item.deliveries[0].status).toBe("RETRYING");

    const duplicateDispatch = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "AGGREGATION_READY",
        idempotencyKey: "f89f9ff2-5cc8-4c9d-ad44-54774f940f36",
        payload: { snapshotId: "snap-chaos-1" },
        simulateFailure: true,
      });
    expect(duplicateDispatch.status).toBe(202);

    const deliveries = await request(app)
      .get("/api/v1/tenants/tenant-a/webhooks/deliveries")
      .set(h("u-mg-a", "MANAGER"));
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.items.length).toBe(1);
  });

  it("FR-P6-932: aggregation timeout simulation escalates without blocking API thread", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["background_aggregation"]);

    const start = Date.now();
    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/aggregation/jobs")
      .set(h("u-mg-a", "MANAGER"))
      .send({ simulateTimeout: true });
    const elapsed = Date.now() - start;
    expect(queued.status).toBe(202);
    expect(elapsed).toBeLessThan(500);

    await new Promise((resolve) => setTimeout(resolve, 25));
    const job = await request(app)
      .get(`/api/v1/tenants/tenant-a/aggregation/jobs/${queued.body.item.jobId}`)
      .set(h("u-mg-a", "MANAGER"));
    expect(job.status).toBe(200);
    expect(job.body.item.status).toBe("TIMEOUT");
    expect(job.body.item.errorCode).toBe("AGGREGATION_TIMEOUT");
  });

  it("FR-P6-933: cache eviction clears analytics cache and forces miss on next read", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion", "scale_reads"]);

    const first = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=receipts&days=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(first.status).toBe(200);
    expect(first.body.item.cacheHit).toBe(false);

    const second = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=receipts&days=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(second.status).toBe(200);
    expect(second.body.item.cacheHit).toBe(true);

    const evicted = await request(app)
      .delete("/api/v1/tenants/tenant-a/analytics/cache?prefix=analytics:")
      .set(h("u-mg-a", "MANAGER"));
    expect(evicted.status).toBe(200);
    expect(evicted.body.removed).toBeGreaterThanOrEqual(1);

    const third = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=receipts&days=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(third.status).toBe(200);
    expect(third.body.item.cacheHit).toBe(false);
  });
});
