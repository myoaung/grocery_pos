import { randomUUID } from "crypto";
import type { RequestContext } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";
import { PluginRegistry } from "./pluginRegistry";
import type { PaymentChargeRequest } from "./types";

interface RegisterPluginInput {
  pluginId: string;
  pluginType: "PAYMENT" | "MARKETPLACE";
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export class PluginService {
  constructor(
    private readonly store: MemoryStore,
    private readonly registry: PluginRegistry,
  ) {}

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  listAvailable() {
    return this.registry.listPaymentPlugins().map((plugin) => ({
      pluginId: plugin.pluginId,
      pluginType: plugin.pluginType,
      version: plugin.version,
      displayName: plugin.displayName,
      description: plugin.description,
    }));
  }

  listTenantRegistrations(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.pluginRegistrations.filter((registration) => registration.tenantId === tenantId);
  }

  registerForTenant(ctx: RequestContext, tenantId: string, input: RegisterPluginInput) {
    this.assertTenantScope(ctx, tenantId);
    if (!["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Plugin registration requires manager or owner role", 403);
    }

    if (input.pluginType !== "PAYMENT") {
      throw new ServiceError("PLUGIN_TYPE_NOT_SUPPORTED", "Only PAYMENT plugins are enabled in this phase", 400);
    }

    const plugin = this.registry.resolvePaymentPlugin(input.pluginId);
    if (!plugin) {
      throw new ServiceError("PLUGIN_NOT_FOUND", "Plugin not found", 404);
    }

    const existing = this.store.pluginRegistrations.find(
      (registration) => registration.tenantId === tenantId && registration.pluginId === input.pluginId,
    );

    if (existing) {
      existing.enabled = input.enabled ?? true;
      existing.config = input.config ?? existing.config;
      existing.updatedAt = this.store.nowIso();
      this.store.addAudit({
        tenantId,
        branchId: ctx.branchId,
        actorUserId: ctx.userId,
        roleAtTime: ctx.role,
        endpoint: "/api/v1/tenants/:tenantId/plugins/register",
        method: "POST",
        decision: "ALLOW",
        reason: "PLUGIN_REGISTRATION_UPDATE",
        actionType: "PLUGIN_REGISTER",
      });
      return existing;
    }

    const registration = {
      registrationId: randomUUID(),
      tenantId,
      pluginId: input.pluginId,
      pluginType: input.pluginType,
      enabled: input.enabled ?? true,
      config: input.config ?? {},
      createdBy: ctx.userId,
      createdAt: this.store.nowIso(),
      updatedAt: this.store.nowIso(),
    };
    this.store.pluginRegistrations.push(registration);

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/plugins/register",
      method: "POST",
      decision: "ALLOW",
      reason: "PLUGIN_REGISTRATION_CREATE",
      actionType: "PLUGIN_REGISTER",
    });
    return registration;
  }

  charge(ctx: RequestContext, tenantId: string, pluginId: string, payload: PaymentChargeRequest) {
    this.assertTenantScope(ctx, tenantId);

    const registration = this.store.pluginRegistrations.find(
      (item) => item.tenantId === tenantId && item.pluginId === pluginId && item.enabled,
    );
    if (!registration) {
      throw new ServiceError("PLUGIN_NOT_REGISTERED", "Plugin is not registered for tenant", 403);
    }

    const plugin = this.registry.resolvePaymentPlugin(pluginId);
    if (!plugin) {
      throw new ServiceError("PLUGIN_NOT_FOUND", "Plugin not found", 404);
    }

    const result = plugin.charge(
      {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        role: ctx.role,
      },
      payload,
    );

    const execution = {
      executionId: randomUUID(),
      tenantId,
      branchId: ctx.branchId,
      pluginId,
      operation: "PAYMENT_CHARGE",
      status: result.status === "APPROVED" ? ("SUCCESS" as const) : ("FAILED" as const),
      actorUserId: ctx.userId,
      requestRef: payload.orderRef,
      responseCode: result.responseCode,
      message: result.message,
      createdAt: this.store.nowIso(),
    };

    this.store.pluginExecutionLogs.push(execution);
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/plugins/:pluginId/payments/charge",
      method: "POST",
      decision: result.status === "APPROVED" ? "ALLOW" : "DENY",
      reason: `PLUGIN_PAYMENT_${result.responseCode}`,
      actionType: "PLUGIN_PAYMENT_CHARGE",
    });

    return {
      execution,
      result,
    };
  }
}
