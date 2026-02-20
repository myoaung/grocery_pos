import request from "supertest";
import { describe, expect, it } from "vitest";
import { PERFORMANCE_BUDGET } from "../src/config/performanceBudget";
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

describe("Phase 7 - Performance guards", () => {
  it("keeps observability dashboard response within budget envelope", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_observability", "phase7_scale_guard"]);

    const startedAt = Date.now();
    const response = await request(app)
      .get("/api/v1/tenants/tenant-a/observability/dashboard")
      .set(h("u-mg-a", "MANAGER"));
    const durationMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs);
  });

  it("keeps predictive forecast latency stable across repeated calls", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_predictive", "phase7_scale_guard", "scale_reads"]);

    const runs: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const startedAt = Date.now();
      const response = await request(app)
        .get("/api/v1/tenants/tenant-a/predictive/trends?metric=net_sales&historyDays=30&forecastDays=7")
        .set(h("u-mg-a", "MANAGER"));
      runs.push(Date.now() - startedAt);
      expect(response.status).toBe(200);
    }

    const p95 = runs.sort((a, b) => a - b)[Math.max(0, Math.ceil(runs.length * 0.95) - 1)];
    expect(p95).toBeLessThanOrEqual(1500);
  });

  it("handles cache load for scale-guard stats and safe eviction", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["phase7_predictive", "phase7_scale_guard", "scale_reads"]);

    for (let index = 0; index < 15; index += 1) {
      const response = await request(app)
        .get("/api/v1/tenants/tenant-a/predictive/trends?metric=receipts&historyDays=30&forecastDays=7")
        .set(h("u-mg-a", "MANAGER"));
      expect(response.status).toBe(200);
    }

    const stats = await request(app)
      .get("/api/v1/tenants/tenant-a/scale-guard/stats")
      .set(h("u-mg-a", "MANAGER"));
    expect(stats.status).toBe(200);
    expect(stats.body.item.entries).toBeGreaterThanOrEqual(1);

    const evict = await request(app)
      .delete("/api/v1/tenants/tenant-a/scale-guard/cache?prefix=phase7:")
      .set(h("u-mg-a", "MANAGER"));
    expect(evict.status).toBe(200);
  });

  it("retains Phase 5/6 report budget compliance during Phase 7 additions", async () => {
    const app = createApp(createStore());
    const startedAt = Date.now();
    const report = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=50")
      .set(h("u-mg-a", "MANAGER"));
    const durationMs = Date.now() - startedAt;
    expect(report.status).toBe(200);
    expect(durationMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs);
  });
});
