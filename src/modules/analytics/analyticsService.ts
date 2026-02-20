import type { RequestContext } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";
import { ScaleGuardService } from "../../services/scaleGuardService";
import { AggregationJobService } from "../../jobs/aggregation/aggregationJobService";

interface TrendInput {
  metric: "net_sales" | "receipts" | "queue_pending";
  days: number;
  branchId?: string;
}

interface CompareInput {
  metric: "net_sales" | "receipts";
  from: string;
  to: string;
  branchId?: string;
}

interface DatasetInput {
  metric: "net_sales" | "receipts" | "queue_pending";
  days: number;
  branchId?: string;
}

function toDateToken(iso: string): string {
  return iso.slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDaysAgo(daysAgo: number): string {
  const time = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(time).toISOString().slice(0, 10);
}

function p95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return round2(sorted[index]);
}

export class AnalyticsService {
  private readonly scale: ScaleGuardService;
  private readonly aggregationJobs: AggregationJobService;

  constructor(private readonly store: MemoryStore) {
    this.scale = new ScaleGuardService(store);
    this.aggregationJobs = new AggregationJobService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertAnalyticsEnabled(tenantId: string): void {
    if (!this.store.getFeatureFlag(tenantId, "analytics_expansion")) {
      throw new ServiceError("FEATURE_FLAG_DISABLED", "Analytics expansion is disabled for this tenant", 409);
    }
  }

  private assertScaleEnabled(tenantId: string): void {
    if (!this.store.getFeatureFlag(tenantId, "scale_reads")) {
      throw new ServiceError("FEATURE_FLAG_DISABLED", "Scale read optimization is disabled for this tenant", 409);
    }
  }

  private assertBranchForTenant(tenantId: string, branchId?: string): void {
    if (!branchId) {
      return;
    }
    const exists = this.store.branches.some((item) => item.tenantId === tenantId && item.branchId === branchId);
    if (!exists) {
      throw new ServiceError("INVALID_BRANCH_SCOPE", "Branch is not valid for tenant", 400);
    }
  }

  private bucketedTrendRows(
    tenantId: string,
    input: TrendInput,
  ): Array<{ bucket: string; metric: string; value: number; tenant_id: string; branch_id: string | null }> {
    this.assertBranchForTenant(tenantId, input.branchId);
    const startToken = isoDaysAgo(input.days - 1);
    const buckets = new Map<string, number>();
    for (let dayOffset = input.days - 1; dayOffset >= 0; dayOffset -= 1) {
      const token = isoDaysAgo(dayOffset);
      buckets.set(token, 0);
    }

    if (input.metric === "queue_pending") {
      const pendingCount = this.store.queue.filter(
        (item) =>
          item.tenantId === tenantId &&
          item.state === "PENDING" &&
          (input.branchId ? item.branchId === input.branchId : true),
      ).length;
      const today = isoDaysAgo(0);
      if (buckets.has(today)) {
        buckets.set(today, pendingCount);
      }
    } else {
      for (const sale of this.store.sales) {
        if (sale.tenantId !== tenantId) {
          continue;
        }
        if (input.branchId && sale.branchId !== input.branchId) {
          continue;
        }
        const bucket = toDateToken(sale.createdAt);
        if (!buckets.has(bucket)) {
          continue;
        }
        if (bucket < startToken) {
          continue;
        }
        const prev = buckets.get(bucket) ?? 0;
        if (input.metric === "net_sales") {
          buckets.set(bucket, round2(prev + sale.netTotal));
        } else {
          buckets.set(bucket, prev + 1);
        }
      }
    }

    return Array.from(buckets.entries()).map(([bucket, value]) => ({
      bucket,
      metric: input.metric,
      value,
      tenant_id: tenantId,
      branch_id: input.branchId ?? null,
    }));
  }

  trends(ctx: RequestContext, tenantId: string, input: TrendInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertAnalyticsEnabled(tenantId);
    this.assertScaleEnabled(tenantId);
    const key = `analytics:trends:${tenantId}:${ctx.branchId}:${input.metric}:${input.days}:${input.branchId ?? "all"}`;
    const read = this.scale.readWithCache({
      tenantId,
      branchId: ctx.branchId,
      cacheKey: key,
      ttlMs: 5000,
      preferReplica: true,
      load: () => this.bucketedTrendRows(tenantId, input),
    });
    return {
      generatedAt: this.store.nowIso(),
      readSource: read.readSource,
      cacheHit: read.cacheHit,
      rows: read.value,
    };
  }

  comparePeriods(ctx: RequestContext, tenantId: string, input: CompareInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertAnalyticsEnabled(tenantId);
    this.assertScaleEnabled(tenantId);
    this.assertBranchForTenant(tenantId, input.branchId);
    if (input.from > input.to) {
      throw new ServiceError("INVALID_PERIOD_RANGE", "from must be before or equal to to", 400);
    }
    const key = `analytics:compare:${tenantId}:${ctx.branchId}:${input.metric}:${input.from}:${input.to}:${input.branchId ?? "all"}`;
    const read = this.scale.readWithCache({
      tenantId,
      branchId: ctx.branchId,
      cacheKey: key,
      ttlMs: 5000,
      preferReplica: true,
      load: () => {
        const currentRows = this.store.sales.filter((item) => {
          if (item.tenantId !== tenantId) {
            return false;
          }
          if (input.branchId && item.branchId !== input.branchId) {
            return false;
          }
          const token = toDateToken(item.createdAt);
          return token >= input.from && token <= input.to;
        });

        const fromMs = Date.parse(`${input.from}T00:00:00.000Z`);
        const toMs = Date.parse(`${input.to}T23:59:59.999Z`);
        const durationMs = Math.max(24 * 60 * 60 * 1000, toMs - fromMs + 1);
        const prevToMs = fromMs - 1;
        const prevFromMs = prevToMs - durationMs + 1;
        const prevFromToken = new Date(prevFromMs).toISOString().slice(0, 10);
        const prevToToken = new Date(prevToMs).toISOString().slice(0, 10);

        const previousRows = this.store.sales.filter((item) => {
          if (item.tenantId !== tenantId) {
            return false;
          }
          if (input.branchId && item.branchId !== input.branchId) {
            return false;
          }
          const token = toDateToken(item.createdAt);
          return token >= prevFromToken && token <= prevToToken;
        });

        const currentValue =
          input.metric === "net_sales"
            ? round2(currentRows.reduce((acc, item) => acc + item.netTotal, 0))
            : currentRows.length;
        const previousValue =
          input.metric === "net_sales"
            ? round2(previousRows.reduce((acc, item) => acc + item.netTotal, 0))
            : previousRows.length;
        const delta = round2(currentValue - previousValue);
        const deltaPct = previousValue === 0 ? null : round2((delta / previousValue) * 100);

        return {
          metric: input.metric,
          tenant_id: tenantId,
          branch_id: input.branchId ?? null,
          current: {
            from: input.from,
            to: input.to,
            value: currentValue,
          },
          previous: {
            from: prevFromToken,
            to: prevToToken,
            value: previousValue,
          },
          delta,
          deltaPct,
        };
      },
    });
    return {
      generatedAt: this.store.nowIso(),
      readSource: read.readSource,
      cacheHit: read.cacheHit,
      item: read.value,
    };
  }

  exportDataset(ctx: RequestContext, tenantId: string, input: DatasetInput) {
    const trend = this.trends(ctx, tenantId, {
      metric: input.metric,
      days: input.days,
      branchId: input.branchId,
    });
    return {
      generatedAt: trend.generatedAt,
      readSource: trend.readSource,
      cacheHit: trend.cacheHit,
      rows: trend.rows.map((item) => ({
        tenant_id: item.tenant_id,
        branch_id: item.branch_id,
        bucket: item.bucket,
        metric: item.metric,
        value: item.value,
      })),
    };
  }

  slaSnapshot(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertAnalyticsEnabled(tenantId);
    const now = this.store.nowIso();
    const branchId = ctx.branchId;
    const retries = this.store.structuredMetrics
      .filter((item) => item.tenantId === tenantId && item.branchId === branchId)
      .filter((item) => item.metricName === "offline_retry_success_rate_pct")
      .slice(-20)
      .map((item) => item.metricValue);
    const escalations = this.store.structuredMetrics
      .filter((item) => item.tenantId === tenantId && item.branchId === branchId)
      .filter((item) => item.metricName === "offline_escalation_rate_pct")
      .slice(-20)
      .map((item) => item.metricValue);
    const auditLatency = this.store.structuredMetrics
      .filter((item) => item.tenantId === tenantId && item.branchId === branchId)
      .filter((item) => item.metricName === "audit_write_latency_ms")
      .slice(-50)
      .map((item) => item.metricValue);

    const avg = (values: number[]) =>
      values.length === 0 ? 0 : round2(values.reduce((acc, item) => acc + item, 0) / values.length);

    return {
      tenantId,
      branchId,
      generatedAt: now,
      offlineRetrySuccessRatePct: avg(retries),
      escalationRatePct: avg(escalations),
      auditWriteLatencyP95Ms: p95(auditLatency),
    };
  }

  enqueueAggregationJob(
    ctx: RequestContext,
    tenantId: string,
    input: { window?: "24h" | "7d" | "30d"; simulateTimeout?: boolean },
  ) {
    return this.aggregationJobs.enqueue(ctx, tenantId, input);
  }

  listAggregationJobs(ctx: RequestContext, tenantId: string) {
    return this.aggregationJobs.listJobs(ctx, tenantId);
  }

  getAggregationJob(ctx: RequestContext, tenantId: string, jobId: string) {
    return this.aggregationJobs.getJob(ctx, tenantId, jobId);
  }

  listAggregationSnapshots(ctx: RequestContext, tenantId: string) {
    return this.aggregationJobs.listSnapshots(ctx, tenantId);
  }

  evictAnalyticsCache(ctx: RequestContext, tenantId: string, prefix: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertScaleEnabled(tenantId);
    return this.scale.evictByPrefix(tenantId, prefix);
  }
}

