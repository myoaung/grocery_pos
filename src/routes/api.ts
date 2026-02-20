import { Router } from "express";
import { z } from "zod";
import { canAccessTenantReport } from "../config/permissions";
import type { PermissionAction } from "../config/permissions";
import { PERFORMANCE_BUDGET } from "../config/performanceBudget";
import { createAnalyticsRouter } from "../modules/analytics/analyticsRoutes";
import { createPredictiveActionsRouter } from "../modules/analytics/predictiveActionsRoutes";
import { createPredictiveRouter } from "../modules/analytics/predictiveRoutes";
import { createAdvancedReportRouter } from "../modules/advanced-reporting/advancedReportRoutes";
import { createComplianceRouter } from "../modules/compliance/complianceRoutes";
import { createDashboardRouter } from "../modules/dashboard/dashboardRoutes";
import { createDiscountsRouter } from "../modules/discounts/discountsRoutes";
import { createExportsRouter } from "../modules/exports/exportsRoutes";
import { createFeatureFlagRouter } from "../modules/feature-flags/featureFlagRoutes";
import { createLoyaltyRewardsRouter } from "../modules/loyalty-rewards/loyaltyRewardsRoutes";
import { createFiamRouter } from "../modules/notifications/fiamRoutes";
import { FiamService } from "../modules/notifications/fiamService";
import { NotificationTriggerService } from "../modules/notifications/triggerService";
import { createOfflineAutomationRouter } from "../modules/offline-automation/offlineAutomationRoutes";
import { createOfflineEnhancementsRouter } from "../modules/offline-enhancements/offlineEnhancementsRoutes";
import { createMetricsRouter } from "../modules/observability/metricsRoutes";
import { createPluginRouter } from "../modules/plugins/pluginRoutes";
import { createReportingExtensionsRouter } from "../modules/reporting-extensions/reportingExtensionsRoutes";
import { createRiskComplianceRouter } from "../modules/risk-compliance/riskComplianceRoutes";
import { createWebhookRouter } from "../modules/webhooks/webhookRoutes";
import type { ReportId } from "../types";
import { enforceReadOnlyFallback, requirePermission, requireTenantPathMatch } from "../middleware/auth";
import { PosService } from "../services/posService";
import { AuditService } from "../services/auditService";
import type { MemoryStore } from "../store/memoryStore";
import { ServiceError, asServiceError, resolveUserExplanation } from "../utils/errors";
import { toCsv, toPdfBuffer } from "../utils/export";

const queueSchema = z.object({
  eventType: z.enum(["SALE", "INVENTORY", "LOYALTY", "REPORT"]),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

const productSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().min(1),
  nameMm: z.string().min(1),
  nameEn: z.string().min(1),
  category: z.string().min(1),
  unitType: z.string().min(1),
  costPrice: z.number().nonnegative(),
  retailPrice: z.number().nonnegative(),
  wholesalePrice: z.number().nonnegative(),
  taxCategory: z.string().min(1),
  stockAlert: z.number().int().nonnegative(),
});

const inventorySchema = z.object({
  action: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "DAMAGE", "TRANSFER"]),
  productId: z.string().min(1),
  quantity: z.number().positive(),
  destinationBranchId: z.string().optional(),
  reason: z.string().optional(),
  offline: z.boolean().optional(),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

const checkoutSchema = z.object({
  mode: z.enum(["RETAIL", "WHOLESALE"]),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        manualDiscount: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
  customerId: z.string().optional(),
  offline: z.boolean().optional(),
  idempotencyKey: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

const loyaltySchema = z.object({
  customerId: z.string().min(1),
  points: z.number().int().positive(),
  reason: z.string().min(1),
});

const customerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
});

const customerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
});

const conflictSchema = z.object({
  note: z.string().min(1),
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

function ensureAction(action: PermissionAction) {
  return [requirePermission(action)];
}

export function createApiRouter(store: MemoryStore) {
  const service = new PosService(store);
  const auditService = new AuditService(store);
  const fiamService = new FiamService(store);
  new NotificationTriggerService(store, fiamService);
  const router = Router();

  router.use(createDashboardRouter(store));
  router.use(createAdvancedReportRouter(store));
  router.use(createAnalyticsRouter(store));
  router.use(createPredictiveActionsRouter(store));
  router.use(createPredictiveRouter(store));
  router.use(createDiscountsRouter(store));
  router.use(createComplianceRouter(store));
  router.use(createExportsRouter(store));
  router.use(createFeatureFlagRouter(store));
  router.use(createReportingExtensionsRouter(store));
  router.use(createRiskComplianceRouter(store));
  router.use(createWebhookRouter(store));
  router.use(createPluginRouter(store));
  router.use(createOfflineAutomationRouter(store));
  router.use(createOfflineEnhancementsRouter(store));
  router.use(createLoyaltyRewardsRouter(store));
  router.use(createFiamRouter(store, fiamService));
  router.use(createMetricsRouter(store));

  router.get(
    "/api/v1/auth/me",
    withErrorHandling((req, res) => {
      res.json({ context: req.ctx });
    }),
  );

  router.get(
    "/api/v1/risk/sessions",
    ...ensureAction("risk.read"),
    withErrorHandling((req, res) => {
      res.json({
        session: {
          tenantId: req.ctx.tenantId,
          branchId: req.ctx.branchId,
          userId: req.ctx.userId,
          role: req.ctx.role,
          mode: req.risk.mode,
          factors: req.risk.factors,
          source: req.risk.source,
          message: req.risk.message,
          readOnly: req.risk.mode === "READ_ONLY",
          blocked: req.risk.mode === "BLOCK",
        },
      });
    }),
  );

  router.get(
    "/api/v1/config/brand/app",
    withErrorHandling((req, res) => {
      res.json({ brand: req.store.appBrand });
    }),
  );

  router.get(
    "/api/v1/config/brand/tenant/:tenantId",
    requireTenantPathMatch(),
    withErrorHandling((req, res) => {
      const brand = req.store.tenantBrands.get(req.params.tenantId);
      if (!brand) {
        throw new ServiceError("TENANT_BRAND_NOT_FOUND", "Tenant brand not found", 404);
      }
      res.json({ brand });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/products",
    requireTenantPathMatch(),
    ...ensureAction("product.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ items: service.listProducts(req.ctx) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/products/:productId",
    requireTenantPathMatch(),
    ...ensureAction("product.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ item: service.getProduct(req.ctx, req.params.productId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/products",
    requireTenantPathMatch(),
    ...ensureAction("product.write"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(productSchema, req.body);
      res.status(201).json({ item: service.createProduct(req.ctx, body) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/products/:productId",
    requireTenantPathMatch(),
    ...ensureAction("product.write"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(productSchema.partial(), req.body);
      res.json({ item: service.updateProduct(req.ctx, req.params.productId, body) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/inventory/ledger",
    requireTenantPathMatch(),
    ...ensureAction("inventory.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const items = req.store.inventoryLogs.filter(
        (log: any) => log.tenantId === req.ctx.tenantId && log.branchId === req.ctx.branchId,
      );
      res.json({ items });
    }),
  );

  const inventoryEndpoint = (
    path: string,
    forceAction: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT" | "DAMAGE" | "TRANSFER" | null,
  ) => {
    router.post(
      path,
      requireTenantPathMatch(),
      ...ensureAction("inventory.mutate"),
      enforceReadOnlyFallback(),
      withErrorHandling((req, res) => {
        service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
        const body = parseJsonBody(inventorySchema, {
          ...req.body,
          action: forceAction ?? req.body?.action,
        });
        const result = service.applyInventoryAction(req.ctx, body);
        res.status(201).json(result);
      }),
    );
  };

  inventoryEndpoint("/api/v1/tenants/:tenantId/inventory/stock-in", "STOCK_IN");
  inventoryEndpoint("/api/v1/tenants/:tenantId/inventory/stock-out", "STOCK_OUT");
  inventoryEndpoint("/api/v1/tenants/:tenantId/inventory/adjustments", "ADJUSTMENT");
  inventoryEndpoint("/api/v1/tenants/:tenantId/inventory/damage", "DAMAGE");
  inventoryEndpoint("/api/v1/tenants/:tenantId/inventory/transfers", "TRANSFER");

  router.get(
    "/api/v1/tenants/:tenantId/sales",
    requireTenantPathMatch(),
    ...ensureAction("sales.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ items: service.listSales(req.ctx) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/sales/:saleId",
    requireTenantPathMatch(),
    ...ensureAction("sales.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ item: service.getSale(req.ctx, req.params.saleId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/sales/checkout",
    requireTenantPathMatch(),
    ...ensureAction("sales.checkout"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(checkoutSchema, req.body);
      const result = service.checkout(req.ctx, body);
      res.status(201).json(result);
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/sales/:saleId/void",
    requireTenantPathMatch(),
    ...ensureAction("sales.void"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ item: service.voidSale(req.ctx, req.params.saleId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/discounts/evaluate",
    requireTenantPathMatch(),
    ...ensureAction("discount.evaluate"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const discountPct = req.ctx.role === "MANAGER" ? 5 : 2;
      res.json({ discountPct, role: req.ctx.role });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/discounts/override",
    requireTenantPathMatch(),
    ...ensureAction("discount.override"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      req.store.addAudit({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        method: req.method,
        decision: "ALLOW",
        reason: "DISCOUNT_OVERRIDE",
        actionType: "DISCOUNT_OVERRIDE",
      });
      res.json({ accepted: true });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/sync/queue",
    requireTenantPathMatch(),
    ...ensureAction("queue.enqueue"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(queueSchema, req.body);
      const item = service.enqueueEvent(req.ctx, body);
      res.status(201).json({ item });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/sync/queue",
    requireTenantPathMatch(),
    ...ensureAction("queue.view"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ items: service.listQueue(req.ctx) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/sync/retry",
    requireTenantPathMatch(),
    ...ensureAction("queue.sync"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json(service.syncQueue(req.ctx));
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/conflicts",
    requireTenantPathMatch(),
    ...ensureAction("conflict.view"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ items: service.listConflicts(req.ctx) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/conflicts/:conflictId/resolve",
    requireTenantPathMatch(),
    ...ensureAction("conflict.resolve"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(conflictSchema, req.body);
      res.json({ item: service.resolveConflict(req.ctx, req.params.conflictId, body.note) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/conflicts/:conflictId/escalate",
    requireTenantPathMatch(),
    ...ensureAction("conflict.escalate"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(conflictSchema, req.body);
      res.json({ item: service.escalateConflict(req.ctx, req.params.conflictId, body.note) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/customers",
    requireTenantPathMatch(),
    ...ensureAction("customer.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      res.json({ items: service.listCustomers(req.ctx) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/customers",
    requireTenantPathMatch(),
    ...ensureAction("customer.write"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(customerCreateSchema, req.body);
      res.status(201).json({ item: service.createCustomer(req.ctx, body) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/customers/:customerId",
    requireTenantPathMatch(),
    ...ensureAction("customer.write"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(customerUpdateSchema, req.body);
      res.json({ item: service.updateCustomer(req.ctx, req.params.customerId, body) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/loyalty/ledger",
    requireTenantPathMatch(),
    ...ensureAction("loyalty.read"),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const items = req.store.loyaltyLedger.filter(
        (entry: any) => entry.tenantId === req.ctx.tenantId && entry.branchId === req.ctx.branchId,
      );
      res.json({ items });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/loyalty/redeem",
    requireTenantPathMatch(),
    ...ensureAction("loyalty.redeem"),
    enforceReadOnlyFallback(),
    withErrorHandling((req, res) => {
      service.validateTenantRouteAccess(req.ctx, req.params.tenantId);
      const body = parseJsonBody(loyaltySchema, req.body);
      res.json({ item: service.loyaltyRedeem(req.ctx, body) });
    }),
  );

  router.get(
    "/api/v1/reports/tenant/:reportId",
    ...ensureAction("report.tenant"),
    withErrorHandling((req, res) => {
      const reportId = req.params.reportId as ReportId;
      if (!canAccessTenantReport(req.ctx.role, reportId, req.store.systemConfig.cashierCanViewProfit)) {
        throw new ServiceError("REPORT_NOT_ALLOWED", "Role cannot access requested report", 403);
      }
      service.validateTenantReportRole(req.ctx, reportId);
      res.json(service.getTenantReport(req.ctx, reportId));
    }),
  );

  router.get(
    "/api/v1/reports/tenant/:reportId/export",
    ...ensureAction("report.export"),
    withErrorHandling(async (req, res) => {
      const reportId = req.params.reportId as ReportId;
      if (!canAccessTenantReport(req.ctx.role, reportId, req.store.systemConfig.cashierCanViewProfit)) {
        throw new ServiceError("REPORT_NOT_ALLOWED", "Role cannot access requested report", 403);
      }
      service.validateTenantReportRole(req.ctx, reportId);
      const report = service.getTenantReport(req.ctx, reportId);
      const format = String(req.query.format ?? "csv").toLowerCase();
      if (format === "pdf") {
        const buffer = await toPdfBuffer(reportId, report.rows);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${reportId}.pdf`);
        res.send(buffer);
        return;
      }

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=${reportId}.csv`);
        res.send(toCsv(report.rows));
        return;
      }

      throw new ServiceError("INVALID_EXPORT_FORMAT", "Allowed formats: csv, pdf", 400);
    }),
  );

  router.get(
    "/api/v1/reports/owner/:reportId",
    ...ensureAction("report.owner"),
    withErrorHandling((req, res) => {
      const reportId = req.params.reportId as ReportId;
      service.validateOwnerReportRole(req.ctx);
      res.json(service.getOwnerReport(req.ctx, reportId));
    }),
  );

  router.get(
    "/api/v1/reports/owner/:reportId/export",
    ...ensureAction("report.owner"),
    withErrorHandling(async (req, res) => {
      const reportId = req.params.reportId as ReportId;
      service.validateOwnerReportRole(req.ctx);
      const report = service.getOwnerReport(req.ctx, reportId);
      const format = String(req.query.format ?? "csv").toLowerCase();

      if (format === "pdf") {
        const buffer = await toPdfBuffer(reportId, report.rows);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${reportId}.pdf`);
        res.send(buffer);
        return;
      }

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=${reportId}.csv`);
        res.send(toCsv(report.rows));
        return;
      }

      throw new ServiceError("INVALID_EXPORT_FORMAT", "Allowed formats: csv, pdf", 400);
    }),
  );

  router.get(
    "/api/v1/audit/logs",
    ...ensureAction("audit.read"),
    withErrorHandling((req, res) => {
      const items = auditService.listForContext(req.ctx);
      res.json({ items });
    }),
  );

  router.get(
    "/api/v1/audit/integrity",
    ...ensureAction("audit.read"),
    withErrorHandling((req, res) => {
      res.json({ item: auditService.integrityReport() });
    }),
  );

  router.get(
    "/api/v1/ops/slis",
    ...ensureAction("audit.read"),
    withErrorHandling((req, res) => {
      res.json({
        item: {
          runtimeEnv: PERFORMANCE_BUDGET.runtimeEnv,
          slos: PERFORMANCE_BUDGET.observability.slis,
        },
      });
    }),
  );

  router.get(
    "/api/v1/ops/metrics",
    ...ensureAction("audit.read"),
    withErrorHandling((req, res) => {
      const metricName = typeof req.query.metricName === "string" ? req.query.metricName : undefined;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
      const items = req.store.structuredMetrics
        .filter((item: any) => (metricName ? item.metricName === metricName : true))
        .filter((item: any) =>
          req.ctx.role === "APPLICATION_OWNER"
            ? true
            : item.tenantId === req.ctx.tenantId && item.branchId === req.ctx.branchId,
        )
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
      res.json({ items });
    }),
  );

  return router;
}
