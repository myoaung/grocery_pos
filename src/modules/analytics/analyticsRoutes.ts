import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../../utils/errors";
import { toCsv } from "../../utils/export";
import { AnalyticsService } from "./analyticsService";

const trendQuerySchema = z.object({
  metric: z.enum(["net_sales", "receipts", "queue_pending"]).default("net_sales"),
  days: z.coerce.number().int().min(1).max(90).default(30),
  branchId: z.string().optional(),
});

const compareQuerySchema = z.object({
  metric: z.enum(["net_sales", "receipts"]).default("net_sales"),
  from: z.string().min(10),
  to: z.string().min(10),
  branchId: z.string().optional(),
});

const datasetExportSchema = z.object({
  metric: z.enum(["net_sales", "receipts", "queue_pending"]).default("net_sales"),
  days: z.coerce.number().int().min(1).max(90).default(30),
  branchId: z.string().optional(),
  format: z.enum(["csv", "json"]).default("json"),
});

const aggregationJobSchema = z.object({
  window: z.enum(["24h", "7d", "30d"]).optional(),
  simulateTimeout: z.boolean().optional(),
});

const paginationQuerySchema = z.object({
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

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
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

function parseInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", parsed.error.message, 400);
  }
  return parsed.data;
}

export function createAnalyticsRouter(store: MemoryStore) {
  const service = new AnalyticsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/analytics/trends",
    requireTenantPathMatch(),
    requirePermission("analytics.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(trendQuerySchema, req.query);
      const pagination = parseInput(paginationQuerySchema, req.query);
      const output = service.trends(req.ctx, req.params.tenantId, input);
      const paged = paginateRows(output.rows, pagination.page, pagination.pageSize);
      res.json({
        item: {
          ...output,
          rows: paged.rows,
          pagination: paged.pagination,
        },
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/analytics/compare",
    requireTenantPathMatch(),
    requirePermission("analytics.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(compareQuerySchema, req.query);
      res.json({
        item: service.comparePeriods(req.ctx, req.params.tenantId, input),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/analytics/sla",
    requireTenantPathMatch(),
    requirePermission("sla.read"),
    withErrorHandling((req, res) => {
      res.json({
        item: service.slaSnapshot(req.ctx, req.params.tenantId),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/analytics/datasets/export",
    requireTenantPathMatch(),
    requirePermission("analytics.export"),
    withErrorHandling((req, res) => {
      const input = parseInput(datasetExportSchema, req.query);
      const pagination = parseInput(paginationQuerySchema, req.query);
      const output = service.exportDataset(req.ctx, req.params.tenantId, input);
      const paged = paginateRows(output.rows, pagination.page, pagination.pageSize);
      if (input.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=analytics_dataset.csv");
        res.send(toCsv(paged.rows));
        return;
      }
      res.json({
        item: {
          ...output,
          rows: paged.rows,
          pagination: paged.pagination,
        },
      });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/aggregation/jobs",
    requireTenantPathMatch(),
    requirePermission("aggregation.job.run"),
    withErrorHandling((req, res) => {
      const input = parseInput(aggregationJobSchema, req.body ?? {});
      res.status(202).json({
        item: service.enqueueAggregationJob(req.ctx, req.params.tenantId, input),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/aggregation/jobs",
    requireTenantPathMatch(),
    requirePermission("aggregation.job.read"),
    withErrorHandling((req, res) => {
      res.json({
        items: service.listAggregationJobs(req.ctx, req.params.tenantId),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/aggregation/jobs/:jobId",
    requireTenantPathMatch(),
    requirePermission("aggregation.job.read"),
    withErrorHandling((req, res) => {
      res.json({
        item: service.getAggregationJob(req.ctx, req.params.tenantId, req.params.jobId),
      });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/aggregation/snapshots",
    requireTenantPathMatch(),
    requirePermission("aggregation.job.read"),
    withErrorHandling((req, res) => {
      res.json({
        items: service.listAggregationSnapshots(req.ctx, req.params.tenantId),
      });
    }),
  );

  router.delete(
    "/api/v1/tenants/:tenantId/analytics/cache",
    requireTenantPathMatch(),
    requirePermission("scale.cache.evict"),
    withErrorHandling((req, res) => {
      const prefix = typeof req.query.prefix === "string" && req.query.prefix.length > 0 ? req.query.prefix : "analytics:";
      const removed = service.evictAnalyticsCache(req.ctx, req.params.tenantId, prefix);
      res.json({ removed, prefix });
    }),
  );

  return router;
}
