import { PERFORMANCE_BUDGET } from "../../config/performanceBudget";
import type { RequestContext, StructuredMetricLog } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ScaleGuardService } from "../../services/scaleGuardService";
import { ServiceError } from "../../utils/errors";

interface TrendForecastInput {
  metric: "net_sales" | "receipts" | "queue_pending";
  historyDays: number;
  forecastDays: number;
  branchId?: string;
}

interface SlaForecastInput {
  horizonDays: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDayToken(daysAgo: number): string {
  const time = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(time).toISOString().slice(0, 10);
}

function slope(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  return (values[values.length - 1] - values[0]) / (values.length - 1);
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, item) => acc + item, 0) / values.length;
}

export class PredictiveService {
  private readonly scale: ScaleGuardService;

  constructor(private readonly store: MemoryStore) {
    this.scale = new ScaleGuardService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertPredictiveEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "phase7_predictive")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Phase 7 predictive analytics is disabled for this tenant", 409);
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

  private trendHistoryRows(tenantId: string, input: TrendForecastInput) {
    const buckets = new Map<string, number>();
    for (let dayOffset = input.historyDays - 1; dayOffset >= 0; dayOffset -= 1) {
      buckets.set(isoDayToken(dayOffset), 0);
    }

    if (input.metric === "queue_pending") {
      const pending = this.store.queue.filter(
        (item) =>
          item.tenantId === tenantId &&
          item.state === "PENDING" &&
          (input.branchId ? item.branchId === input.branchId : true),
      ).length;
      buckets.set(isoDayToken(0), pending);
    } else {
      for (const sale of this.store.sales) {
        if (sale.tenantId !== tenantId) {
          continue;
        }
        if (input.branchId && sale.branchId !== input.branchId) {
          continue;
        }
        const token = sale.createdAt.slice(0, 10);
        if (!buckets.has(token)) {
          continue;
        }
        const prev = buckets.get(token) ?? 0;
        if (input.metric === "net_sales") {
          buckets.set(token, round2(prev + sale.netTotal));
        } else {
          buckets.set(token, prev + 1);
        }
      }
    }

    return Array.from(buckets.entries()).map(([bucket, value]) => ({
      bucket,
      value,
      periodType: "HISTORY" as const,
    }));
  }

  trendForecast(ctx: RequestContext, tenantId: string, input: TrendForecastInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertPredictiveEnabled(tenantId);
    this.assertBranchForTenant(tenantId, input.branchId);
    const cacheKey = `phase7:predictive:trend:${tenantId}:${ctx.branchId}:${input.metric}:${input.historyDays}:${input.forecastDays}:${input.branchId ?? "all"}`;
    const read = this.scale.readWithTenantHint({
      tenantId,
      branchId: ctx.branchId,
      cacheKey,
      ttlMs: 8000,
      preferReplica: true,
      hint: "PREDICTIVE",
      load: () => {
        const history = this.trendHistoryRows(tenantId, input);
        const values = history.map((item) => item.value);
        const trendSlope = slope(values);
        const base = values.length > 0 ? values[values.length - 1] : 0;
        const forecast = Array.from({ length: input.forecastDays }).map((_, index) => ({
          bucket: isoDayToken(-(index + 1)),
          value: round2(Math.max(0, base + trendSlope * (index + 1))),
          periodType: "FORECAST" as const,
        }));
        const confidencePct = round2(
          Math.max(45, Math.min(99, 100 - Math.abs(trendSlope) / Math.max(1, Math.abs(avg(values))) * 40)),
        );
        return {
          metric: input.metric,
          historyDays: input.historyDays,
          forecastDays: input.forecastDays,
          branchId: input.branchId ?? null,
          slopePerDay: round2(trendSlope),
          confidencePct,
          rows: [...history, ...forecast],
        };
      },
    });

    return {
      tenantId,
      generatedAt: this.store.nowIso(),
      readSource: read.readSource,
      cacheHit: read.cacheHit,
      item: read.value,
    };
  }

  private metricSeries(
    metrics: ReadonlyArray<Readonly<StructuredMetricLog>>,
    metricName: string,
    limit = 20,
  ): number[] {
    return metrics
      .filter((item) => item.metricName === metricName)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(-limit)
      .map((item) => item.metricValue);
  }

  slaForecast(ctx: RequestContext, tenantId: string, input: SlaForecastInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertPredictiveEnabled(tenantId);
    const cacheKey = `phase7:predictive:sla:${tenantId}:${ctx.branchId}:${input.horizonDays}`;
    const read = this.scale.readWithTenantHint({
      tenantId,
      branchId: ctx.branchId,
      cacheKey,
      ttlMs: 8000,
      preferReplica: true,
      hint: "PREDICTIVE",
      load: () => {
        const scoped = this.store.structuredMetrics.filter(
          (item) =>
            item.tenantId === tenantId &&
            (ctx.role === "APPLICATION_OWNER" ? true : item.branchId === ctx.branchId || item.branchId === "system"),
        );

        const retrySeries = this.metricSeries(
          scoped,
          PERFORMANCE_BUDGET.observability.slis.offlineRetrySuccessRatePct.metricName,
        );
        const escalationSeries = this.metricSeries(
          scoped,
          PERFORMANCE_BUDGET.observability.slis.offlineEscalationRatePct.metricName,
        );
        const auditLatencySeries = this.metricSeries(
          scoped,
          PERFORMANCE_BUDGET.observability.slis.auditWriteLatencyMs.metricName,
        );

        const retryLast = retrySeries.length > 0 ? retrySeries[retrySeries.length - 1] : 100;
        const escalationLast = escalationSeries.length > 0 ? escalationSeries[escalationSeries.length - 1] : 0;
        const auditLast = auditLatencySeries.length > 0 ? auditLatencySeries[auditLatencySeries.length - 1] : 0;

        const predictedRetry = round2(Math.max(0, Math.min(100, retryLast + slope(retrySeries) * input.horizonDays)));
        const predictedEscalation = round2(Math.max(0, escalationLast + slope(escalationSeries) * input.horizonDays));
        const predictedAuditLatency = round2(Math.max(0, auditLast + slope(auditLatencySeries) * input.horizonDays));

        const retryTarget = PERFORMANCE_BUDGET.observability.slis.offlineRetrySuccessRatePct.targetPct;
        const escalationTarget = PERFORMANCE_BUDGET.observability.slis.offlineEscalationRatePct.targetMaxPct;
        const auditTarget = PERFORMANCE_BUDGET.observability.slis.auditWriteLatencyMs.p95TargetMs;

        const riskReasons: string[] = [];
        if (predictedRetry < retryTarget) {
          riskReasons.push("OFFLINE_RETRY_SUCCESS_BELOW_TARGET");
        }
        if (predictedEscalation > escalationTarget) {
          riskReasons.push("OFFLINE_ESCALATION_ABOVE_TARGET");
        }
        if (predictedAuditLatency > auditTarget) {
          riskReasons.push("AUDIT_LATENCY_ABOVE_TARGET");
        }

        const riskLevel =
          riskReasons.length === 0
            ? "INFO"
            : riskReasons.length > 1 ||
                predictedEscalation > escalationTarget * 1.5 ||
                predictedAuditLatency > auditTarget * 1.5 ||
                predictedRetry < retryTarget - 8
              ? "CRITICAL"
              : "WARN";

        return {
          horizonDays: input.horizonDays,
          branchId: ctx.branchId,
          predicted: {
            offlineRetrySuccessRatePct: predictedRetry,
            offlineEscalationRatePct: predictedEscalation,
            auditWriteLatencyP95Ms: predictedAuditLatency,
          },
          thresholds: {
            offlineRetrySuccessRatePctMin: retryTarget,
            offlineEscalationRatePctMax: escalationTarget,
            auditWriteLatencyP95MsMax: auditTarget,
          },
          riskLevel,
          riskReasons,
        };
      },
    });

    return {
      tenantId,
      generatedAt: this.store.nowIso(),
      readSource: read.readSource,
      cacheHit: read.cacheHit,
      item: read.value,
    };
  }

  exportRows(
    ctx: RequestContext,
    tenantId: string,
    input:
      | ({ dataset: "trend" } & TrendForecastInput)
      | ({ dataset: "sla" } & SlaForecastInput),
  ): Array<Record<string, string | number | null>> {
    if (input.dataset === "trend") {
      const trend = this.trendForecast(ctx, tenantId, input);
      return trend.item.rows.map((row) => ({
        tenant_id: tenantId,
        branch_id: trend.item.branchId,
        dataset: "trend",
        metric: trend.item.metric,
        bucket: row.bucket,
        period_type: row.periodType,
        value: row.value,
        slope_per_day: trend.item.slopePerDay,
        confidence_pct: trend.item.confidencePct,
      }));
    }
    const sla = this.slaForecast(ctx, tenantId, input);
    return [
      {
        tenant_id: tenantId,
        branch_id: sla.item.branchId,
        dataset: "sla",
        metric: "offline_retry_success_rate_pct",
        bucket: `+${sla.item.horizonDays}d`,
        period_type: "FORECAST",
        value: sla.item.predicted.offlineRetrySuccessRatePct,
        risk_level: sla.item.riskLevel,
      },
      {
        tenant_id: tenantId,
        branch_id: sla.item.branchId,
        dataset: "sla",
        metric: "offline_escalation_rate_pct",
        bucket: `+${sla.item.horizonDays}d`,
        period_type: "FORECAST",
        value: sla.item.predicted.offlineEscalationRatePct,
        risk_level: sla.item.riskLevel,
      },
      {
        tenant_id: tenantId,
        branch_id: sla.item.branchId,
        dataset: "sla",
        metric: "audit_write_latency_ms",
        bucket: `+${sla.item.horizonDays}d`,
        period_type: "FORECAST",
        value: sla.item.predicted.auditWriteLatencyP95Ms,
        risk_level: sla.item.riskLevel,
      },
    ];
  }
}
