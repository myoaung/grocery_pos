import { Router } from "express";
import { z } from "zod";
import { CORE_FEATURE_FLAGS } from "../../config/coreContracts";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import type { FeatureFlagKey } from "../../types";
import { asServiceError, ServiceError } from "../../utils/errors";
import { FeatureFlagService } from "../../services/featureFlagService";

const flagValues = [...CORE_FEATURE_FLAGS] as [FeatureFlagKey, ...FeatureFlagKey[]];
const flagSchema = z.enum(flagValues);
const updateSchema = z.object({
  enabled: z.boolean(),
});

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

export function createFeatureFlagRouter(store: MemoryStore) {
  const service = new FeatureFlagService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/feature-flags",
    requireTenantPathMatch(),
    requirePermission("feature.flag.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.list(req.ctx, req.params.tenantId) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/feature-flags/:flagKey",
    requireTenantPathMatch(),
    requirePermission("feature.flag.write"),
    withErrorHandling((req, res) => {
      const flagKey = flagSchema.safeParse(req.params.flagKey);
      if (!flagKey.success) {
        throw new ServiceError("INVALID_FEATURE_FLAG_KEY", "Unknown feature flag key", 400);
      }
      const body = updateSchema.parse(req.body);
      res.json({ item: service.update(req.ctx, req.params.tenantId, flagKey.data, body.enabled) });
    }),
  );

  return router;
}
