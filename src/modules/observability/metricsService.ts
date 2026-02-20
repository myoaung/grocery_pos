import { PERFORMANCE_BUDGET } from "../../config/performanceBudget";
import type { RequestContext, StructuredMetricLog } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ScaleGuardService } from "../../services/scaleGuardService";
import { ServiceError } from "../../utils/errors";

interface JobsQueryInput {
  page: number;
  pageSize: number;
  jobType?: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function p95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return round2(sorted[index]);
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return round2(values.reduce((acc, item) => acc + item, 0) / values.length);
}

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    pagination: {
      page: clampedPage,
      pageSize,
      totalRows,
      totalPages,
      limitMax: 200,
    },
  };
}

export class MetricsService {
  private readonly scale: ScaleGuardService;

  constructor(private readonly store: MemoryStore) {
    this.scale = new ScaleGuardService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertObservabilityEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "phase7_observability")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Phase 7 observability is disabled for this tenant", 409);
  }

  private assertScaleGuardEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "phase7_scale_guard") || this.store.getFeatureFlag(tenantId, "scale_reads")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Phase 7 scale guard is disabled for this tenant", 409);
  }

  private scopedMetrics(ctx: RequestContext, tenantId: string): ReadonlyArray<Readonly<StructuredMetricLog>> {
    return this.store.structuredMetrics.filter((item) => {
      if (item.tenantId !== tenantId) {
        return false;
      }
      if (ctx.role === "APPLICATION_OWNER") {
        return true;
      }
      return item.branchId === ctx.branchId || item.branchId === "system";
    });
  }

  private recentMetrics(metrics: ReadonlyArray<Readonly<StructuredMetricLog>>, windowMs: number) {
    const cutoff = Date.now() - windowMs;
    return metrics.filter((item) => Date.parse(item.createdAt) >= cutoff);
  }

  private buildSlaSnapshot(metrics: ReadonlyArray<Readonly<StructuredMetricLog>>) {
    const retryValues = metrics
      .filter((item) => item.metricName === PERFORMANCE_BUDGET.observability.slis.offlineRetrySuccessRatePct.metricName)
      .map((item) => item.metricValue);
    const escalationValues = metrics
      .filter((item) => item.metricName === PERFORMANCE_BUDGET.observability.slis.offlineEscalationRatePct.metricName)
      .map((item) => item.metricValue);
    const auditLatencyValues = metrics
      .filter((item) => item.metricName === PERFORMANCE_BUDGET.observability.slis.auditWriteLatencyMs.metricName)
      .map((item) => item.metricValue);

    return {
      offlineRetrySuccessRatePct: avg(retryValues),
      offlineEscalationRatePct: avg(escalationValues),
      auditWriteLatencyP95Ms: p95(auditLatencyValues),
      targets: {
        offlineRetrySuccessRatePct: PERFORMANCE_BUDGET.observability.slis.offlineRetrySuccessRatePct.targetPct,
        offlineEscalationRatePctMax: PERFORMANCE_BUDGET.observability.slis.offlineEscalationRatePct.targetMaxPct,
        auditWriteLatencyP95MsMax: PERFORMANCE_BUDGET.observability.slis.auditWriteLatencyMs.p95TargetMs,
      },
    };
  }

  private buildAlerts(sla: {
    offlineRetrySuccessRatePct: number;
    offlineEscalationRatePct: number;
    auditWriteLatencyP95Ms: number;
    targets: {
      offlineRetrySuccessRatePct: number;
      offlineEscalationRatePctMax: number;
      auditWriteLatencyP95MsMax: number;
    };
  }) {
    const alerts: Array<{
      alertCode: string;
      severity: "INFO" | "WARN" | "CRITICAL";
      metricName: string;
      observed: number;
      threshold: number;
      message: string;
    }> = [];

    if (sla.offlineRetrySuccessRatePct < sla.targets.offlineRetrySuccessRatePct) {
      alerts.push({
        alertCode: "OPS-SLA-RETRY-LOW",
        severity: sla.offlineRetrySuccessRatePct < sla.targets.offlineRetrySuccessRatePct - 10 ? "CRITICAL" : "WARN",
        metricName: PERFORMANCE_BUDGET.observability.slis.offlineRetrySuccessRatePct.metricName,
        observed: sla.offlineRetrySuccessRatePct,
        threshold: sla.targets.offlineRetrySuccessRatePct,
        message: "Offline retry success rate is below target.",
      });
    }
    if (sla.offlineEscalationRatePct > sla.targets.offlineEscalationRatePctMax) {
      alerts.push({
        alertCode: "OPS-SLA-ESCALATION-HIGH",
        severity: sla.offlineEscalationRatePct > sla.targets.offlineEscalationRatePctMax * 2 ? "CRITICAL" : "WARN",
        metricName: PERFORMANCE_BUDGET.observability.slis.offlineEscalationRatePct.metricName,
        observed: sla.offlineEscalationRatePct,
        threshold: sla.targets.offlineEscalationRatePctMax,
        message: "Offline escalation rate exceeds target max.",
      });
    }
    if (sla.auditWriteLatencyP95Ms > sla.targets.auditWriteLatencyP95MsMax) {
      alerts.push({
        alertCode: "OPS-SLA-AUDIT-LATENCY",
        severity: sla.auditWriteLatencyP95Ms > sla.targets.auditWriteLatencyP95MsMax * 2 ? "CRITICAL" : "WARN",
        metricName: PERFORMANCE_BUDGET.observability.slis.auditWriteLatencyMs.metricName,
        observed: sla.auditWriteLatencyP95Ms,
        threshold: sla.targets.auditWriteLatencyP95MsMax,
        message: "Audit write latency p95 exceeds target.",
      });
    }
    if (alerts.length === 0) {
      alerts.push({
        alertCode: "OPS-SLA-HEALTHY",
        severity: "INFO",
        metricName: "system",
        observed: 0,
        threshold: 0,
        message: "All SLA indicators are within target.",
      });
    }
    return alerts;
  }

  sla(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertObservabilityEnabled(tenantId);
    const metrics = this.recentMetrics(this.scopedMetrics(ctx, tenantId), 24 * 60 * 60 * 1000);
    const snapshot = this.buildSlaSnapshot(metrics);
    return {
      tenantId,
      branchId: ctx.branchId,
      generatedAt: this.store.nowIso(),
      ...snapshot,
      alerts: this.buildAlerts(snapshot),
    };
  }

  alerts(ctx: RequestContext, tenantId: string) {
    const snapshot = this.sla(ctx, tenantId);
    return {
      tenantId,
      branchId: ctx.branchId,
      generatedAt: snapshot.generatedAt,
      items: snapshot.alerts,
    };
  }

  jobs(ctx: RequestContext, tenantId: string, input: JobsQueryInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertObservabilityEnabled(tenantId);
    const metrics = this.scopedMetrics(ctx, tenantId)
      .filter((item) => ["job_duration_ms", "job_retry_count", "job_failure_count"].includes(item.metricName))
      .filter((item) => (input.jobType ? item.tags.jobType === input.jobType : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((item) => ({
        metricId: item.metricId,
        metricName: item.metricName,
        metricUnit: item.metricUnit,
        metricValue: item.metricValue,
        jobType: item.tags.jobType ?? "unknown",
        status: item.tags.status ?? "unknown",
        branchId: item.branchId,
        createdAt: item.createdAt,
      }));
    const paged = paginate(metrics, input.page, input.pageSize);
    return {
      tenantId,
      generatedAt: this.store.nowIso(),
      items: paged.rows,
      pagination: paged.pagination,
    };
  }

  overview(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertObservabilityEnabled(tenantId);
    const scoped = this.scopedMetrics(ctx, tenantId);
    const recentHour = this.recentMetrics(scoped, 60 * 60 * 1000);
    const sla = this.sla(ctx, tenantId);
    const cache = this.scale.cacheStats(tenantId, ctx.role === "APPLICATION_OWNER" ? undefined : ctx.branchId);
    const aggregationQueued = this.store.aggregationJobs.filter(
      (item) => item.tenantId === tenantId && item.status === "QUEUED",
    ).length;
    const aggregationRunning = this.store.aggregationJobs.filter(
      (item) => item.tenantId === tenantId && item.status === "RUNNING",
    ).length;
    const webhookRetrying = this.store.webhookDeliveries.filter(
      (item) => item.tenantId === tenantId && item.status === "RETRYING",
    ).length;

    return {
      tenantId,
      branchId: ctx.branchId,
      generatedAt: this.store.nowIso(),
      cards: {
        metricsLastHour: recentHour.length,
        aggregationQueued,
        aggregationRunning,
        webhookRetrying,
        cacheEntries: cache.entries,
      },
      sla,
      alerts: sla.alerts,
      cache,
    };
  }

  dashboard(ctx: RequestContext, tenantId: string) {
    const cacheKey = `phase7:observability:${tenantId}:${ctx.branchId}`;
    this.assertTenantScope(ctx, tenantId);
    this.assertObservabilityEnabled(tenantId);
    this.assertScaleGuardEnabled(tenantId);
    const read = this.scale.readWithTenantHint({
      tenantId,
      branchId: ctx.branchId,
      cacheKey,
      ttlMs: 5000,
      preferReplica: true,
      hint: "OBSERVABILITY",
      load: () => this.overview(ctx, tenantId),
    });
    return {
      ...read.value,
      readSource: read.readSource,
      cacheHit: read.cacheHit,
    };
  }

  scaleStats(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertScaleGuardEnabled(tenantId);
    return {
      tenantId,
      branchId: ctx.branchId,
      generatedAt: this.store.nowIso(),
      ...this.scale.cacheStats(tenantId, ctx.role === "APPLICATION_OWNER" ? undefined : ctx.branchId),
    };
  }

  evictScale(ctx: RequestContext, tenantId: string, prefix: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertScaleGuardEnabled(tenantId);
    const removed = this.scale.evictByPrefix(tenantId, prefix);
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/scale-guard/cache",
      method: "DELETE",
      decision: "ALLOW",
      reason: `SCALE_GUARD_CACHE_EVICT:${prefix}:${removed}`,
      actionType: "SCALE_GUARD_CACHE_EVICT",
    });
    return {
      tenantId,
      removed,
      prefix,
    };
  }
}
