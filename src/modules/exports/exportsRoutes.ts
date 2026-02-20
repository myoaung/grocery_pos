import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../../utils/errors";
import { toCsv } from "../../utils/export";
import { ExportsService } from "./exportsService";

const auditQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["csv", "json"]).default("json"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const retentionUpdateSchema = z.object({
  auditDays: z.number().int().min(30).max(3650),
  securityEventDays: z.number().int().min(30).max(3650),
  complianceEventDays: z.number().int().min(30).max(3650),
  metricDays: z.number().int().min(30).max(3650),
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

export function createExportsRouter(store: MemoryStore) {
  const service = new ExportsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/exports/audit",
    requireTenantPathMatch(),
    requirePermission("exports.audit.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(auditQuerySchema, req.query);
      const output = service.exportAudit(req.ctx, req.params.tenantId, {
        from: input.from,
        to: input.to,
      });
      const paged = paginateRows(output.rows, input.page, input.pageSize);
      if (input.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=audit_export.csv");
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

  router.get(
    "/api/v1/tenants/:tenantId/exports/retention-policy",
    requireTenantPathMatch(),
    requirePermission("exports.retention.read"),
    withErrorHandling((req, res) => {
      res.json({
        item: service.getRetentionPolicy(req.ctx, req.params.tenantId),
      });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/exports/retention-policy",
    requireTenantPathMatch(),
    requirePermission("exports.retention.write"),
    withErrorHandling((req, res) => {
      const input = parseInput(retentionUpdateSchema, req.body);
      res.json({
        item: service.updateRetentionPolicy(req.ctx, req.params.tenantId, input),
      });
    }),
  );

  return router;
}
