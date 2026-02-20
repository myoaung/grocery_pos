import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, ServiceError } from "../../utils/errors";
import { OfflineAutomationService } from "./offlineAutomationService";

const ackSchema = z.object({
  note: z.string().min(1).optional(),
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

export function createOfflineAutomationRouter(store: MemoryStore) {
  const service = new OfflineAutomationService(store);
  const router = Router();

  router.post(
    "/api/v1/tenants/:tenantId/offline/automation/run",
    requireTenantPathMatch(),
    requirePermission("offline.automation.run"),
    withErrorHandling((req, res) => {
      res.json(service.runAutomation(req.ctx, req.params.tenantId));
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/offline/alerts",
    requireTenantPathMatch(),
    requirePermission("offline.alert.read"),
    withErrorHandling((req, res) => {
      const includeAcknowledged = String(req.query.includeAcknowledged ?? "false").toLowerCase() === "true";
      res.json({ items: service.listAlerts(req.ctx, req.params.tenantId, includeAcknowledged) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/offline/alerts/:alertId/ack",
    requireTenantPathMatch(),
    requirePermission("offline.alert.ack"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(ackSchema, req.body);
      res.json({ item: service.acknowledgeAlert(req.ctx, req.params.tenantId, req.params.alertId, body.note) });
    }),
  );

  return router;
}
