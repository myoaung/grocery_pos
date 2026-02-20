import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { RetentionPurgeJobService } from "../src/jobs/retention/retentionPurgeJobService";
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

describe("Phase 6 - Expansion modules", () => {
  it("FR-P6-921/FR-P6-926: tenant analytics trend reads are feature-flagged and scale-aware", async () => {
    const app = createApp(createStore());

    const blocked = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("FEATURE_FLAG_DISABLED");

    await enableFlags(app, ["analytics_expansion", "scale_reads"]);

    const first = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(first.status).toBe(200);
    expect(first.body.item.rows.length).toBe(7);
    expect(["PRIMARY", "REPLICA", "CACHE"]).toContain(first.body.item.readSource);

    const second = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=7")
      .set(h("u-mg-a", "MANAGER"));
    expect(second.status).toBe(200);
    expect(second.body.item.rows.length).toBe(7);
    expect(["REPLICA", "CACHE"]).toContain(second.body.item.readSource);
  });

  it("FR-P6-927/FR-P6-928: comparative analysis and export-ready datasets are available", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion", "scale_reads"]);

    const compared = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/compare?metric=receipts&from=2026-01-01&to=2026-12-31")
      .set(h("u-mg-a", "MANAGER"));
    expect(compared.status).toBe(200);
    expect(compared.body.item.item.metric).toBe("receipts");
    expect(compared.body.item.item.current).toBeDefined();
    expect(compared.body.item.item.previous).toBeDefined();

    const exportedJson = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/datasets/export?metric=queue_pending&days=5&format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(exportedJson.status).toBe(200);
    expect(Array.isArray(exportedJson.body.item.rows)).toBe(true);

    const exportedCsv = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/datasets/export?metric=queue_pending&days=5&format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(exportedCsv.status).toBe(200);
    expect(exportedCsv.headers["content-type"]).toContain("text/csv");
  });

  it("FR-P6-922: background aggregation jobs run asynchronously and persist snapshots", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["background_aggregation"]);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/aggregation/jobs")
      .set(h("u-mg-a", "MANAGER"))
      .send({ window: "24h" });
    expect(queued.status).toBe(202);
    const jobId = queued.body.item.jobId as string;
    expect(typeof jobId).toBe("string");

    await new Promise((resolve) => setTimeout(resolve, 20));
    const job = await request(app)
      .get(`/api/v1/tenants/tenant-a/aggregation/jobs/${jobId}`)
      .set(h("u-mg-a", "MANAGER"));
    expect(job.status).toBe(200);
    expect(["RUNNING", "SUCCEEDED"]).toContain(job.body.item.status);

    await new Promise((resolve) => setTimeout(resolve, 40));
    const snapshots = await request(app)
      .get("/api/v1/tenants/tenant-a/aggregation/snapshots")
      .set(h("u-mg-a", "MANAGER"));
    expect(snapshots.status).toBe(200);
    expect(snapshots.body.items.length).toBeGreaterThan(0);
  });

  it("FR-P6-923/FR-P6-924: external audit export and retention policies are feature-flagged", async () => {
    const app = createApp(createStore());

    const blockedAudit = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/audit")
      .set(h("u-mg-a", "MANAGER"));
    expect(blockedAudit.status).toBe(409);
    expect(blockedAudit.body.error).toBe("FEATURE_FLAG_DISABLED");

    const blockedRetention = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/retention-policy")
      .set(h("u-mg-a", "MANAGER"));
    expect(blockedRetention.status).toBe(409);
    expect(blockedRetention.body.error).toBe("FEATURE_FLAG_DISABLED");

    await enableFlags(app, ["external_audit_exports", "data_retention_policies", "scale_reads"]);

    const auditJson = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/audit?format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(auditJson.status).toBe(200);
    expect(Array.isArray(auditJson.body.item.rows)).toBe(true);

    const auditCsv = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/audit?format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(auditCsv.status).toBe(200);
    expect(auditCsv.headers["content-type"]).toContain("text/csv");

    const updated = await request(app)
      .patch("/api/v1/tenants/tenant-a/exports/retention-policy")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({
        auditDays: 400,
        securityEventDays: 220,
        complianceEventDays: 420,
        metricDays: 120,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.item.auditDays).toBe(400);
  });

  it("FR-P6-925: tenant SLA metrics are exposed read-only", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion"]);

    const sla = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/sla")
      .set(h("u-mg-a", "MANAGER"));
    expect(sla.status).toBe(200);
    expect(typeof sla.body.item.offlineRetrySuccessRatePct).toBe("number");
    expect(typeof sla.body.item.escalationRatePct).toBe("number");
    expect(typeof sla.body.item.auditWriteLatencyP95Ms).toBe("number");
  });

  it("FR-P6-929/FR-P6-930: outbound webhooks are idempotent and signature-verifiable", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["webhook_outbound"]);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Ops Sink",
        url: "https://example.org/webhooks/ops",
        eventTypes: ["AGGREGATION_READY"],
      });
    expect(endpoint.status).toBe(201);

    const dispatch = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "AGGREGATION_READY",
        idempotencyKey: "c658e4fb-c384-460a-98bb-1a2e40f8fe90",
        payload: { snapshotId: "snap-1" },
      });
    expect(dispatch.status).toBe(202);
    expect(dispatch.body.item.deliveries.length).toBe(1);

    const dispatchAgain = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "AGGREGATION_READY",
        idempotencyKey: "c658e4fb-c384-460a-98bb-1a2e40f8fe90",
        payload: { snapshotId: "snap-1" },
      });
    expect(dispatchAgain.status).toBe(202);
    expect(dispatchAgain.body.item.deliveries.length).toBe(1);

    const deliveries = await request(app)
      .get("/api/v1/tenants/tenant-a/webhooks/deliveries")
      .set(h("u-mg-a", "MANAGER"));
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.items.length).toBe(1);

    const verify = await request(app)
      .get(`/api/v1/tenants/tenant-a/webhooks/deliveries/${deliveries.body.items[0].deliveryId}/verify`)
      .set(h("u-mg-a", "MANAGER"));
    expect(verify.status).toBe(200);
    expect(verify.body.item.signatureValid).toBe(true);
  });

  it("FR-P6-922: background aggregation uses system-actor identity and emits job metrics", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["background_aggregation"]);

    const queued = await request(app)
      .post("/api/v1/tenants/tenant-a/aggregation/jobs")
      .set(h("u-mg-a", "MANAGER"))
      .send({ window: "24h" });
    expect(queued.status).toBe(202);
    const jobId = queued.body.item.jobId as string;
    await new Promise((resolve) => setTimeout(resolve, 60));

    const metrics = await request(app)
      .get("/api/v1/ops/metrics?metricName=job_duration_ms")
      .set(h("u-mg-a", "MANAGER"));
    expect(metrics.status).toBe(200);
    expect(metrics.body.items.some((item: any) => item.tags?.jobType === "aggregation")).toBe(true);

    const audits = await request(app)
      .get("/api/v1/audit/logs")
      .set(h("u-ao", "APPLICATION_OWNER"));
    expect(audits.status).toBe(200);
    const aggregationAudit = audits.body.items.find(
      (item: any) =>
        item.actionType === "AGGREGATION_JOB" &&
        String(item.reason).includes("AGGREGATION_SUCCEEDED") &&
        item.actorUserId === "system:background-job",
    );
    expect(aggregationAudit).toBeDefined();

    const job = await request(app)
      .get(`/api/v1/tenants/tenant-a/aggregation/jobs/${jobId}`)
      .set(h("u-mg-a", "MANAGER"));
    expect(job.status).toBe(200);
  });

  it("FR-P6-923/FR-P6-924: retention purge job removes expired non-audit records with system actor", async () => {
    const store = createStore();
    const app = createApp(store);
    await enableFlags(app, ["data_retention_policies"]);

    store.addSecurityEvent({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      actorUserId: "u-mg-a",
      roleAtTime: "MANAGER",
      endpoint: "/seed",
      action: "SYSTEM",
      category: "AUDIT",
      severity: "WARN",
      mode: "ALLOW",
      message: "old event",
      factors: [],
      source: "SYSTEM",
    });
    const oldSecurity = (store as any).securityEventRecords[0];
    (store as any).securityEventRecords[0] = {
      ...oldSecurity,
      createdAt: "2020-01-01T00:00:00.000Z",
    };
    store.setRetentionPolicy({
      tenantId: "tenant-a",
      auditDays: 365,
      securityEventDays: 30,
      complianceEventDays: 30,
      metricDays: 30,
      updatedBy: "u-to-a",
    });

    const job = new RetentionPurgeJobService(store);
    const result = job.runOnce().find((item) => item.tenantId === "tenant-a");
    expect(result).toBeDefined();
    expect(result?.securityEventPurged).toBeGreaterThanOrEqual(1);

    const audits = await request(app)
      .get("/api/v1/audit/logs")
      .set(h("u-ao", "APPLICATION_OWNER"));
    expect(audits.status).toBe(200);
    expect(
      audits.body.items.some(
        (item: any) =>
          item.actionType === "RETENTION_PURGE_JOB" &&
          item.actorUserId === "system:background-job",
      ),
    ).toBe(true);
  });

  it("FR-P6-921/FR-P6-923: pagination is enforced on analytics and exports collection endpoints", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion", "scale_reads", "external_audit_exports"]);

    const analyticsBad = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=7&pageSize=999")
      .set(h("u-mg-a", "MANAGER"));
    expect(analyticsBad.status).toBe(400);

    const analyticsOk = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=7&page=1&pageSize=2")
      .set(h("u-mg-a", "MANAGER"));
    expect(analyticsOk.status).toBe(200);
    expect(analyticsOk.body.item.pagination.pageSize).toBe(2);

    const exportBad = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/audit?format=json&pageSize=999")
      .set(h("u-mg-a", "MANAGER"));
    expect(exportBad.status).toBe(400);

    const exportOk = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/audit?format=json&page=1&pageSize=1")
      .set(h("u-mg-a", "MANAGER"));
    expect(exportOk.status).toBe(200);
    expect(exportOk.body.item.pagination.pageSize).toBe(1);
  });

  it("FR-P6-929/FR-P6-930: webhook dispatch enforces rate limit and circuit breaker", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["webhook_outbound"]);

    const endpoint = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/endpoints")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        name: "Fail Sink",
        url: "https://fail.example.org/webhooks/rate-limit",
        eventTypes: ["WEBHOOK_HARDENING"],
      });
    expect(endpoint.status).toBe(201);

    for (let i = 0; i < 3; i += 1) {
      const failed = await request(app)
        .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
        .set(h("u-mg-a", "MANAGER"))
        .send({
          eventType: "WEBHOOK_HARDENING",
          idempotencyKey: `9b46d9b7-7e2e-4f32-8b59-2ea432d1364${i}`,
          payload: { n: i },
          simulateFailure: true,
        });
      expect(failed.status).toBe(202);
    }

    const breaker = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        eventType: "WEBHOOK_HARDENING",
        idempotencyKey: "9f379fda-cbb2-4e44-a942-67b08875bc30",
        payload: { n: 99 },
      });
    expect([429, 503]).toContain(breaker.status);
    expect(["WEBHOOK_CIRCUIT_OPEN", "WEBHOOK_RATE_LIMITED"]).toContain(breaker.body.error);
  });
});
