import type { RequestContext } from "../../types";
import { SYSTEM_JOB_ACTOR } from "../../config/coreContracts";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";

interface EnqueueAggregationInput {
  window?: "24h" | "7d" | "30d";
  simulateTimeout?: boolean;
}

export class AggregationJobService {
  constructor(private readonly store: MemoryStore) {}

  private emitJobMetrics(
    tenantId: string,
    branchId: string,
    input: {
      durationMs: number;
      retries: number;
      failures: number;
      status: "SUCCEEDED" | "TIMEOUT" | "FAILED";
      jobId: string;
    },
  ) {
    this.store.addStructuredMetric({
      metricName: "aggregation_job_duration_ms",
      metricUnit: "ms",
      metricValue: input.durationMs,
      tenantId,
      branchId,
      tags: {
        jobId: input.jobId,
        status: input.status,
      },
      source: "SYSTEM",
    });
    this.store.addStructuredMetric({
      metricName: "job_duration_ms",
      metricUnit: "ms",
      metricValue: input.durationMs,
      tenantId,
      branchId,
      tags: {
        jobType: "aggregation",
        status: input.status,
      },
      source: "SYSTEM",
    });
    this.store.addStructuredMetric({
      metricName: "job_retry_count",
      metricUnit: "count",
      metricValue: input.retries,
      tenantId,
      branchId,
      tags: {
        jobType: "aggregation",
        status: input.status,
      },
      source: "SYSTEM",
    });
    this.store.addStructuredMetric({
      metricName: "job_failure_count",
      metricUnit: "count",
      metricValue: input.failures,
      tenantId,
      branchId,
      tags: {
        jobType: "aggregation",
        status: input.status,
      },
      source: "SYSTEM",
    });
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "background_aggregation")) {
      return;
    }
    throw new ServiceError(
      "FEATURE_FLAG_DISABLED",
      "Background aggregation is disabled for this tenant",
      409,
    );
  }

  private computeSnapshot(tenantId: string, branchId: string, window: "24h" | "7d" | "30d", generatedBy: string) {
    const products = this.store.products.filter((item) => item.tenantId === tenantId);
    const sales = this.store.sales.filter((item) => item.tenantId === tenantId && item.branchId === branchId);
    const pendingQueue = this.store.queue.filter(
      (item) => item.tenantId === tenantId && item.branchId === branchId && item.state === "PENDING",
    ).length;
    const lowStockCount = products.filter((product) => {
      const onHand = this.store.getStock(tenantId, branchId, product.productId);
      return onHand <= product.stockAlert;
    }).length;

    return this.store.addAggregationSnapshot({
      tenantId,
      branchId,
      window,
      mode: "BACKGROUND",
      totals: {
        salesCount: sales.length,
        netSales: Number(sales.reduce((acc, item) => acc + item.netTotal, 0).toFixed(2)),
        pendingQueue,
        lowStockCount,
      },
      generatedBy,
    });
  }

  private executeJob(jobId: string, simulateTimeout: boolean): void {
    const job = this.store.aggregationJobs.find((item) => item.jobId === jobId);
    if (!job) {
      return;
    }
    const startedAtMs = Date.now();
    this.store.updateAggregationJob(job.jobId, {
      status: "RUNNING",
      startedAt: this.store.nowIso(),
    });

    if (simulateTimeout) {
      this.store.updateAggregationJob(job.jobId, {
        status: "TIMEOUT",
        completedAt: this.store.nowIso(),
        durationMs: Date.now() - startedAtMs,
        errorCode: "AGGREGATION_TIMEOUT",
        errorMessage: "Aggregation worker timeout simulation",
      });
      this.emitJobMetrics(job.tenantId, job.branchId, {
        durationMs: Date.now() - startedAtMs,
        retries: 0,
        failures: 1,
        status: "TIMEOUT",
        jobId: job.jobId,
      });
      this.store.addAudit({
        tenantId: job.tenantId,
        branchId: job.branchId,
        actorUserId: SYSTEM_JOB_ACTOR.userId,
        roleAtTime: SYSTEM_JOB_ACTOR.role,
        endpoint: "/api/v1/tenants/:tenantId/aggregation/jobs",
        method: "SYSTEM",
        decision: "DENY",
        reason: "AGGREGATION_TIMEOUT",
        actionType: "AGGREGATION_JOB",
      });
      return;
    }

    try {
      const snapshot = this.computeSnapshot(job.tenantId, job.branchId, "24h", SYSTEM_JOB_ACTOR.userId);
      const durationMs = Date.now() - startedAtMs;
      this.store.updateAggregationJob(job.jobId, {
        status: "SUCCEEDED",
        completedAt: this.store.nowIso(),
        durationMs,
        resultSnapshotId: snapshot.snapshotId,
      });
      this.emitJobMetrics(job.tenantId, job.branchId, {
        durationMs,
        retries: 0,
        failures: 0,
        status: "SUCCEEDED",
        jobId: job.jobId,
      });
      this.store.addAudit({
        tenantId: job.tenantId,
        branchId: job.branchId,
        actorUserId: SYSTEM_JOB_ACTOR.userId,
        roleAtTime: SYSTEM_JOB_ACTOR.role,
        endpoint: "/api/v1/tenants/:tenantId/aggregation/jobs",
        method: "SYSTEM",
        decision: "ALLOW",
        reason: `AGGREGATION_SUCCEEDED:${snapshot.snapshotId}`,
        actionType: "AGGREGATION_JOB",
      });
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      this.store.updateAggregationJob(job.jobId, {
        status: "FAILED",
        completedAt: this.store.nowIso(),
        durationMs,
        errorCode: "AGGREGATION_FAILED",
        errorMessage: error instanceof Error ? error.message : "unknown_error",
      });
      this.emitJobMetrics(job.tenantId, job.branchId, {
        durationMs,
        retries: 0,
        failures: 1,
        status: "FAILED",
        jobId: job.jobId,
      });
      this.store.addAudit({
        tenantId: job.tenantId,
        branchId: job.branchId,
        actorUserId: SYSTEM_JOB_ACTOR.userId,
        roleAtTime: SYSTEM_JOB_ACTOR.role,
        endpoint: "/api/v1/tenants/:tenantId/aggregation/jobs",
        method: "SYSTEM",
        decision: "DENY",
        reason: `AGGREGATION_FAILED:${job.jobId}`,
        actionType: "AGGREGATION_JOB",
      });
    }
  }

  enqueue(ctx: RequestContext, tenantId: string, input: EnqueueAggregationInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);

    const branchId = ctx.branchId;
    const job = this.store.addAggregationJob({
      tenantId,
      branchId,
      type: "TENANT_ROLLUP",
      status: "QUEUED",
      requestedBy: ctx.userId,
    });

    setTimeout(() => {
      this.executeJob(job.jobId, Boolean(input.simulateTimeout));
    }, 0);

    return {
      ...job,
      window: input.window ?? "24h",
    };
  }

  listJobs(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.aggregationJobs
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  }

  getJob(ctx: RequestContext, tenantId: string, jobId: string) {
    this.assertTenantScope(ctx, tenantId);
    const job = this.store.aggregationJobs.find((item) => item.tenantId === tenantId && item.jobId === jobId);
    if (!job) {
      throw new ServiceError("AGGREGATION_JOB_NOT_FOUND", "Aggregation job not found", 404);
    }
    return job;
  }

  listSnapshots(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.aggregationSnapshots
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
  }
}
