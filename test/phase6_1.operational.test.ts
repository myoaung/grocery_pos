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

describe("Phase 6.1 - Operational readiness", () => {
  it("provides read-only audit integrity verification endpoint", async () => {
    const app = createApp(createStore());

    const integrity = await request(app).get("/api/v1/audit/integrity").set(h("u-mg-a", "MANAGER"));
    expect(integrity.status).toBe(200);
    expect(integrity.body.item.chainValid).toBe(true);
    expect(integrity.body.item.severityDowngradeCount).toBe(0);

    const readonlyContract = await request(app)
      .post("/api/v1/audit/integrity")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(readonlyContract.status).toBe(404);
  });

  it("simulates one CRITICAL incident lifecycle with full detect/classify/respond/resolve evidence", async () => {
    const app = createApp(createStore());

    const simulated = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/incidents/simulate-critical")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/sales/checkout",
        summary: "Phase 6.1 operational incident drill",
      });
    expect(simulated.status).toBe(201);
    expect(simulated.body.item.lifecycle).toHaveLength(4);
    expect(simulated.body.item.lifecycle.map((item: any) => item.stage)).toEqual([
      "DETECT",
      "CLASSIFY",
      "RESPOND",
      "RESOLVE",
    ]);

    const evidence = await request(app)
      .get(`/api/v1/tenants/tenant-a/risk-compliance/incidents?incidentId=${simulated.body.item.incidentId}`)
      .set(h("u-mg-a", "MANAGER"));
    expect(evidence.status).toBe(200);
    expect(evidence.body.items).toHaveLength(4);
    expect(evidence.body.items.every((item: any) => item.severity === "CRITICAL")).toBe(true);
  });

  it("defines and exposes operational SLI/SLO contracts and structured metrics feed", async () => {
    const app = createApp(createStore());

    const queueA = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/queue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "REPORT",
        idempotencyKey: "99999999-9999-4999-8999-999999999991",
        payload: { templateId: "REP-X-LOY-001", filters: {} },
      });
    expect(queueA.status).toBe(201);

    const sync = await request(app)
      .post("/api/v1/tenants/tenant-a/sync/retry")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(sync.status).toBe(200);

    const slis = await request(app).get("/api/v1/ops/slis").set(h("u-mg-a", "MANAGER"));
    expect(slis.status).toBe(200);
    expect(slis.body.item.slos.offlineRetrySuccessRatePct.metricName).toBe("offline_retry_success_rate_pct");
    expect(slis.body.item.slos.offlineEscalationRatePct.metricName).toBe("offline_escalation_rate_pct");
    expect(slis.body.item.slos.auditWriteLatencyMs.metricName).toBe("audit_write_latency_ms");

    const metrics = await request(app).get("/api/v1/ops/metrics").set(h("u-mg-a", "MANAGER"));
    expect(metrics.status).toBe(200);
    expect(metrics.body.items.some((item: any) => item.metricName === "offline_retry_success_rate_pct")).toBe(true);
    expect(metrics.body.items.some((item: any) => item.metricName === "audit_write_latency_ms")).toBe(true);
  });

  it("runs 10h simulated soak load without integrity regressions", async () => {
    const store = createStore();
    const app = createApp(store);

    for (let hour = 0; hour < 10; hour += 1) {
      for (let index = 0; index < 25; index += 1) {
        const tail = String(hour * 100 + index).padStart(12, "0");
        const idempotencyKey = `00000000-0000-4000-8000-${tail}`;
        const queued = await request(app)
          .post("/api/v1/tenants/tenant-a/sync/queue")
          .set(h("u-mg-a", "MANAGER"))
          .send({
            eventType: "REPORT",
            idempotencyKey,
            payload: { templateId: "REP-X-LOY-001", filters: {} },
          });
        expect(queued.status).toBe(201);
      }

      const ageIso = new Date(Date.now() - hour * 60 * 60 * 1000).toISOString();
      for (const item of store.queue.filter((row) => row.tenantId === "tenant-a")) {
        if (item.state === "PENDING") {
          item.createdAt = ageIso;
          item.updatedAt = ageIso;
        }
      }

      const sync = await request(app)
        .post("/api/v1/tenants/tenant-a/sync/retry")
        .set(h("u-mg-a", "MANAGER"))
        .send({});
      expect(sync.status).toBe(200);
    }

    const integrity = await request(app).get("/api/v1/audit/integrity").set(h("u-mg-a", "MANAGER"));
    expect(integrity.status).toBe(200);
    expect(integrity.body.item.chainValid).toBe(true);
    expect(integrity.body.item.severityDowngradeCount).toBe(0);

    const metrics = await request(app).get("/api/v1/ops/metrics?metricName=offline_retry_success_rate_pct").set(h("u-mg-a", "MANAGER"));
    expect(metrics.status).toBe(200);
    expect(metrics.body.items.length).toBeGreaterThan(0);
  });

  it("verifies upgrade-path compatibility from Phase 5 runtime flows into Phase 6 hardening", async () => {
    const app = createApp(createStore());

    const discount = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        customerId: "cust-a-1",
        lines: [{ productId: "prod-a-001", quantity: 4 }],
        applyLoyaltySynergy: true,
        couponCode: "WEEKEND5",
      });
    expect(discount.status).toBe(201);
    expect(discount.body.item.stackedDiscountPct).toBeGreaterThanOrEqual(0);

    const multiStore = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=50")
      .set(h("u-mg-a", "MANAGER"));
    expect(multiStore.status).toBe(200);
    expect(multiStore.body.aggregationMode).toBe("LIVE_WITH_SNAPSHOT");

    const risk = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/sales/checkout",
        action: "WRITE",
        vpnDetected: true,
        untrustedDevice: true,
      });
    expect([200, 403, 409]).toContain(risk.status);

    const integrity = await request(app).get("/api/v1/audit/integrity").set(h("u-mg-a", "MANAGER"));
    expect(integrity.status).toBe(200);
    expect(integrity.body.item.chainValid).toBe(true);
  });
});
