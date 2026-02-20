import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, resolveUserExplanation, ServiceError } from "../../utils/errors";
import { MetricsService } from "./metricsService";

const jobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  jobType: z.string().min(1).optional(),
});

const insightsQuerySchema = z.object({
  severity: z.enum(["INFO", "WARN", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "EXECUTED", "DISMISSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
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

export function createMetricsRouter(store: MemoryStore) {
  const service = new MetricsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/observability/overview",
    requireTenantPathMatch(),
    requirePermission("ops.dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.overview(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/observability/dashboard",
    requireTenantPathMatch(),
    requirePermission("ops.dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.dashboard(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/observability/sla",
    requireTenantPathMatch(),
    requirePermission("ops.dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.sla(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/observability/alerts",
    requireTenantPathMatch(),
    requirePermission("ops.dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.alerts(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/observability/jobs",
    requireTenantPathMatch(),
    requirePermission("ops.dashboard.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(jobsQuerySchema, req.query);
      res.json({ item: service.jobs(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/observability/insights",
    requireTenantPathMatch(),
    requirePermission("ops.dashboard.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(insightsQuerySchema, req.query);
      res.json({ item: service.insights(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/scale-guard/stats",
    requireTenantPathMatch(),
    requirePermission("scale.guard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.scaleStats(req.ctx, req.params.tenantId) });
    }),
  );

  router.delete(
    "/api/v1/tenants/:tenantId/scale-guard/cache",
    requireTenantPathMatch(),
    requirePermission("scale.cache.evict"),
    withErrorHandling((req, res) => {
      const prefix = typeof req.query.prefix === "string" && req.query.prefix.length > 0 ? req.query.prefix : "analytics:";
      res.json({ item: service.evictScale(req.ctx, req.params.tenantId, prefix) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/scale-guard/advisory",
    requireTenantPathMatch(),
    requirePermission("scale.guard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.scaleAdvisory(req.ctx, req.params.tenantId) });
    }),
  );

  return router;
}
