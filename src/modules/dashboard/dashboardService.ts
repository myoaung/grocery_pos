import { randomUUID } from "crypto";
import type { MemoryStore } from "../../store/memoryStore";
import type { DashboardKpi, DashboardSeriesPoint, RequestContext, Role } from "../../types";
import { ServiceError } from "../../utils/errors";
import { assertBranchForTenant, assertRole } from "../../utils/keys";

interface CreateBranchInput {
  branchCode: string;
  branchName: string;
}

interface UpdateBranchInput {
  branchCode?: string;
  branchName?: string;
  isActive?: boolean;
}

interface CreateUserInput {
  email: string;
  role: string;
  branchId: string;
}

interface UpdateUserInput {
  email?: string;
  branchId?: string;
}

interface BrandUpdateInput {
  tenantName?: string;
  logoText?: string;
  primary?: string;
  accent?: string;
}

function toRole(value: string): Role {
  try {
    return assertRole(value);
  } catch {
    throw new ServiceError("INVALID_ROLE", `Invalid role: ${value}`, 400);
  }
}

export class DashboardService {
  constructor(private readonly store: MemoryStore) {}

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertCanManageBranch(ctx: RequestContext): void {
    if (!["APPLICATION_OWNER", "TENANT_OWNER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Branch management requires owner role", 403);
    }
  }

  private assertCanManageUser(ctx: RequestContext, targetRole: Role): void {
    if (ctx.role === "MANAGER" && ["APPLICATION_OWNER", "TENANT_OWNER"].includes(targetRole)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Manager cannot create or assign owner roles", 403);
    }
    if (ctx.role === "TENANT_OWNER" && targetRole === "APPLICATION_OWNER") {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Tenant owner cannot assign application owner role", 403);
    }
  }

  listTenants(ctx: RequestContext) {
    if (ctx.role === "APPLICATION_OWNER") {
      return this.store.tenants;
    }
    return this.store.tenants.filter((tenant) => tenant.tenantId === ctx.tenantId);
  }

  listBranches(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.branches.filter((branch) => branch.tenantId === tenantId);
  }

  createBranch(ctx: RequestContext, tenantId: string, input: CreateBranchInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertCanManageBranch(ctx);

    const duplicateCode = this.store.branches.some(
      (branch) => branch.tenantId === tenantId && branch.branchCode.toLowerCase() === input.branchCode.toLowerCase(),
    );
    if (duplicateCode) {
      throw new ServiceError("DUPLICATE_BRANCH_CODE", "Branch code already exists in tenant", 409);
    }

    const branchId = `branch-${tenantId}-${randomUUID().slice(0, 8)}`;
    const branch = {
      branchId,
      tenantId,
      branchCode: input.branchCode,
      branchName: input.branchName,
      isActive: true,
    };

    this.store.branches.push(branch);
    this.store.addAudit({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/branches",
      method: "POST",
      decision: "ALLOW",
      reason: "BRANCH_CREATE",
      actionType: "BRANCH_CREATE",
    });
    return branch;
  }

  updateBranch(ctx: RequestContext, tenantId: string, branchId: string, input: UpdateBranchInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertCanManageBranch(ctx);

    const branch = assertBranchForTenant(this.store.branches, branchId, tenantId);
    if (input.branchCode && input.branchCode !== branch.branchCode) {
      const duplicateCode = this.store.branches.some(
        (item) => item.tenantId === tenantId && item.branchId !== branchId && item.branchCode === input.branchCode,
      );
      if (duplicateCode) {
        throw new ServiceError("DUPLICATE_BRANCH_CODE", "Branch code already exists in tenant", 409);
      }
    }

    Object.assign(branch, input);
    this.store.addAudit({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/branches/:branchId",
      method: "PATCH",
      decision: "ALLOW",
      reason: "BRANCH_UPDATE",
      actionType: "BRANCH_UPDATE",
    });
    return branch;
  }

  listUsers(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.users.filter((user) => user.tenantId === tenantId);
  }

  createUser(ctx: RequestContext, tenantId: string, input: CreateUserInput) {
    this.assertTenantScope(ctx, tenantId);
    const role = toRole(input.role);
    this.assertCanManageUser(ctx, role);

    assertBranchForTenant(this.store.branches, input.branchId, tenantId);
    const user = {
      userId: `u-${randomUUID().slice(0, 8)}`,
      tenantId,
      branchId: input.branchId,
      role,
      email: input.email.toLowerCase(),
      isActive: true,
    };

    const duplicateEmail = this.store.users.some((existing) => existing.tenantId === tenantId && existing.email === user.email);
    if (duplicateEmail) {
      throw new ServiceError("DUPLICATE_USER_EMAIL", "User email already exists in tenant", 409);
    }

    this.store.users.push(user);
    this.store.userBranchAccess.push({
      userId: user.userId,
      tenantId,
      branchId: input.branchId,
    });

    this.store.addAudit({
      tenantId,
      branchId: input.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/users",
      method: "POST",
      decision: "ALLOW",
      reason: "USER_CREATE",
      actionType: "USER_CREATE",
    });
    return user;
  }

  updateUser(ctx: RequestContext, tenantId: string, userId: string, input: UpdateUserInput) {
    this.assertTenantScope(ctx, tenantId);
    const user = this.store.users.find((item) => item.userId === userId && item.tenantId === tenantId);
    if (!user) {
      throw new ServiceError("USER_NOT_FOUND", "User not found", 404);
    }

    if (input.branchId) {
      assertBranchForTenant(this.store.branches, input.branchId, tenantId);
      user.branchId = input.branchId;
      if (!this.store.userHasBranchAccess(user.userId, tenantId, input.branchId)) {
        this.store.userBranchAccess.push({
          userId: user.userId,
          tenantId,
          branchId: input.branchId,
        });
      }
    }

    if (input.email) {
      const normalized = input.email.toLowerCase();
      const duplicateEmail = this.store.users.some(
        (existing) => existing.tenantId === tenantId && existing.userId !== user.userId && existing.email === normalized,
      );
      if (duplicateEmail) {
        throw new ServiceError("DUPLICATE_USER_EMAIL", "User email already exists in tenant", 409);
      }
      user.email = normalized;
    }

    this.store.addAudit({
      tenantId,
      branchId: user.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/users/:userId",
      method: "PATCH",
      decision: "ALLOW",
      reason: "USER_UPDATE",
      actionType: "USER_UPDATE",
    });
    return user;
  }

  setUserStatus(ctx: RequestContext, tenantId: string, userId: string, active: boolean) {
    this.assertTenantScope(ctx, tenantId);
    const user = this.store.users.find((item) => item.userId === userId && item.tenantId === tenantId);
    if (!user) {
      throw new ServiceError("USER_NOT_FOUND", "User not found", 404);
    }

    user.isActive = active;
    this.store.addAudit({
      tenantId,
      branchId: user.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/users/:userId/status",
      method: "PATCH",
      decision: "ALLOW",
      reason: `USER_STATUS_${active ? "ACTIVE" : "INACTIVE"}`,
      actionType: "USER_STATUS",
    });
    return user;
  }

  setUserRole(ctx: RequestContext, tenantId: string, userId: string, nextRoleRaw: string) {
    this.assertTenantScope(ctx, tenantId);
    const nextRole = toRole(nextRoleRaw);
    this.assertCanManageUser(ctx, nextRole);

    const user = this.store.users.find((item) => item.userId === userId && item.tenantId === tenantId);
    if (!user) {
      throw new ServiceError("USER_NOT_FOUND", "User not found", 404);
    }

    this.assertCanManageUser(ctx, user.role);
    user.role = nextRole;
    this.store.addAudit({
      tenantId,
      branchId: user.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/users/:userId/role",
      method: "PATCH",
      decision: "ALLOW",
      reason: "USER_ROLE_CHANGE",
      actionType: "USER_ROLE_CHANGE",
    });
    return user;
  }

  updateTenantBrand(ctx: RequestContext, tenantId: string, input: BrandUpdateInput) {
    this.assertTenantScope(ctx, tenantId);
    if (!["APPLICATION_OWNER", "TENANT_OWNER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Brand update requires owner role", 403);
    }

    const brand = this.store.tenantBrands.get(tenantId);
    if (!brand) {
      throw new ServiceError("TENANT_BRAND_NOT_FOUND", "Tenant brand not found", 404);
    }

    const next = {
      tenantName: input.tenantName ?? brand.tenantName,
      logoText: input.logoText ?? brand.logoText,
      primary: input.primary ?? brand.primary,
      accent: input.accent ?? brand.accent,
    };

    this.store.tenantBrands.set(tenantId, next);
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/config/brand/tenant/:tenantId",
      method: "PATCH",
      decision: "ALLOW",
      reason: "TENANT_BRAND_UPDATE",
      actionType: "TENANT_BRAND_UPDATE",
    });
    return next;
  }

  getKpis(ctx: RequestContext, tenantId: string): DashboardKpi {
    this.assertTenantScope(ctx, tenantId);
    const today = new Date().toISOString().slice(0, 10);
    const branchSales = this.store.sales.filter(
      (sale) => sale.tenantId === tenantId && sale.branchId === ctx.branchId && sale.createdAt.slice(0, 10) === today,
    );

    const lowStockCount = this.store.products
      .filter((product) => product.tenantId === tenantId)
      .filter((product) => this.store.getStock(tenantId, ctx.branchId, product.productId) <= product.stockAlert).length;

    const customerCount = this.store.customers.filter(
      (customer) => customer.tenantId === tenantId && customer.branchId === ctx.branchId,
    ).length;

    const loyaltyMemberCount = this.store.customers.filter(
      (customer) => customer.tenantId === tenantId && customer.branchId === ctx.branchId && customer.currentPoints > 0,
    ).length;

    const salesTotal = branchSales.reduce((acc, sale) => acc + sale.netTotal, 0);
    const receiptCount = branchSales.length;
    const avgReceipt = receiptCount > 0 ? Number((salesTotal / receiptCount).toFixed(2)) : 0;

    return {
      tenantId,
      branchId: ctx.branchId,
      salesToday: Number(salesTotal.toFixed(2)),
      receiptsToday: receiptCount,
      avgReceipt,
      lowStockCount,
      customerCount,
      loyaltyMemberCount,
      openConflictCount: this.store.conflicts.filter(
        (conflict) => conflict.tenantId === tenantId && conflict.branchId === ctx.branchId && conflict.resolutionStatus === "OPEN",
      ).length,
      pendingQueueCount: this.store.queue.filter(
        (item) => item.tenantId === tenantId && item.branchId === ctx.branchId && ["PENDING", "FAILED"].includes(item.state),
      ).length,
    };
  }

  getChartSeries(ctx: RequestContext, tenantId: string, metric: string): DashboardSeriesPoint[] {
    this.assertTenantScope(ctx, tenantId);
    const allowed = new Set(["sales", "inventory", "customers"]);
    if (!allowed.has(metric)) {
      throw new ServiceError("INVALID_DASHBOARD_METRIC", "Allowed metrics: sales, inventory, customers", 400);
    }

    const key = `${tenantId}:${ctx.branchId}:${metric}`;
    const cached = this.store.dashboardSnapshots.get(key);
    if (cached) {
      return cached;
    }

    if (metric === "sales") {
      return [
        { label: "08:00", value: 0 },
        { label: "10:00", value: 0 },
        { label: "12:00", value: 0 },
        { label: "14:00", value: 0 },
        { label: "16:00", value: 0 },
      ];
    }

    if (metric === "inventory") {
      return this.store.products
        .filter((product) => product.tenantId === tenantId)
        .map((product) => ({
          label: product.category,
          value: this.store.getStock(tenantId, ctx.branchId, product.productId),
        }));
    }

    return [
      { label: "New", value: this.store.customers.filter((customer) => customer.tenantId === tenantId).length },
      { label: "Returning", value: this.store.customers.filter((customer) => customer.tenantId === tenantId && customer.visitCount > 0).length },
      {
        label: "Loyalty",
        value: this.store.customers.filter((customer) => customer.tenantId === tenantId && customer.currentPoints > 0).length,
      },
    ];
  }
}
