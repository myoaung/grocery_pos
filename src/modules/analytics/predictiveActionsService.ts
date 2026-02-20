import type {
  PredictiveActionDataset,
  PredictiveActionRecord,
  PredictiveActionSeverity,
  PredictiveActionStatus,
  RequestContext,
} from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";
import { PredictiveService } from "./predictiveService";

interface SuggestInput {
  horizonDays: number;
  metric: "net_sales" | "receipts" | "queue_pending";
  historyDays: number;
  forecastDays: number;
  branchId?: string;
}

interface ListInput extends SuggestInput {
  severity?: PredictiveActionSeverity;
  status?: PredictiveActionStatus;
  dataset?: PredictiveActionDataset;
  page: number;
  pageSize: number;
  refresh: boolean;
}

interface ActInput {
  decision: "ACKNOWLEDGE" | "EXECUTE" | "DISMISS";
  note?: string;
}

const ACTIVE_STATUSES: PredictiveActionStatus[] = ["OPEN", "ACKNOWLEDGED"];

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

export class PredictiveActionsService {
  private readonly predictive: PredictiveService;

  constructor(private readonly store: MemoryStore) {
    this.predictive = new PredictiveService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "phase8_predictive_actions")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Phase 8 predictive actions are disabled for this tenant", 409);
  }

  private assertWriteRole(ctx: RequestContext): void {
    if (!["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Predictive actions require manager or owner role", 403);
    }
  }

  private assertBranchScope(ctx: RequestContext, branchId?: string): string {
    if (!branchId) {
      return ctx.branchId;
    }
    if (ctx.role !== "APPLICATION_OWNER" && branchId !== ctx.branchId) {
      throw new ServiceError("FORBIDDEN_BRANCH_SCOPE", "Branch scope mismatch", 403);
    }
    return branchId;
  }

  private upsertDerivedAction(
    ctx: RequestContext,
    tenantId: string,
    branchId: string,
    input: Omit<PredictiveActionRecord, "actionId" | "createdAt" | "updatedAt" | "tenantId" | "branchId">,
  ): PredictiveActionRecord {
    const existing = this.store.predictiveActions.find(
      (item) =>
        item.tenantId === tenantId &&
        item.branchId === branchId &&
        item.sourceRef === input.sourceRef &&
        ACTIVE_STATUSES.includes(item.status),
    );

    const record = this.store.upsertPredictiveAction({
      actionId: existing?.actionId,
      tenantId,
      branchId,
      dataset: input.dataset,
      metric: input.metric,
      severity: input.severity,
      title: input.title,
      description: input.description,
      recommendation: input.recommendation,
      sourceRef: input.sourceRef,
      status: existing?.status ?? "OPEN",
      acknowledgedBy: existing?.acknowledgedBy,
      acknowledgedAt: existing?.acknowledgedAt,
      executedBy: existing?.executedBy,
      executedAt: existing?.executedAt,
    });

    if (!existing) {
      this.store.addAudit({
        tenantId,
        branchId,
        actorUserId: ctx.userId,
        roleAtTime: ctx.role,
        endpoint: "/api/v1/tenants/:tenantId/predictive/actions",
        method: "GET",
        decision: "ALLOW",
        reason: `PREDICTIVE_ACTION_CREATED:${record.sourceRef}`,
        actionType: "PREDICTIVE_ACTION",
      });
    }

    return record;
  }

  private deriveActions(
    ctx: RequestContext,
    tenantId: string,
    branchId: string,
    input: SuggestInput,
  ): PredictiveActionRecord[] {
    const generated: PredictiveActionRecord[] = [];

    const sla = this.predictive.slaForecast(ctx, tenantId, {
      horizonDays: input.horizonDays,
    });
    if (sla.item.riskLevel !== "INFO") {
      const slaSeverity: PredictiveActionSeverity =
        sla.item.riskLevel === "CRITICAL" ? "CRITICAL" : sla.item.riskLevel === "WARN" ? "WARN" : "INFO";
      const reasonToken = sla.item.riskReasons.join("|") || "SLA_RISK";
      generated.push(
        this.upsertDerivedAction(ctx, tenantId, branchId, {
          dataset: "SLA",
          metric: "sla_risk",
          severity: slaSeverity,
          title: "SLA Risk Escalation",
          description: `Forecast risk ${sla.item.riskLevel} in +${input.horizonDays} days.`,
          recommendation:
            sla.item.riskLevel === "CRITICAL"
              ? "Execute queue sync and escalation review immediately."
              : "Review risk factors and schedule remediation.",
          sourceRef: `P8:SLA:${reasonToken}:${input.horizonDays}`,
          status: "OPEN",
        }),
      );
    }

    const trend = this.predictive.trendForecast(ctx, tenantId, {
      metric: input.metric,
      historyDays: input.historyDays,
      forecastDays: input.forecastDays,
      branchId: input.branchId,
    });
    const forecastRows = trend.item.rows.filter((row: any) => row.periodType === "FORECAST");
    const maxForecast = forecastRows.reduce((acc: number, row: any) => Math.max(acc, Number(row.value) || 0), 0);
    const slopePerDay = Number(trend.item.slopePerDay ?? 0);
    const needsTrendAction =
      (input.metric === "queue_pending" && maxForecast > 0) ||
      (input.metric === "net_sales" && slopePerDay < 0) ||
      (input.metric === "receipts" && slopePerDay < 0);

    if (needsTrendAction) {
      const severity: PredictiveActionSeverity =
        input.metric === "queue_pending"
          ? maxForecast >= 5
            ? "CRITICAL"
            : "WARN"
          : slopePerDay < -2
            ? "CRITICAL"
            : "WARN";
      generated.push(
        this.upsertDerivedAction(ctx, tenantId, branchId, {
          dataset: "TREND",
          metric: input.metric,
          severity,
          title: "Trend Degradation Advisory",
          description: `Metric ${input.metric} slope=${slopePerDay} with forecast peak=${maxForecast}.`,
          recommendation:
            input.metric === "queue_pending"
              ? "Clear pending queue and verify retry pipeline."
              : "Adjust staffing, promotions, or replenishment plan for projected decline.",
          sourceRef: `P8:TREND:${input.metric}:${slopePerDay}:${maxForecast}`,
          status: "OPEN",
        }),
      );
    }

    return generated;
  }

  list(ctx: RequestContext, tenantId: string, input: ListInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    const branchId = this.assertBranchScope(ctx, input.branchId);

    if (input.refresh) {
      this.deriveActions(ctx, tenantId, branchId, input);
    }

    const scoped = this.store.predictiveActions
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => (ctx.role === "APPLICATION_OWNER" ? true : item.branchId === branchId))
      .filter((item) => (input.severity ? item.severity === input.severity : true))
      .filter((item) => (input.status ? item.status === input.status : true))
      .filter((item) => (input.dataset ? item.dataset === input.dataset : true))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    const page = paginate(scoped, input.page, input.pageSize);
    return {
      tenantId,
      branchId,
      generatedAt: this.store.nowIso(),
      items: page.rows,
      pagination: page.pagination,
      summary: {
        open: scoped.filter((item) => item.status === "OPEN").length,
        acknowledged: scoped.filter((item) => item.status === "ACKNOWLEDGED").length,
        executed: scoped.filter((item) => item.status === "EXECUTED").length,
        dismissed: scoped.filter((item) => item.status === "DISMISSED").length,
      },
    };
  }

  act(ctx: RequestContext, tenantId: string, actionId: string, input: ActInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertWriteRole(ctx);
    const existing = this.store.predictiveActions.find(
      (item) =>
        item.tenantId === tenantId &&
        item.actionId === actionId &&
        (ctx.role === "APPLICATION_OWNER" ? true : item.branchId === ctx.branchId),
    );
    if (!existing) {
      throw new ServiceError("PREDICTIVE_ACTION_NOT_FOUND", "Predictive action not found", 404);
    }

    const now = this.store.nowIso();
    const nextStatus: PredictiveActionStatus =
      input.decision === "ACKNOWLEDGE"
        ? "ACKNOWLEDGED"
        : input.decision === "EXECUTE"
          ? "EXECUTED"
          : "DISMISSED";

    const updated = this.store.upsertPredictiveAction({
      ...existing,
      actionId: existing.actionId,
      status: nextStatus,
      acknowledgedBy: input.decision === "ACKNOWLEDGE" ? ctx.userId : existing.acknowledgedBy,
      acknowledgedAt: input.decision === "ACKNOWLEDGE" ? now : existing.acknowledgedAt,
      executedBy: input.decision === "EXECUTE" ? ctx.userId : existing.executedBy,
      executedAt: input.decision === "EXECUTE" ? now : existing.executedAt,
    });

    this.store.addStructuredMetric({
      metricName: "predictive_action_status_count",
      metricUnit: "count",
      metricValue: 1,
      tenantId,
      branchId: updated.branchId,
      tags: {
        status: updated.status,
        dataset: updated.dataset,
      },
      source: "SERVICE",
    });

    this.store.addAudit({
      tenantId,
      branchId: updated.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/predictive/actions/:actionId/act",
      method: "POST",
      decision: "ALLOW",
      reason: `PREDICTIVE_ACTION_${input.decision}:${updated.actionId}:${input.note ?? "NONE"}`,
      actionType: "PREDICTIVE_ACTION_CONTROL",
    });

    return updated;
  }
}
