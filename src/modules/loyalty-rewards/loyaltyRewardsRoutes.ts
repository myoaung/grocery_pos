import { Router } from "express";
import { z } from "zod";
import { enforceReadOnlyFallback, requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, ServiceError } from "../../utils/errors";
import { LoyaltyRewardsService } from "./loyaltyRewardsService";

const accrueSchema = z.object({
  customerId: z.string().min(1),
  reason: z.string().min(1),
  amountKyat: z.number().positive().optional(),
  points: z.number().int().positive().optional(),
  offline: z.boolean().optional(),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

const redeemSchema = z.object({
  customerId: z.string().min(1),
  points: z.number().int().positive(),
  reason: z.string().min(1),
  offline: z.boolean().optional(),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

const ruleSchema = z.object({
  pointsPerKyat: z.number().positive().optional(),
  redemptionRateKyatPerPoint: z.number().positive().optional(),
  minRedeemPoints: z.number().int().nonnegative().optional(),
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

export function createLoyaltyRewardsRouter(store: MemoryStore) {
  const service = new LoyaltyRewardsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/rewards/rules",
    requireTenantPathMatch(),
    requirePermission("loyalty.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.getRule(req.ctx, req.params.tenantId) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/rewards/rules",
    requireTenantPathMatch(),
    requirePermission("loyalty.rule.manage"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(ruleSchema, req.body);
      res.json({ item: service.updateRule(req.ctx, req.params.tenantId, body) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/rewards/balance/:customerId",
    requireTenantPathMatch(),
    requirePermission("loyalty.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.getBalance(req.ctx, req.params.tenantId, req.params.customerId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/rewards/history",
    requireTenantPathMatch(),
    requirePermission("loyalty.history.read"),
    withErrorHandling((req, res) => {
      const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
      res.json({ items: service.listHistory(req.ctx, req.params.tenantId, customerId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/rewards/kpis",
    requireTenantPathMatch(),
    requirePermission("dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.getKpis(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/rewards/accrue",
    requireTenantPathMatch(),
    requirePermission("loyalty.accrue"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(accrueSchema, req.body);
      const item = service.accrue(req.ctx, req.params.tenantId, body);
      res.status(201).json({ item });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/rewards/redeem",
    requireTenantPathMatch(),
    requirePermission("loyalty.redeem"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(redeemSchema, req.body);
      const item = service.redeem(req.ctx, req.params.tenantId, body);
      res.status(201).json({ item });
    }),
  );

  return router;
}
