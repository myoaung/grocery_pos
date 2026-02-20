import { Router } from "express";
import { z } from "zod";
import { PERFORMANCE_BUDGET } from "../../config/performanceBudget";
import { requirePermission } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, resolveUserExplanation, ServiceError } from "../../utils/errors";
import { toCsv, toPdfBuffer } from "../../utils/export";
import { AdvancedReportService } from "./advancedReportService";

const filterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  compareTenantId: z.string().optional(),
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

function observeAdvancedLatency(req: any, startedAtMs: number): void {
  const latencyMs = Date.now() - startedAtMs;
  req.store.addStructuredMetric({
    metricName: "report_runtime_latency_ms",
    metricUnit: "ms",
    metricValue: latencyMs,
    tenantId: req.ctx.tenantId,
    branchId: req.ctx.branchId,
    tags: {
      reportId: req.params.reportId ?? "templates",
      operation: req.method,
    },
    source: "API",
  });
  if (latencyMs > PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs) {
    throw new ServiceError(
      "REPORT_PERFORMANCE_BUDGET_EXCEEDED",
      `Advanced report latency ${latencyMs}ms exceeded hard limit ${PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs}ms`,
      503,
    );
  }
}

export function createAdvancedReportRouter(store: MemoryStore) {
  const service = new AdvancedReportService(store);
  const router = Router();

  router.get(
    "/api/v1/reports/advanced/templates",
    requirePermission("report.tenant"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listTemplates(req.ctx) });
    }),
  );

  router.get(
    "/api/v1/reports/advanced/:reportId",
    requirePermission("report.tenant"),
    withErrorHandling((req, res) => {
      const startedAtMs = Date.now();
      const filters = filterSchema.parse({
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        compareTenantId: req.query.compareTenantId,
      });
      const output = service.generate(req.ctx, req.params.reportId, filters);
      observeAdvancedLatency(req, startedAtMs);
      res.setHeader("x-report-latency-ms", String(Date.now() - startedAtMs));
      res.json(output);
    }),
  );

  router.get(
    "/api/v1/reports/advanced/:reportId/export",
    requirePermission("report.export"),
    withErrorHandling(async (req, res) => {
      const startedAtMs = Date.now();
      const filters = filterSchema.parse({
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        compareTenantId: req.query.compareTenantId,
      });
      const report = service.generate(req.ctx, req.params.reportId, filters);
      observeAdvancedLatency(req, startedAtMs);
      res.setHeader("x-report-latency-ms", String(Date.now() - startedAtMs));
      const format = String(req.query.format ?? "csv").toLowerCase();

      if (format === "pdf") {
        const buffer = await toPdfBuffer(report.reportId, report.rows);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${report.reportId}.pdf`);
        res.send(buffer);
        return;
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${report.reportId}.csv`);
      res.send(toCsv(report.rows));
    }),
  );

  return router;
}
