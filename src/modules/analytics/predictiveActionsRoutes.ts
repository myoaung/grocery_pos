import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../../utils/errors";
import { PredictiveActionsService } from "./predictiveActionsService";

const listQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(1).max(30).default(7),
  metric: z.enum(["net_sales", "receipts", "queue_pending"]).default("queue_pending"),
  historyDays: z.coerce.number().int().min(7).max(180).default(30),
  forecastDays: z.coerce.number().int().min(1).max(30).default(7),
  branchId: z.string().optional(),
  severity: z.enum(["INFO", "WARN", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "EXECUTED", "DISMISSED"]).optional(),
  dataset: z.enum(["SLA", "TREND"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  refresh: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      if (typeof value === "boolean") {
        return value;
      }
      return value === "true" || value === "1";
    }),
});

const actBodySchema = z.object({
  decision: z.enum(["ACKNOWLEDGE", "EXECUTE", "DISMISS"]),
  note: z.string().max(240).optional(),
});

function parseInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", parsed.error.message, 400);
  }
  return parsed.data;
}

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

export function createPredictiveActionsRouter(store: MemoryStore) {
  const service = new PredictiveActionsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/predictive/actions",
    requireTenantPathMatch(),
    requirePermission("predictive.action.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(listQuerySchema, req.query);
      res.json({ item: service.list(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/predictive/actions/:actionId/act",
    requireTenantPathMatch(),
    requirePermission("predictive.action.write"),
    withErrorHandling((req, res) => {
      const body = parseInput(actBodySchema, req.body);
      res.json({ item: service.act(req.ctx, req.params.tenantId, req.params.actionId, body) });
    }),
  );

  return router;
}
