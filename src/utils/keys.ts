import type { Branch, Product, Role, User } from "../types";

export function inventoryKey(tenantId: string, branchId: string, productId: string): string {
  return `${tenantId}:${branchId}:${productId}`;
}

export function sameTenantBranch(entity: { tenantId: string; branchId?: string }, tenantId: string, branchId?: string): boolean {
  if (entity.tenantId !== tenantId) {
    return false;
  }

  if (branchId && entity.branchId && entity.branchId !== branchId) {
    return false;
  }

  return true;
}

export function assertRole(value: string): Role {
  const roles: Role[] = ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"];
  if (!roles.includes(value as Role)) {
    throw new Error(`Invalid role: ${value}`);
  }
  return value as Role;
}

export function assertBranchForTenant(branches: Branch[], branchId: string, tenantId: string): Branch {
  const branch = branches.find((item) => item.branchId === branchId && item.tenantId === tenantId);
  if (!branch) {
    throw new Error("INVALID_BRANCH_SCOPE");
  }
  return branch;
}

export function assertProductForTenant(products: Product[], productId: string, tenantId: string): Product {
  const product = products.find((item) => item.productId === productId && item.tenantId === tenantId);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }
  return product;
}

export function assertUser(users: User[], userId: string): User {
  const user = users.find((item) => item.userId === userId && item.isActive);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }
  return user;
}