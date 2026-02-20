import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, ServiceError } from "../../utils/errors";
import type { NotificationTriggerInput } from "./fiamService";
import { FiamService } from "./fiamService";

const triggerSchema = z.object({
  eventType: z.enum(["LOYALTY_POINTS", "LOW_STOCK", "OFFLINE_CONFLICT", "SYSTEM_EVENT"]),
  severity: z.enum(["INFO", "WARN", "READ_ONLY", "BLOCK"]),
  branchId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  targetRoles: z
    .array(z.enum(["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"]))
    .optional(),
  idempotencyKey: z.string().uuid().optional(),
  forceQueue: z.boolean().optional(),
});

const connectivitySchema = z.object({
  branchId: z.string().optional(),
  online: z.boolean(),
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

export function createFiamRouter(store: MemoryStore, fiamService: FiamService) {
  const router = Router();

  router.get(
    "/api/v1/notifications/config",
    requirePermission("notification.read"),
    withErrorHandling((_req, res) => {
      res.json({
        provider: "FIREBASE_FIAM",
        config: fiamService.getConfig(),
      });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/notifications/trigger",
    requireTenantPathMatch(),
    requirePermission("notification.trigger"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(triggerSchema, req.body);
      const result = fiamService.trigger(req.ctx, req.params.tenantId, {
        ...body,
        source: "MANUAL",
      } as NotificationTriggerInput);
      res.status(result.deduplicated ? 200 : 201).json(result);
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/notifications/feed",
    requireTenantPathMatch(),
    requirePermission("notification.read"),
    withErrorHandling((req, res) => {
      const includeRead = String(req.query.includeRead ?? "false").toLowerCase() === "true";
      res.json({ items: fiamService.listFeed(req.ctx, req.params.tenantId, includeRead) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/notifications/:notificationId/read",
    requireTenantPathMatch(),
    requirePermission("notification.read"),
    withErrorHandling((req, res) => {
      res.json({ item: fiamService.markRead(req.ctx, req.params.tenantId, req.params.notificationId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/notifications/retry",
    requireTenantPathMatch(),
    requirePermission("notification.manage"),
    withErrorHandling((req, res) => {
      res.json(fiamService.retryPending(req.ctx, req.params.tenantId));
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/notifications/connectivity",
    requireTenantPathMatch(),
    requirePermission("notification.manage"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(connectivitySchema, req.body);
      res.json({
        item: fiamService.setConnectivity(req.ctx, req.params.tenantId, body.branchId ?? req.ctx.branchId, body.online),
      });
    }),
  );

  return router;
}
