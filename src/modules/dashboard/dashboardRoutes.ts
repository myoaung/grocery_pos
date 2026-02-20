import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError, asServiceError } from "../../utils/errors";
import { DashboardService } from "./dashboardService";

const branchCreateSchema = z.object({
  branchCode: z.string().min(1),
  branchName: z.string().min(1),
});

const branchUpdateSchema = z.object({
  branchCode: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const userCreateSchema = z.object({
  email: z.string().email(),
  role: z.string().min(1),
  branchId: z.string().min(1),
});

const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  branchId: z.string().min(1).optional(),
});

const userStatusSchema = z.object({
  isActive: z.boolean(),
});

const userRoleSchema = z.object({
  role: z.string().min(1),
});

const brandUpdateSchema = z.object({
  tenantName: z.string().min(1).optional(),
  logoText: z.string().min(1).optional(),
  primary: z.string().min(3).optional(),
  accent: z.string().min(3).optional(),
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

export function createDashboardRouter(store: MemoryStore) {
  const service = new DashboardService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants",
    requirePermission("tenant.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listTenants(req.ctx) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/branches",
    requireTenantPathMatch(),
    requirePermission("branch.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listBranches(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/branches",
    requireTenantPathMatch(),
    requirePermission("branch.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(branchCreateSchema, req.body);
      res.status(201).json({ item: service.createBranch(req.ctx, req.params.tenantId, body) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/branches/:branchId",
    requireTenantPathMatch(),
    requirePermission("branch.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(branchUpdateSchema, req.body);
      res.json({ item: service.updateBranch(req.ctx, req.params.tenantId, req.params.branchId, body) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/users",
    requireTenantPathMatch(),
    requirePermission("user.read"),
    withErrorHandling((req, res) => {
      res.json({ items: service.listUsers(req.ctx, req.params.tenantId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/users",
    requireTenantPathMatch(),
    requirePermission("user.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(userCreateSchema, req.body);
      res.status(201).json({ item: service.createUser(req.ctx, req.params.tenantId, body) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/users/:userId",
    requireTenantPathMatch(),
    requirePermission("user.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(userUpdateSchema, req.body);
      res.json({ item: service.updateUser(req.ctx, req.params.tenantId, req.params.userId, body) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/users/:userId/status",
    requireTenantPathMatch(),
    requirePermission("user.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(userStatusSchema, req.body);
      res.json({ item: service.setUserStatus(req.ctx, req.params.tenantId, req.params.userId, body.isActive) });
    }),
  );

  router.patch(
    "/api/v1/tenants/:tenantId/users/:userId/role",
    requireTenantPathMatch(),
    requirePermission("user.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(userRoleSchema, req.body);
      res.json({ item: service.setUserRole(req.ctx, req.params.tenantId, req.params.userId, body.role) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/dashboard/kpis",
    requireTenantPathMatch(),
    requirePermission("dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({ item: service.getKpis(req.ctx, req.params.tenantId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/dashboard/charts/:metric",
    requireTenantPathMatch(),
    requirePermission("dashboard.read"),
    withErrorHandling((req, res) => {
      res.json({
        metric: req.params.metric,
        items: service.getChartSeries(req.ctx, req.params.tenantId, req.params.metric),
      });
    }),
  );

  router.patch(
    "/api/v1/config/brand/tenant/:tenantId",
    requireTenantPathMatch(),
    requirePermission("brand.write"),
    withErrorHandling((req, res) => {
      const body = parseJsonBody(brandUpdateSchema, req.body);
      res.json({ brand: service.updateTenantBrand(req.ctx, req.params.tenantId, body) });
    }),
  );

  return router;
}
