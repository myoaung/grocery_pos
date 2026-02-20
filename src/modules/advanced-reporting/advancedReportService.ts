import type { MemoryStore } from "../../store/memoryStore";
import type { ReportId, ReportResult, RequestContext } from "../../types";
import { ServiceError } from "../../utils/errors";
import { PosService } from "../../services/posService";

type AdvancedReportId = "REP-A-001" | "REP-A-002" | "REP-A-003" | "REP-A-004";

export interface AdvancedTemplate {
  reportId: AdvancedReportId;
  title: string;
  description: string;
  filters: string[];
  exportFormats: Array<"csv" | "pdf">;
}

export interface AdvancedReportFilters {
  dateFrom?: string;
  dateTo?: string;
  compareTenantId?: string;
}

const advancedIds: AdvancedReportId[] = ["REP-A-001", "REP-A-002", "REP-A-003", "REP-A-004"];

const templates: AdvancedTemplate[] = [
  {
    reportId: "REP-A-001",
    title: "Forecasting",
    description: "Forecasts tenant net sales for next period.",
    filters: ["dateFrom", "dateTo"],
    exportFormats: ["csv", "pdf"],
  },
  {
    reportId: "REP-A-002",
    title: "Trend Analysis",
    description: "Deterministic trend output by period.",
    filters: ["dateFrom", "dateTo"],
    exportFormats: ["csv", "pdf"],
  },
  {
    reportId: "REP-A-003",
    title: "Comparative",
    description: "Branch/tenant comparison under role-scoped access rules.",
    filters: ["dateFrom", "dateTo", "compareTenantId"],
    exportFormats: ["csv", "pdf"],
  },
  {
    reportId: "REP-A-004",
    title: "Custom Advanced Metrics",
    description: "Authorized custom analytics with strict access controls.",
    filters: ["dateFrom", "dateTo"],
    exportFormats: ["csv", "pdf"],
  },
];

export class AdvancedReportService {
  private readonly posService: PosService;

  constructor(private readonly store: MemoryStore) {
    this.posService = new PosService(store);
  }

  listTemplates(ctx: RequestContext): AdvancedTemplate[] {
    if (ctx.role === "APPLICATION_OWNER") {
      return templates;
    }
    return templates.filter((template) => template.reportId !== "REP-A-003" || ctx.role !== "CASHIER");
  }

  private assertReportId(reportId: string): AdvancedReportId {
    if (!advancedIds.includes(reportId as AdvancedReportId)) {
      throw new ServiceError("REPORT_NOT_FOUND", "Unknown advanced report id", 404);
    }
    return reportId as AdvancedReportId;
  }

  private applyDateFilters(rows: Array<Record<string, unknown>>, filters: AdvancedReportFilters) {
    const hasDateFilter = Boolean(filters.dateFrom || filters.dateTo);
    if (!hasDateFilter) {
      return rows;
    }

    return rows.filter((row) => {
      const token =
        String(row.period ?? row.date_bucket ?? row.forecast_period ?? row.year_month ?? row.occurred_at ?? "").slice(0, 10);
      if (!token) {
        return true;
      }
      if (filters.dateFrom && token < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && token > filters.dateTo) {
        return false;
      }
      return true;
    });
  }

  private comparativeRows(ctx: RequestContext, compareTenantId?: string) {
    const primary = this.store.sales.filter((sale) => sale.tenantId === ctx.tenantId);
    const primaryTotal = primary.reduce((acc, sale) => acc + sale.netTotal, 0);

    if (!compareTenantId || compareTenantId === ctx.tenantId) {
      return [
        {
          tenant_id: ctx.tenantId,
          net_sales: Number(primaryTotal.toFixed(2)),
          receipt_count: primary.length,
        },
      ];
    }

    if (ctx.role !== "APPLICATION_OWNER") {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Comparative tenant scope requires application owner role", 403);
    }

    const compareSales = this.store.sales.filter((sale) => sale.tenantId === compareTenantId);
    const compareTotal = compareSales.reduce((acc, sale) => acc + sale.netTotal, 0);

    return [
      {
        tenant_id: ctx.tenantId,
        net_sales: Number(primaryTotal.toFixed(2)),
        receipt_count: primary.length,
      },
      {
        tenant_id: compareTenantId,
        net_sales: Number(compareTotal.toFixed(2)),
        receipt_count: compareSales.length,
      },
    ];
  }

  generate(ctx: RequestContext, reportIdRaw: string, filters: AdvancedReportFilters): ReportResult {
    const reportId = this.assertReportId(reportIdRaw);

    let rows: Array<Record<string, unknown>> = [];
    if (reportId === "REP-A-003") {
      rows = this.comparativeRows(ctx, filters.compareTenantId);
    } else {
      const result = this.posService.getTenantReport(ctx, reportId as ReportId);
      rows = result.rows as Array<Record<string, unknown>>;
    }

    const filteredRows = this.applyDateFilters(rows, filters);
    this.store.addAudit({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: `/api/v1/reports/advanced/${reportId}`,
      method: "GET",
      decision: "ALLOW",
      reason: "ADVANCED_REPORT_READ",
      actionType: "REPORT_ADVANCED_READ",
    });

    return {
      reportId,
      generatedAt: this.store.nowIso(),
      rows: filteredRows as Array<Record<string, string | number | boolean | null>>,
    };
  }
}
