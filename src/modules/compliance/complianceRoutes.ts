import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../../utils/errors";
import { toCsv } from "../../utils/export";
import { ComplianceService } from "./complianceService";

const exportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.enum(["AUDIT", "SECURITY", "COMPLIANCE"]).optional(),
  format: z.enum(["json", "csv"]).default("json"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const holdCreateSchema = z.object({
  scope: z.enum(["TENANT", "BRANCH"]),
  branchId: z.string().optional(),
  reason: z.string().min(3),
  referenceId: z.string().optional(),
});

const holdReleaseSchema = z.object({
  note: z.string().min(3),
});

function parseInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", parsed.error.message, 400);
  }
  return parsed.data;
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

export function createComplianceRouter(store: MemoryStore) {
  const service = new ComplianceService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/compliance/exports",
    requireTenantPathMatch(),
    requirePermission("compliance.export.read"),
    withErrorHandling((req, res) => {
      const input = parseInput(exportQuerySchema, req.query);
      const output = service.exportRows(req.ctx, req.params.tenantId, {
        from: input.from,
        to: input.to,
        category: input.category,
      });
      const paged = paginateRows(output.rows, input.page, input.pageSize);
      if (input.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=compliance_export.csv");
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
    "/api/v1/tenants/:tenantId/compliance/legal-holds",
    requireTenantPathMatch(),
    requirePermission("legal.hold.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listLegalHolds(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/compliance/legal-holds",
    requireTenantPathMatch(),
    requirePermission("legal.hold.write"),
    withErrorHandling((req, res) => {
      const input = parseInput(holdCreateSchema, req.body);
      res.status(201).json({ item: service.createLegalHold(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/compliance/legal-holds/:holdId/release",
    requireTenantPathMatch(),
    requirePermission("legal.hold.write"),
    withErrorHandling((req, res) => {
      const input = parseInput(holdReleaseSchema, req.body);
      res.json({ item: service.releaseLegalHold(req.ctx, req.params.tenantId, req.params.holdId, input.note) });
    }),
  );

  return router;
}
