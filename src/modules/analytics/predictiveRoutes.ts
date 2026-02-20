import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../../utils/errors";
import { toCsv } from "../../utils/export";
import { PredictiveService } from "./predictiveService";

const trendQuerySchema = z.object({
  metric: z.enum(["net_sales", "receipts", "queue_pending"]).default("net_sales"),
  historyDays: z.coerce.number().int().min(7).max(180).default(30),
  forecastDays: z.coerce.number().int().min(1).max(30).default(7),
  branchId: z.string().optional(),
});

const slaQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(1).max(30).default(7),
});

const exportQuerySchema = z.object({
  dataset: z.enum(["trend", "sla"]).default("trend"),
  format: z.enum(["csv", "json"]).default("json"),
  metric: z.enum(["net_sales", "receipts", "queue_pending"]).default("net_sales"),
  historyDays: z.coerce.number().int().min(7).max(180).default(30),
  forecastDays: z.coerce.number().int().min(1).max(30).default(7),
  horizonDays: z.coerce.number().int().min(1).max(30).default(7),
  branchId: z.string().optional(),
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

function parseInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", parsed.error.message, 400);
  }
  return parsed.data;
}

export function createPredictiveRouter(store: MemoryStore) {
  const service = new PredictiveService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/predictive/trends",
    requireTenantPathMatch(),
    requirePermission("predictive.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(trendQuerySchema, req.query);
      res.json({
        item: service.trendForecast(req.ctx, req.params.tenantId, input),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/predictive/sla",
    requireTenantPathMatch(),
    requirePermission("predictive.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(slaQuerySchema, req.query);
      res.json({
        item: service.slaForecast(req.ctx, req.params.tenantId, input),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/predictive/export",
    requireTenantPathMatch(),
    requirePermission("predictive.export"),
    withErrorHandling((req, res) => {
      const input = parseInput(exportQuerySchema, req.query);
      const rows =
        input.dataset === "trend"
          ? service.exportRows(req.ctx, req.params.tenantId, {
              dataset: "trend",
              metric: input.metric,
              historyDays: input.historyDays,
              forecastDays: input.forecastDays,
              branchId: input.branchId,
            })
          : service.exportRows(req.ctx, req.params.tenantId, {
              dataset: "sla",
              horizonDays: input.horizonDays,
            });
      if (input.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=predictive_export.csv");
        res.send(toCsv(rows));
        return;
      }
      res.json({
        item: {
          tenantId: req.params.tenantId,
          dataset: input.dataset,
          generatedAt: store.nowIso(),
          rows,
        },
      });
    }),
  );

  return router;
}
