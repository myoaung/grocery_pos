import { Router } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import { enforceReadOnlyFallback, requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import { discountErrorReason } from "../../config/discountPolicy";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, resolveUserExplanation } from "../../utils/errors";
import { ServiceError } from "../../utils/errors";
import { DiscountsService } from "./discountsService";

const payloadSchema = z.object({
  mode: z.enum(["RETAIL", "WHOLESALE"]),
  customerId: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
  )
    .min(1),
  applyLoyaltySynergy: z.boolean().optional(),
  manualOverridePct: z.number().min(0).optional(),
  couponCode: z.string().optional(),
});

function localeFromRequest(req: any): string {
  const explicit = req.header("x-locale") ?? req.query?.locale ?? "";
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const acceptLanguage = String(req.header("accept-language") ?? "");
  const token = acceptLanguage.split(",")[0]?.trim();
  if (token) {
    return token;
  }
  return "en-US";
}

function computeWeakEtag(payload: unknown): string {
  const raw = JSON.stringify(payload);
  const digest = createHash("sha1").update(raw).digest("hex").slice(0, 16);
  return `W/"${digest}"`;
}

function withErrorHandling(handler: (req: any, res: any) => Promise<void> | void) {
  return async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (error) {
      const serviceError = asServiceError(error);
      const reason = discountErrorReason(serviceError.code, req.params?.tenantId, localeFromRequest(req));
      const explanation = resolveUserExplanation(serviceError.code);
      res.status(serviceError.statusCode).json({
        error: serviceError.code,
        message: serviceError.message,
        explanationCode: explanation?.explanationCode,
        explanationMessage: explanation?.explanationMessage,
        explanationSeverity: explanation?.explanationSeverity,
        reasonCode: reason?.code,
        reasonMessage: reason?.message,
      });
    }
  };
}

function parsePayload(body: unknown) {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", parsed.error.message, 400);
  }
  return parsed.data;
}

export function createDiscountsRouter(store: MemoryStore) {
  const service = new DiscountsService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/discounts/advanced/policy",
    requireTenantPathMatch(),
    requirePermission("discount.advanced.read"),
    withErrorHandling((req, res) => {
      const item = service.getPolicy(req.ctx, req.params.tenantId, localeFromRequest(req));
      const etag = computeWeakEtag({
        tenantId: req.params.tenantId,
        policyVersion: item.policyVersion,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
      });
      if (req.header("if-none-match") === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=120");
      res.json({ item });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/discounts/advanced/policy/preview",
    requireTenantPathMatch(),
    requirePermission("discount.advanced.read"),
    withErrorHandling((req, res) => {
      const item = service.getPolicy(req.ctx, req.params.tenantId, localeFromRequest(req));
      const payload = {
        preview: true,
        active: item.active,
        policyVersion: item.policyVersion,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        order: item.order,
        caps: item.caps,
        conflictRules: item.conflictRules,
        reasonCodes: item.reasonCodes,
        changeImpactTemplate: item.changeImpactTemplate,
      };
      const etag = computeWeakEtag(payload);
      if (req.header("if-none-match") === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=120");
      res.json({ item: payload });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/discounts/advanced/evaluate",
    requireTenantPathMatch(),
    requirePermission("discount.advanced.read"),
    withErrorHandling((req, res) => {
      const input = parsePayload(req.body);
      res.json({ item: service.evaluate(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/discounts/advanced/apply",
    requireTenantPathMatch(),
    requirePermission("discount.advanced.apply"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      const input = parsePayload(req.body);
      res.status(201).json({ item: service.apply(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/discounts/advanced/history",
    requireTenantPathMatch(),
    requirePermission("discount.advanced.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listHistory(req.ctx, req.params.tenantId) });
    }),
  );

  return router;
}
