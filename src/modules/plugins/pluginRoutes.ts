import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, ServiceError } from "../../utils/errors";
import { PluginRegistry } from "./pluginRegistry";
import { PluginService } from "./pluginService";

const registerSchema = z.object({
  pluginId: z.string().min(1),
  pluginType: z.enum(["PAYMENT", "MARKETPLACE"]),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const chargeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
  orderRef: z.string().min(1),
  method: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

export function createPluginRouter(store: MemoryStore) {
  const registry = new PluginRegistry();
  const service = new PluginService(store, registry);
  const router = Router();

  router.get(
    "/api/v1/plugins",
    requirePermission("plugin.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listAvailable() });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/plugins",
    requireTenantPathMatch(),
    requirePermission("plugin.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listTenantRegistrations(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/plugins/register",
    requireTenantPathMatch(),
    requirePermission("plugin.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(registerSchema, req.body);
      res.status(201).json({ item: service.registerForTenant(req.ctx, req.params.tenantId, body) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/plugins/:pluginId/payments/charge",
    requireTenantPathMatch(),
    requirePermission("plugin.execute"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(chargeSchema, req.body);
      const result = service.charge(req.ctx, req.params.tenantId, req.params.pluginId, body);
      res.status(result.result.status === "APPROVED" ? 200 : 402).json(result);
    }),
  );

  return router;
}
