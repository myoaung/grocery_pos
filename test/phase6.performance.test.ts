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

describe("Phase 6 - Performance and scalability guardrails", () => {
  it("FR-P6-911: multi-store reporting keeps pagination guardrails with bounded response time", async () => {
    const store = createStore();
    const app = createApp(store);

    for (let i = 0; i < 180; i += 1) {
      store.sales.push({
        saleId: `phase6-perf-${i}`,
        tenantId: "tenant-a",
        branchId: i % 2 === 0 ? "branch-a-1" : "branch-a-2",
        cashierUserId: "u-mg-a",
        mode: "RETAIL",
        status: "CONFIRMED",
        lines: [
          {
            productId: "prod-a-001",
            quantity: 1,
            unitPrice: 700,
            discountAmount: 0,
            taxableAmount: 700,
            taxAmount: 35,
            lineTotalBeforeDiscount: 700,
            netLineTotal: 735,
            costSnapshotAtSale: 500,
          },
        ],
        subtotal: 700,
        discountTotal: 0,
        taxTotal: 35,
        netTotal: 735,
        createdAt: store.nowIso(),
      });
    }

    const started = Date.now();
    const report = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=200")
      .set(h("u-mg-a", "MANAGER"));
    const elapsed = Date.now() - started;

    expect(report.status).toBe(200);
    expect(report.body.aggregationMode).toBe("LIVE_WITH_SNAPSHOT");
    expect(report.body.pagination.pageSize).toBe(200);
    expect(report.body.pagination.limitMax).toBe(200);
    expect(elapsed).toBeLessThan(1500);

    const outOfRange = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?pageSize=201")
      .set(h("u-mg-a", "MANAGER"));
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.error).toBe("INVALID_PAGINATION");
  });

  it("FR-P6-912: offline queue status exposes retry/backoff/replay policy and prolonged-offline signal", async () => {
    const store = createStore();
    const app = createApp(store);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        payload: {
          templateId: "REP-X-LOY-001",
          filters: {},
        },
      });
    expect(queued.status).toBe(201);

    // Force aged queue to simulate prolonged offline state.
    const row = store.queue.find((item) => item.idempotencyKey === "55555555-5555-4555-8555-555555555555");
    expect(row).toBeDefined();
    if (row) {
      row.createdAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      row.updatedAt = row.createdAt;
    }

    const status = await request(app)
      .get("/api/v1/tenants/tenant-a/offline/status")
      .set(h("u-mg-a", "MANAGER"));
    expect(status.status).toBe(200);
    expect(status.body.item.retryPolicy.initialBackoffMs).toBe(1000);
    expect(status.body.item.retryPolicy.maxBackoffMs).toBe(30000);
    expect(status.body.item.retryPolicy.maxReplayWindowHours).toBe(72);
    expect(status.body.item.retryPolicy.maxRetryAttempts).toBe(5);
    expect(status.body.item.prolongedOffline).toBe(true);
    expect(status.body.item.oldestPendingMinutes).toBeGreaterThanOrEqual(30);
  });

  it("FR-P6-911: emits structured report latency metrics and runtime latency headers", async () => {
    const app = createApp(createStore());

    const report = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=50")
      .set(h("u-mg-a", "MANAGER"));
    expect(report.status).toBe(200);
    expect(typeof report.headers["x-report-latency-ms"]).toBe("string");

    const metrics = await request(app)
      .get("/api/v1/ops/metrics?metricName=report_runtime_latency_ms")
      .set(h("u-mg-a", "MANAGER"));
    expect(metrics.status).toBe(200);
    expect(metrics.body.items.length).toBeGreaterThan(0);
  });

  it("FR-P6-921/FR-P6-922: scale reads cache hot path and async aggregation queue stay non-blocking", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion", "scale_reads", "background_aggregation"]);

    const coldStarted = Date.now();
    const cold = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=14")
      .set(h("u-mg-a", "MANAGER"));
    const coldElapsed = Date.now() - coldStarted;
    expect(cold.status).toBe(200);
    expect(cold.body.item.cacheHit).toBe(false);
    expect(coldElapsed).toBeLessThan(1000);

    const hotStarted = Date.now();
    const hot = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=14")
      .set(h("u-mg-a", "MANAGER"));
    const hotElapsed = Date.now() - hotStarted;
    expect(hot.status).toBe(200);
    expect(hot.body.item.cacheHit).toBe(true);
    expect(hotElapsed).toBeLessThan(1000);

    const jobStarted = Date.now();
    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/aggregation/jobs")
      .set(h("u-mg-a", "MANAGER"))
      .send({ window: "24h" });
    const queueElapsed = Date.now() - jobStarted;
    expect(queued.status).toBe(202);
    expect(queueElapsed).toBeLessThan(500);
  });
});
