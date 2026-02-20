import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, resolveUserExplanation } from "../../utils/errors";
import { IntegrationControlService } from "./integrationControlService";
import { WebhookService } from "./webhookService";

const endpointSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  eventTypes: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().optional(),
  secret: z.string().min(8).optional(),
  integrationClientId: z.string().uuid().optional(),
});

const dispatchSchema = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().uuid(),
  branchId: z.string().optional(),
  simulateFailure: z.boolean().optional(),
});

const clientSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  allowedEventTypes: z.array(z.string().min(1)).optional(),
});

const killSwitchSchema = z.object({
  enabled: z.boolean(),
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

export function createWebhookRouter(store: MemoryStore) {
  const service = new WebhookService(store);
  const controlService = new IntegrationControlService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/webhooks/clients",
    requireTenantPathMatch(),
    requirePermission("integration.client.read"),
    withErrorHandling((req, res) => {
      res.json({ items: controlService.list(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/webhooks/clients",
    requireTenantPathMatch(),
    requirePermission("integration.client.write"),
    withErrorHandling((req, res) => {
      const input = clientSchema.parse(req.body);
      res.status(201).json(controlService.create(req.ctx, req.params.tenantId, input));
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/webhooks/clients/:clientId/rotate-token",
    requireTenantPathMatch(),
    requirePermission("integration.client.write"),
    withErrorHandling((req, res) => {
      res.json(controlService.rotateToken(req.ctx, req.params.tenantId, req.params.clientId));
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/webhooks/clients/:clientId/kill-switch",
    requireTenantPathMatch(),
    requirePermission("integration.client.write"),
    withErrorHandling((req, res) => {
      const input = killSwitchSchema.parse(req.body);
      res.json({ item: controlService.setKillSwitch(req.ctx, req.params.tenantId, req.params.clientId, input.enabled) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/webhooks/clients/:clientId/token/verify",
    requireTenantPathMatch(),
    requirePermission("integration.client.token.verify"),
    withErrorHandling((req, res) => {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      res.json({ item: controlService.verifyToken(req.ctx, req.params.tenantId, req.params.clientId, token) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/webhooks/endpoints",
    requireTenantPathMatch(),
    requirePermission("webhook.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listEndpoints(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/webhooks/endpoints",
    requireTenantPathMatch(),
    requirePermission("webhook.write"),
    withErrorHandling((req, res) => {
      const input = endpointSchema.parse(req.body);
      res.status(201).json({ item: service.upsertEndpoint(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/webhooks/endpoints/:endpointId",
    requireTenantPathMatch(),
    requirePermission("webhook.write"),
    withErrorHandling((req, res) => {
      const input = endpointSchema.partial().parse(req.body);
      const existing = store.webhookEndpoints.find(
        (item) => item.tenantId === req.params.tenantId && item.endpointId === req.params.endpointId,
      );
      if (!existing) {
        res.status(404).json({ error: "WEBHOOK_ENDPOINT_NOT_FOUND", message: "Webhook endpoint not found" });
        return;
      }
      const merged = {
        name: input.name ?? existing.name,
        url: input.url ?? existing.url,
        eventTypes: input.eventTypes ?? existing.eventTypes,
        enabled: input.enabled ?? existing.enabled,
        secret: input.secret ?? existing.secret,
        integrationClientId: input.integrationClientId ?? existing.integrationClientId,
      };
      res.json({ item: service.upsertEndpoint(req.ctx, req.params.tenantId, merged, req.params.endpointId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/webhooks/deliveries",
    requireTenantPathMatch(),
    requirePermission("webhook.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listDeliveries(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/webhooks/dispatch",
    requireTenantPathMatch(),
    requirePermission("webhook.dispatch"),
    withErrorHandling((req, res) => {
      const input = dispatchSchema.parse(req.body);
      res.status(202).json({ item: service.dispatch(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/webhooks/retry",
    requireTenantPathMatch(),
    requirePermission("webhook.dispatch"),
    withErrorHandling((req, res) => {
      res.json({ item: service.retryDue(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/webhooks/deliveries/:deliveryId/verify",
    requireTenantPathMatch(),
    requirePermission("webhook.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.verifyDelivery(req.ctx, req.params.tenantId, req.params.deliveryId) });
    }),
  );

  return router;
}
