import type { Request } from "express";
import { z } from "zod";
import type { RequestContext, Role } from "../types";

const roleSchema = z.enum([
  "APPLICATION_OWNER",
  "TENANT_OWNER",
  "MANAGER",
  "CASHIER",
  "INVENTORY_STAFF",
]);

export function readContextFromHeaders(req: Request): RequestContext {
  const userId = req.header("x-user-id")?.trim();
  const roleRaw = req.header("x-role")?.trim();
  const tenantId = req.header("x-tenant-id")?.trim();
  const branchId = req.header("x-branch-id")?.trim();

  if (!userId || !roleRaw || !tenantId || !branchId) {
    throw new Error("MISSING_CONTEXT");
  }

  const role = roleSchema.parse(roleRaw) as Role;
  return {
    userId,
    role,
    tenantId,
    branchId,
  };
}