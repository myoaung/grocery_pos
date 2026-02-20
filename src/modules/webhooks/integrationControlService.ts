import { createHash, randomUUID, timingSafeEqual } from "crypto";
import type { RequestContext } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";

interface ClientInput {
  name: string;
  description?: string;
  allowedEventTypes?: string[];
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function previewToken(token: string): string {
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function safeEq(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export class IntegrationControlService {
  constructor(private readonly store: MemoryStore) {}

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "phase7_integration_control")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Phase 7 integration control plane is disabled", 409);
  }

  private assertWriteRole(ctx: RequestContext): void {
    if (!["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Integration control requires manager or owner role", 403);
    }
  }

  private sanitize(client: ReturnType<MemoryStore["upsertIntegrationClient"]>) {
    return {
      clientId: client.clientId,
      tenantId: client.tenantId,
      branchId: client.branchId,
      name: client.name,
      description: client.description,
      tokenPreview: client.tokenPreview,
      allowedEventTypes: client.allowedEventTypes,
      enabled: client.enabled,
      killSwitch: client.killSwitch,
      createdBy: client.createdBy,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  list(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    return this.store.integrationClients
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((item) => this.sanitize(item));
  }

  create(ctx: RequestContext, tenantId: string, input: ClientInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertWriteRole(ctx);
    const token = `${randomUUID().replace(/-/g, "")}.${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const tokenDigest = hashToken(token);
    const client = this.store.upsertIntegrationClient({
      tenantId,
      branchId: ctx.branchId,
      name: input.name,
      description: input.description,
      tokenHash: tokenDigest,
      tokenPreview: previewToken(token),
      allowedEventTypes: [...new Set(input.allowedEventTypes ?? [])],
      enabled: true,
      killSwitch: false,
      createdBy: ctx.userId,
    });
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/clients",
      method: "POST",
      decision: "ALLOW",
      reason: `INTEGRATION_CLIENT_CREATED:${client.clientId}`,
      actionType: "INTEGRATION_CONTROL_PLANE",
    });
    return {
      item: this.sanitize(client),
      token,
    };
  }

  rotateToken(ctx: RequestContext, tenantId: string, clientId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertWriteRole(ctx);
    const existing = this.store.integrationClients.find(
      (item) => item.tenantId === tenantId && item.clientId === clientId,
    );
    if (!existing) {
      throw new ServiceError("INTEGRATION_CLIENT_NOT_FOUND", "Integration client not found", 404);
    }
    const token = `${randomUUID().replace(/-/g, "")}.${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const updated = this.store.upsertIntegrationClient({
      ...existing,
      clientId: existing.clientId,
      tokenHash: hashToken(token),
      tokenPreview: previewToken(token),
    });
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/clients/:clientId/rotate-token",
      method: "POST",
      decision: "ALLOW",
      reason: `INTEGRATION_CLIENT_TOKEN_ROTATED:${clientId}`,
      actionType: "INTEGRATION_CONTROL_PLANE",
    });
    return {
      item: this.sanitize(updated),
      token,
    };
  }

  setKillSwitch(ctx: RequestContext, tenantId: string, clientId: string, enabled: boolean) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertWriteRole(ctx);
    const existing = this.store.integrationClients.find(
      (item) => item.tenantId === tenantId && item.clientId === clientId,
    );
    if (!existing) {
      throw new ServiceError("INTEGRATION_CLIENT_NOT_FOUND", "Integration client not found", 404);
    }
    const updated = this.store.upsertIntegrationClient({
      ...existing,
      clientId: existing.clientId,
      killSwitch: enabled,
      enabled: enabled ? existing.enabled : existing.enabled,
    });
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/clients/:clientId/kill-switch",
      method: "PATCH",
      decision: "ALLOW",
      reason: `INTEGRATION_CLIENT_KILL_SWITCH:${clientId}:${enabled ? "ON" : "OFF"}`,
      actionType: "INTEGRATION_CONTROL_PLANE",
    });
    return this.sanitize(updated);
  }

  verifyToken(ctx: RequestContext, tenantId: string, clientId: string, token: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    const existing = this.store.integrationClients.find(
      (item) => item.tenantId === tenantId && item.clientId === clientId,
    );
    if (!existing) {
      throw new ServiceError("INTEGRATION_CLIENT_NOT_FOUND", "Integration client not found", 404);
    }
    const valid = safeEq(existing.tokenHash, hashToken(token));
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/clients/:clientId/token/verify",
      method: "GET",
      decision: valid ? "ALLOW" : "DENY",
      reason: `INTEGRATION_CLIENT_TOKEN_VERIFY:${clientId}:${valid ? "VALID" : "INVALID"}`,
      actionType: "INTEGRATION_CONTROL_PLANE",
    });
    return {
      clientId,
      valid,
    };
  }
}
