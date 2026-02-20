import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { PERFORMANCE_BUDGET } from "../src/config/performanceBudget";
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

describe("Phase 8 - Performance guards", () => {
  it("keeps predictive actions aggregation within reporting hard budget", async () => {
    const store = createStore();
    const app = createApp(store);
    await enableFlags(app, [
      "phase8_predictive_actions",
      "phase7_predictive",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    for (let i = 0; i < 40; i += 1) {
      store.addStructuredMetric({
        metricName: "offline_escalation_rate_pct",
        metricUnit: "ratio",
        metricValue: 8 + i,
        tenantId: "tenant-a",
        branchId: "branch-a-1",
        tags: { source: "load-seed" },
        source: "SYSTEM",
      });
    }

    const startedAt = Date.now();
    const response = await request(app)
      .get("/api/v1/tenants/tenant-a/predictive/actions?metric=queue_pending&page=1&pageSize=100&refresh=true")
      .set(h("u-mg-a", "MANAGER"));
    const durationMs = Date.now() - startedAt;
    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThanOrEqual(PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs);
  });

  it("handles multi-store predictive load with stable advisory latency", async () => {
    const app = createApp(createStore());
    await enableFlags(app, [
      "phase8_predictive_actions",
      "phase8_ops_enhancements",
      "phase7_predictive",
      "phase7_observability",
      "phase7_scale_guard",
      "scale_reads",
    ]);

    const runs: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const startedAt = Date.now();
      const response = await request(app)
        .get("/api/v1/tenants/tenant-a/scale-guard/advisory")
        .set(h("u-mg-a", "MANAGER"));
      runs.push(Date.now() - startedAt);
      expect(response.status).toBe(200);
    }
    const p95 = runs.sort((a, b) => a - b)[Math.max(0, Math.ceil(runs.length * 0.95) - 1)];
    expect(p95).toBeLessThanOrEqual(1500);
  });

  it("preserves Phase 1-7 report runtime budget under Phase 8 additions", async () => {
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
