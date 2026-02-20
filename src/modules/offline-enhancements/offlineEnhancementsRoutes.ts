import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, ServiceError } from "../../utils/errors";
import { OfflineEnhancementsService } from "./offlineEnhancementsService";

const loyaltyQueueSchema = z.object({
  operation: z.enum(["ACCRUE", "REDEEM"]),
  customerId: z.string().min(1),
  points: z.number().int().positive(),
  reason: z.string().min(1),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

const reportQueueSchema = z.object({
  templateId: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

function parseJsonBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
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
      res.status(serviceError.statusCode).json({
        error: serviceError.code,
        message: serviceError.message,
      });
    }
  };
}

export function createOfflineEnhancementsRouter(store: MemoryStore) {
  const service = new OfflineEnhancementsService(store);
  const router = Router();

  router.post(
    "/api/v1/tenants/:tenantId/offline/loyalty/queue",
    requireTenantPathMatch(),
    requirePermission("offline.enhanced.queue"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(loyaltyQueueSchema, req.body);
      res.status(201).json({ item: service.queueLoyalty(req.ctx, req.params.tenantId, body) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/offline/reports/queue",
    requireTenantPathMatch(),
    requirePermission("offline.enhanced.queue"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(reportQueueSchema, req.body);
      res.status(201).json({ item: service.queueReport(req.ctx, req.params.tenantId, body) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/offline/events",
    requireTenantPathMatch(),
    requirePermission("offline.enhanced.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listOfflineEvents(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/offline/status",
    requireTenantPathMatch(),
    requirePermission("offline.enhanced.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.status(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/offline/reconcile",
    requireTenantPathMatch(),
    requirePermission("offline.enhanced.sync"),
    withErrorHandling((req, res) => {
      res.json(service.reconcile(req.ctx, req.params.tenantId));
    }),
  );

  return router;
}
