import { Router } from "express";
import { z } from "zod";
import { PERFORMANCE_BUDGET } from "../../config/performanceBudget";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../../utils/errors";
import { toCsv, toPdfBuffer } from "../../utils/export";
import { ReportingExtensionsService } from "./reportingExtensionsService";

const filterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  branchId: z.string().optional(),
  customerId: z.string().optional(),
  operation: z.string().optional(),
  role: z.string().optional(),
  eventType: z.string().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
});

function withErrorHandling(handler: (req: any, res: any) => Promise<void> | void) {
  return async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (error) {
      const serviceError = asServiceError(error);
      const explanation = resolveUserExplanation(serviceError.code);
      res.status(serviceError.statusCode).json({
        error: serviceError.code,
        message: serviceError.message,
        explanationCode: explanation?.explanationCode,
        explanationMessage: explanation?.explanationMessage,
        explanationSeverity: explanation?.explanationSeverity,
      });
    }
  };
}

function parseFilters(query: Record<string, unknown>) {
  return filterSchema.parse({
    dateFrom: typeof query.dateFrom === "string" ? query.dateFrom : undefined,
    dateTo: typeof query.dateTo === "string" ? query.dateTo : undefined,
    branchId: typeof query.branchId === "string" ? query.branchId : undefined,
    customerId: typeof query.customerId === "string" ? query.customerId : undefined,
    operation: typeof query.operation === "string" ? query.operation : undefined,
    role: typeof query.role === "string" ? query.role : undefined,
    eventType: typeof query.eventType === "string" ? query.eventType : undefined,
    state: typeof query.state === "string" ? query.state : undefined,
    status: typeof query.status === "string" ? query.status : undefined,
  });
}

function parsePagination(query: Record<string, unknown>) {
  const maxPageSize = PERFORMANCE_BUDGET.reporting.multiStore.maxPageSize;
  const pageRaw = typeof query.page === "string" ? Number(query.page) : 1;
  const pageSizeRaw = typeof query.pageSize === "string" ? Number(query.pageSize) : 50;

  if (!Number.isInteger(pageRaw) || pageRaw < 1) {
    throw new ServiceError("INVALID_PAGINATION", "page must be a positive integer", 400);
  }
  if (!Number.isInteger(pageSizeRaw) || pageSizeRaw < 1 || pageSizeRaw > maxPageSize) {
    throw new ServiceError("INVALID_PAGINATION", `pageSize must be an integer between 1 and ${maxPageSize}`, 400);
  }

  return {
    page: pageRaw,
    pageSize: pageSizeRaw,
  };
}

function observeAndEnforceReportBudget(
  req: any,
  templateId: string,
  startedAtMs: number,
  operation: "READ" | "EXPORT",
): void {
  const elapsedMs = Date.now() - startedAtMs;
  req.store.addStructuredMetric({
    metricName: "report_runtime_latency_ms",
    metricUnit: "ms",
    metricValue: elapsedMs,
    tenantId: req.ctx.tenantId,
    branchId: req.ctx.branchId,
    tags: {
      templateId,
      operation,
    },
    source: "API",
  });

  if (elapsedMs > PERFORMANCE_BUDGET.reporting.multiStore.p95Ms) {
    req.store.addAudit({
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      actorUserId: req.ctx.userId,
      roleAtTime: req.ctx.role,
      endpoint: req.originalUrl,
      method: req.method,
      decision: "ALLOW",
      reason: `REPORT_PERFORMANCE_WARN:${elapsedMs}ms`,
      actionType: "REPORT_PERFORMANCE_WARN",
    });
  }

  if (elapsedMs <= PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs) {
    return;
  }

  req.store.addAudit({
    tenantId: req.ctx.tenantId,
    branchId: req.ctx.branchId,
    actorUserId: req.ctx.userId,
    roleAtTime: req.ctx.role,
    endpoint: req.originalUrl,
    method: req.method,
    decision: "DENY",
    reason: `REPORT_PERFORMANCE_BUDGET_EXCEEDED:${elapsedMs}ms`,
    actionType: "REPORT_PERFORMANCE_BLOCK",
  });
  throw new ServiceError(
    "REPORT_PERFORMANCE_BUDGET_EXCEEDED",
    `Report runtime ${elapsedMs}ms exceeded hard limit ${PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs}ms`,
    503,
  );
}

function paginateRows(rows: Array<Record<string, string | number | boolean | null>>, page: number, pageSize: number) {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const end = start + pageSize;
  return {
    rows: rows.slice(start, end),
    pagination: {
      page: clampedPage,
      pageSize,
      totalRows,
      totalPages,
      limitMax: PERFORMANCE_BUDGET.reporting.multiStore.maxPageSize,
    },
  };
}

function templateFromMultiStoreKey(key: string): string {
  if (key === "summary") {
    return "REP-X-MSR-001";
  }
  if (key === "inventory-risk") {
    return "REP-X-MSR-002";
  }
  if (key === "discount-compliance") {
    return "REP-X-MSR-003";
  }
  throw new ServiceError("INVALID_MULTI_STORE_KEY", "Allowed keys: summary, inventory-risk, discount-compliance", 400);
}

export function createReportingExtensionsRouter(store: MemoryStore) {
  const service = new ReportingExtensionsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/reports/extensions/templates",
    requireTenantPathMatch(),
    requirePermission("report.extended.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listTemplates(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/reports/extensions/:templateId",
    requireTenantPathMatch(),
    requirePermission("report.extended.read"),
    withErrorHandling((req, res) => {
      const startedAtMs = Date.now();
      const filters = parseFilters(req.query);
      const output = service.generate(req.ctx, req.params.tenantId, req.params.templateId, filters);
      observeAndEnforceReportBudget(req, req.params.templateId, startedAtMs, "READ");
      res.setHeader("x-report-latency-ms", String(Date.now() - startedAtMs));
      res.json(output);
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/reports/extensions/:templateId/export",
    requireTenantPathMatch(),
    requirePermission("report.extended.export"),
    withErrorHandling(async (req, res) => {
      const startedAtMs = Date.now();
      const filters = parseFilters(req.query);
      const output = service.generate(req.ctx, req.params.tenantId, req.params.templateId, filters);
      const format = String(req.query.format ?? "csv").toLowerCase();
      observeAndEnforceReportBudget(req, req.params.templateId, startedAtMs, "EXPORT");
      res.setHeader("x-report-latency-ms", String(Date.now() - startedAtMs));

      if (format === "pdf") {
        const buffer = await toPdfBuffer(output.template.templateId, output.rows);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${output.template.templateId}.pdf`);
        res.send(buffer);
        return;
      }

      if (format === "print") {
        const html = service.toPrintableHtml(output.template.title, output.rows, output.generatedAt);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${output.template.templateId}.csv`);
      res.send(toCsv(output.rows));
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/reports/multi-store/:reportKey",
    requireTenantPathMatch(),
    requirePermission("report.multi_store.read"),
    withErrorHandling((req, res) => {
      const startedAtMs = Date.now();
      const filters = parseFilters(req.query);
      const pagination = parsePagination(req.query);
      const templateId = templateFromMultiStoreKey(req.params.reportKey);
      const output = service.generate(req.ctx, req.params.tenantId, templateId, filters);
      observeAndEnforceReportBudget(req, templateId, startedAtMs, "READ");
      const paged = paginateRows(output.rows, pagination.page, pagination.pageSize);
      res.setHeader("x-report-latency-ms", String(Date.now() - startedAtMs));
      res.json({
        ...output,
        rows: paged.rows,
        pagination: paged.pagination,
        aggregationMode: "LIVE_WITH_SNAPSHOT",
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/reports/multi-store/:reportKey/export",
    requireTenantPathMatch(),
    requirePermission("report.multi_store.export"),
    withErrorHandling(async (req, res) => {
      const startedAtMs = Date.now();
      const filters = parseFilters(req.query);
      const templateId = templateFromMultiStoreKey(req.params.reportKey);
      const output = service.generate(req.ctx, req.params.tenantId, templateId, filters);
      const format = String(req.query.format ?? "csv").toLowerCase();
      observeAndEnforceReportBudget(req, templateId, startedAtMs, "EXPORT");
      res.setHeader("x-report-latency-ms", String(Date.now() - startedAtMs));

      if (format === "pdf") {
        const buffer = await toPdfBuffer(output.template.templateId, output.rows);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${output.template.templateId}.pdf`);
        res.send(buffer);
        return;
      }

      if (format === "print") {
        const html = service.toPrintableHtml(output.template.title, output.rows, output.generatedAt);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${output.template.templateId}.csv`);
      res.send(toCsv(output.rows));
    }),
  );

  return router;
}
