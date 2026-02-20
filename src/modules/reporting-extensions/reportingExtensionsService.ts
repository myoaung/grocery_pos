import type { MemoryStore } from "../../store/memoryStore";
import type { ReportingTemplate, RequestContext } from "../../types";
import { ServiceError } from "../../utils/errors";

interface ReportingFilters {
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  customerId?: string;
  operation?: string;
  role?: string;
  eventType?: string;
  state?: string;
  status?: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class ReportingExtensionsService {
  constructor(private readonly store: MemoryStore) {}

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertTemplateAccess(ctx: RequestContext, tenantId: string, templateId: string): ReportingTemplate {
    this.assertTenantScope(ctx, tenantId);
    const template = this.store.reportingTemplates.find((item) => item.templateId === templateId);
    if (!template) {
      throw new ServiceError("REPORT_TEMPLATE_NOT_FOUND", "Unknown reporting extension template", 404);
    }
    if (!template.allowedRoles.includes(ctx.role)) {
      throw new ServiceError("REPORT_NOT_ALLOWED", "Role cannot access this reporting extension", 403);
    }
    return template;
  }

  listTemplates(ctx: RequestContext, tenantId: string): ReportingTemplate[] {
    this.assertTenantScope(ctx, tenantId);
    return this.store.reportingTemplates.filter((template) => template.allowedRoles.includes(ctx.role));
  }

  private inDateRange(value: string, filters: ReportingFilters): boolean {
    const token = value.slice(0, 10);
    if (filters.dateFrom && token < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && token > filters.dateTo) {
      return false;
    }
    return true;
  }

  private loyaltyKpiRows(ctx: RequestContext, tenantId: string, filters: ReportingFilters) {
    const branchId = filters.branchId ?? ctx.branchId;
    const history = this.store.loyaltyRewardHistory.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.branchId === branchId &&
        this.inDateRange(item.createdAt, filters) &&
        (filters.customerId ? item.customerId === filters.customerId : true),
    );
    const customers = this.store.customers.filter(
      (item) => item.tenantId === tenantId && item.branchId === branchId,
    );
    const rule =
      this.store.loyaltyRewardRules.find((item) => item.tenantId === tenantId) ?? {
        tenantId,
        pointsPerKyat: 0.01,
        redemptionRateKyatPerPoint: 25,
        minRedeemPoints: 100,
      };

    const accrued = history
      .filter((item) => item.pointsDelta > 0)
      .reduce((acc, item) => acc + item.pointsDelta, 0);
    const redeemed = Math.abs(
      history
        .filter((item) => item.pointsDelta < 0)
        .reduce((acc, item) => acc + item.pointsDelta, 0),
    );

    return [
      {
        tenant_id: tenantId,
        branch_id: branchId,
        member_count: customers.length,
        active_member_count: customers.filter((item) => item.currentPoints > 0).length,
        points_accrued: accrued,
        points_redeemed: redeemed,
        net_points_outstanding: Math.max(0, accrued - redeemed),
        outstanding_value_kyat: round2(Math.max(0, accrued - redeemed) * rule.redemptionRateKyatPerPoint),
      },
    ];
  }

  private loyaltyAuditRows(ctx: RequestContext, tenantId: string, filters: ReportingFilters) {
    const branchId = filters.branchId ?? ctx.branchId;
    return this.store.loyaltyRewardHistory
      .filter(
        (item) =>
          item.tenantId === tenantId &&
          item.branchId === branchId &&
          this.inDateRange(item.createdAt, filters) &&
          (filters.customerId ? item.customerId === filters.customerId : true) &&
          (filters.operation ? item.operation === filters.operation : true),
      )
      .map((item) => ({
        created_at: item.createdAt,
        customer_id: item.customerId,
        operation: item.operation,
        points_delta: item.pointsDelta,
        balance_after: item.balanceAfter,
        source: item.source,
        actor_user_id: item.actorUserId,
        reason: item.reason,
      }));
  }

  private offlineQueueRows(ctx: RequestContext, tenantId: string, filters: ReportingFilters) {
    const branchId = filters.branchId ?? ctx.branchId;
    const queueRows = this.store.queue.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.branchId === branchId &&
        this.inDateRange(item.createdAt, filters) &&
        (filters.eventType ? item.eventType === filters.eventType : true) &&
        (filters.state ? item.state === filters.state : true),
    );

    const counts = new Map<string, number>();
    for (const row of queueRows) {
      const key = `${row.eventType}:${row.state}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const summaryRows = Array.from(counts.entries()).map(([key, count]) => {
      const [eventType, state] = key.split(":");
      return {
        event_type: eventType,
        queue_state: state,
        count,
      };
    });

    if (summaryRows.length > 0) {
      return summaryRows;
    }

    return [
      {
        event_type: "NONE",
        queue_state: "NONE",
        count: 0,
      },
    ];
  }

  private conflictSlaRows(ctx: RequestContext, tenantId: string, filters: ReportingFilters) {
    const branchId = filters.branchId ?? ctx.branchId;
    return this.store.conflicts
      .filter(
        (item) =>
          item.tenantId === tenantId &&
          item.branchId === branchId &&
          this.inDateRange(item.createdAt, filters) &&
          (filters.status ? item.resolutionStatus === filters.status : true),
      )
      .map((item) => {
        const resolvedAtMs = item.resolvedAt ? Date.parse(item.resolvedAt) : Date.now();
        const createdAtMs = Date.parse(item.createdAt);
        const slaMinutes = createdAtMs > 0 ? round2((resolvedAtMs - createdAtMs) / 1000 / 60) : null;
        return {
          conflict_id: item.conflictId,
          conflict_type: item.conflictType,
          status: item.resolutionStatus,
          created_at: item.createdAt,
          resolved_at: item.resolvedAt ?? null,
          sla_minutes: slaMinutes,
          resolved_by: item.resolvedBy ?? null,
        };
      });
  }

  private multiStoreSalesRows(tenantId: string, filters: ReportingFilters) {
    const targetBranches = this.store.branches
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => (filters.branchId ? item.branchId === filters.branchId : true));

    return targetBranches.map((branch) => {
      const branchSales = this.store.sales.filter(
        (sale) => sale.tenantId === tenantId && sale.branchId === branch.branchId && this.inDateRange(sale.createdAt, filters),
      );

      const gross = round2(branchSales.reduce((acc, sale) => acc + sale.subtotal, 0));
      const discount = round2(branchSales.reduce((acc, sale) => acc + sale.discountTotal, 0));
      const net = round2(branchSales.reduce((acc, sale) => acc + sale.netTotal, 0));
      const receipts = branchSales.length;
      const avg = receipts > 0 ? round2(net / receipts) : 0;

      return {
        tenant_id: tenantId,
        branch_id: branch.branchId,
        branch_name: branch.branchName,
        receipts,
        gross_sales: gross,
        discount_total: discount,
        net_sales: net,
        avg_receipt: avg,
      };
    });
  }

  private multiStoreInventoryRiskRows(tenantId: string, filters: ReportingFilters) {
    const targetBranches = this.store.branches
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => (filters.branchId ? item.branchId === filters.branchId : true));
    const tenantProducts = this.store.products.filter((item) => item.tenantId === tenantId);

    return targetBranches.map((branch) => {
      const lowStock = tenantProducts.filter((product) => {
        const onHand = this.store.getStock(tenantId, branch.branchId, product.productId);
        return onHand <= product.stockAlert;
      });

      const totalStockValue = round2(
        tenantProducts.reduce((acc, product) => {
          const onHand = this.store.getStock(tenantId, branch.branchId, product.productId);
          return acc + onHand * product.costPrice;
        }, 0),
      );

      return {
        tenant_id: tenantId,
        branch_id: branch.branchId,
        branch_name: branch.branchName,
        low_stock_count: lowStock.length,
        total_stock_value_cost: totalStockValue,
        sample_low_stock_skus: lowStock
          .slice(0, 3)
          .map((item) => item.sku)
          .join(", "),
      };
    });
  }

  private multiStoreDiscountComplianceRows(tenantId: string, filters: ReportingFilters) {
    const rows = this.store.discountEvaluations
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => this.inDateRange(item.createdAt, filters))
      .filter((item) => (filters.branchId ? item.branchId === filters.branchId : true))
      .filter((item) => (filters.role ? item.roleAtTime === filters.role : true));

    const grouped = new Map<string, { count: number; discountTotal: number; avgPct: number }>();

    for (const row of rows) {
      const key = `${row.branchId}:${row.roleAtTime}`;
      const current = grouped.get(key) ?? { count: 0, discountTotal: 0, avgPct: 0 };
      current.count += 1;
      current.discountTotal = round2(current.discountTotal + row.discountTotal);
      current.avgPct = round2((current.avgPct * (current.count - 1) + row.stackedDiscountPct) / current.count);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).map(([key, value]) => {
      const [branchId, role] = key.split(":");
      return {
        tenant_id: tenantId,
        branch_id: branchId,
        role,
        evaluation_count: value.count,
        avg_discount_pct: value.avgPct,
        discount_total_kyat: value.discountTotal,
      };
    });
  }

  generate(ctx: RequestContext, tenantId: string, templateId: string, filters: ReportingFilters) {
    const template = this.assertTemplateAccess(ctx, tenantId, templateId);
    let rows: Array<Record<string, string | number | boolean | null>> = [];

    if (template.templateId === "REP-X-LOY-001") {
      rows = this.loyaltyKpiRows(ctx, tenantId, filters);
    } else if (template.templateId === "REP-X-LOY-002") {
      rows = this.loyaltyAuditRows(ctx, tenantId, filters);
    } else if (template.templateId === "REP-X-OPS-001") {
      rows = this.offlineQueueRows(ctx, tenantId, filters);
    } else if (template.templateId === "REP-X-OPS-002") {
      rows = this.conflictSlaRows(ctx, tenantId, filters);
    } else if (template.templateId === "REP-X-MSR-001") {
      rows = this.multiStoreSalesRows(tenantId, filters);
    } else if (template.templateId === "REP-X-MSR-002") {
      rows = this.multiStoreInventoryRiskRows(tenantId, filters);
    } else if (template.templateId === "REP-X-MSR-003") {
      rows = this.multiStoreDiscountComplianceRows(tenantId, filters);
    }

    const snapshot = this.store.addReportingSnapshot({
      tenantId,
      branchId: ctx.branchId,
      templateId,
      filters: filters as Record<string, unknown>,
      rows,
      createdBy: ctx.userId,
    });

    const filterRef = Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("&");

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/reports/extensions/:templateId",
      method: "GET",
      decision: "ALLOW",
      reason: `REPORT_EXTENDED_READ:${templateId}:${filterRef || "none"}`,
      actionType: "REPORT_EXTENDED_READ",
    });

    return {
      template,
      snapshotId: snapshot.snapshotId,
      generatedAt: this.store.nowIso(),
      rows,
    };
  }

  toPrintableHtml(
    title: string,
    rows: Array<Record<string, string | number | boolean | null>>,
    generatedAt: string,
  ): string {
    if (rows.length === 0) {
      return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
        title,
      )}</title></head><body><h1>${escapeHtml(title)}</h1><p>Generated: ${escapeHtml(
        generatedAt,
      )}</p><p>No rows available.</p></body></html>`;
    }

    const headers = Object.keys(rows[0]);
    const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const body = rows
      .map((row) => {
        const cells = headers
          .map((header) => `<td>${escapeHtml(String(row[header] ?? ""))}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 24px; color: #0f172a; }
    h1 { margin-bottom: 4px; }
    p { color: #475569; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px; }
    th { background: #e2e8f0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Generated: ${escapeHtml(generatedAt)}</p>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
  }
}
