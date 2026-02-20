import { createHmac, randomUUID } from "crypto";
import type { RequestContext } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";

interface EndpointInput {
  name: string;
  url: string;
  eventTypes: string[];
  enabled?: boolean;
  secret?: string;
  integrationClientId?: string;
}

interface DispatchInput {
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  branchId?: string;
  simulateFailure?: boolean;
}

interface WebhookRateWindowState {
  windowStartedAtMs: number;
  requestCount: number;
}

interface WebhookCircuitState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  consecutiveFailures: number;
  openUntilMs: number;
}

export class WebhookService {
  private readonly signatureAlgorithm = "HMAC-SHA256";
  private readonly rateWindows = new Map<string, WebhookRateWindowState>();
  private readonly circuitStates = new Map<string, WebhookCircuitState>();
  private readonly rateLimitPerMinute = Math.max(1, Number(process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE ?? 5));
  private readonly rateLimitWindowMs = Math.max(1000, Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000));
  private readonly circuitFailureThreshold = Math.max(1, Number(process.env.WEBHOOK_CIRCUIT_FAILURE_THRESHOLD ?? 3));
  private readonly circuitCooldownMs = Math.max(1000, Number(process.env.WEBHOOK_CIRCUIT_COOLDOWN_MS ?? 30_000));

  constructor(private readonly store: MemoryStore) {}

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private assertEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "webhook_outbound")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Webhook outbound delivery is disabled for this tenant", 409);
  }

  private getCircuitState(tenantId: string): WebhookCircuitState {
    const existing = this.circuitStates.get(tenantId);
    if (existing) {
      return existing;
    }
    const initial: WebhookCircuitState = {
      state: "CLOSED",
      consecutiveFailures: 0,
      openUntilMs: 0,
    };
    this.circuitStates.set(tenantId, initial);
    return initial;
  }

  private assertRateLimit(ctx: RequestContext, tenantId: string, branchId: string): void {
    const now = Date.now();
    const current = this.rateWindows.get(tenantId);
    if (!current || now - current.windowStartedAtMs >= this.rateLimitWindowMs) {
      this.rateWindows.set(tenantId, {
        windowStartedAtMs: now,
        requestCount: 1,
      });
      return;
    }
    current.requestCount += 1;
    if (current.requestCount <= this.rateLimitPerMinute) {
      return;
    }
    this.store.addStructuredMetric({
      metricName: "webhook_rate_limited_count",
      metricUnit: "count",
      metricValue: 1,
      tenantId,
      branchId,
      tags: {
        actor: ctx.userId,
      },
      source: "SERVICE",
    });
    this.store.addStructuredMetric({
      metricName: "job_failure_count",
      metricUnit: "count",
      metricValue: 1,
      tenantId,
      branchId,
      tags: {
        jobType: "webhook_delivery",
        status: "RATE_LIMITED",
      },
      source: "SERVICE",
    });
    this.store.addAudit({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/dispatch",
      method: "POST",
      decision: "DENY",
      reason: "WEBHOOK_RATE_LIMITED",
      actionType: "WEBHOOK_DELIVERY",
    });
    throw new ServiceError("WEBHOOK_RATE_LIMITED", "Webhook dispatch rate limit exceeded for tenant window", 429);
  }

  private assertCircuitClosed(ctx: RequestContext, tenantId: string, branchId: string): void {
    const now = Date.now();
    const state = this.getCircuitState(tenantId);
    if (state.state === "OPEN") {
      if (now < state.openUntilMs) {
        this.store.addStructuredMetric({
          metricName: "webhook_circuit_open_count",
          metricUnit: "count",
          metricValue: 1,
          tenantId,
          branchId,
          tags: {
            actor: ctx.userId,
          },
          source: "SERVICE",
        });
        this.store.addAudit({
          tenantId,
          branchId,
          actorUserId: ctx.userId,
          roleAtTime: ctx.role,
          endpoint: "/api/v1/tenants/:tenantId/webhooks/dispatch",
          method: "POST",
          decision: "DENY",
          reason: "WEBHOOK_CIRCUIT_OPEN",
          actionType: "WEBHOOK_DELIVERY",
        });
        throw new ServiceError("WEBHOOK_CIRCUIT_OPEN", "Webhook circuit is open; dispatch temporarily blocked", 503);
      }
      state.state = "HALF_OPEN";
      state.consecutiveFailures = 0;
    }
  }

  private noteCircuitResult(tenantId: string, success: boolean): void {
    const state = this.getCircuitState(tenantId);
    if (success) {
      state.state = "CLOSED";
      state.consecutiveFailures = 0;
      state.openUntilMs = 0;
      return;
    }
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.circuitFailureThreshold) {
      state.state = "OPEN";
      state.openUntilMs = Date.now() + this.circuitCooldownMs;
    } else if (state.state === "HALF_OPEN") {
      state.state = "OPEN";
      state.openUntilMs = Date.now() + this.circuitCooldownMs;
    }
  }

  private emitWebhookJobMetrics(
    tenantId: string,
    branchId: string,
    input: { durationMs: number; retries: number; failures: number; status: string },
  ): void {
    this.store.addStructuredMetric({
      metricName: "job_duration_ms",
      metricUnit: "ms",
      metricValue: input.durationMs,
      tenantId,
      branchId,
      tags: {
        jobType: "webhook_delivery",
        status: input.status,
      },
      source: "SERVICE",
    });
    this.store.addStructuredMetric({
      metricName: "job_retry_count",
      metricUnit: "count",
      metricValue: input.retries,
      tenantId,
      branchId,
      tags: {
        jobType: "webhook_delivery",
        status: input.status,
      },
      source: "SERVICE",
    });
    this.store.addStructuredMetric({
      metricName: "job_failure_count",
      metricUnit: "count",
      metricValue: input.failures,
      tenantId,
      branchId,
      tags: {
        jobType: "webhook_delivery",
        status: input.status,
      },
      source: "SERVICE",
    });
  }

  private sign(secret: string, body: string): string {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  private verify(secret: string, body: string, signature: string): boolean {
    return this.sign(secret, body) === signature;
  }

  listEndpoints(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    return this.store.webhookEndpoints
      .filter((item) => item.tenantId === tenantId)
      .map((item) => ({
        ...item,
        secret: "redacted",
      }));
  }

  upsertEndpoint(ctx: RequestContext, tenantId: string, input: EndpointInput, endpointId?: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    if (!input.url.startsWith("https://")) {
      throw new ServiceError("INVALID_WEBHOOK_URL", "Webhook endpoint must use https://", 400);
    }
    if (!Array.isArray(input.eventTypes) || input.eventTypes.length === 0) {
      throw new ServiceError("INVALID_WEBHOOK_EVENT_TYPES", "At least one event type is required", 400);
    }
    if (input.integrationClientId) {
      const client = this.store.integrationClients.find(
        (item) => item.tenantId === tenantId && item.clientId === input.integrationClientId,
      );
      if (!client) {
        throw new ServiceError("INTEGRATION_CLIENT_NOT_FOUND", "Integration client not found", 404);
      }
      if (client.killSwitch) {
        throw new ServiceError("INTEGRATION_CLIENT_KILL_SWITCH_ACTIVE", "Integration client kill-switch is active", 409);
      }
    }
    const endpoint = this.store.upsertWebhookEndpoint({
      endpointId,
      tenantId,
      branchId: ctx.branchId,
      integrationClientId: input.integrationClientId,
      name: input.name,
      url: input.url,
      eventTypes: [...new Set(input.eventTypes)],
      enabled: input.enabled ?? true,
      secret: input.secret ?? randomUUID().replace(/-/g, ""),
      createdBy: ctx.userId,
    });
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/endpoints",
      method: endpointId ? "PATCH" : "POST",
      decision: "ALLOW",
      reason: `WEBHOOK_ENDPOINT_UPSERT:${endpoint.endpointId}`,
      actionType: "WEBHOOK_ENDPOINT_UPSERT",
    });
    return {
      ...endpoint,
      secret: "redacted",
    };
  }

  private dispatchSingle(
    ctx: RequestContext,
    tenantId: string,
    branchId: string,
    endpoint: { endpointId: string; secret: string; url: string },
    input: DispatchInput,
  ) {
    const dedupeKey = `${tenantId}:${endpoint.endpointId}:${input.idempotencyKey}`;
    if (this.store.webhookDeliveryIdempotency.has(dedupeKey)) {
      const existing = this.store.webhookDeliveries.find(
        (item) =>
          item.tenantId === tenantId &&
          item.endpointId === endpoint.endpointId &&
          item.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        return existing;
      }
    }

    const body = JSON.stringify({
      tenantId,
      branchId,
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
    });
    const signature = this.sign(endpoint.secret, body);

    const delivery = this.store.addWebhookDelivery({
      tenantId,
      branchId,
      endpointId: endpoint.endpointId,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      signature,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
    });
    this.store.webhookDeliveryIdempotency.add(dedupeKey);

    return this.attemptDelivery(ctx, endpoint.secret, endpoint.url, delivery.deliveryId, Boolean(input.simulateFailure));
  }

  private attemptDelivery(
    ctx: RequestContext,
    secret: string,
    url: string,
    deliveryId: string,
    simulateFailure: boolean,
  ) {
    const startedAtMs = Date.now();
    const delivery = this.store.webhookDeliveries.find((item) => item.deliveryId === deliveryId);
    if (!delivery) {
      throw new ServiceError("WEBHOOK_DELIVERY_NOT_FOUND", "Webhook delivery not found", 404);
    }

    const nextAttempts = delivery.attempts + 1;
    const payloadBody = JSON.stringify({
      tenantId: delivery.tenantId,
      branchId: delivery.branchId,
      eventType: delivery.eventType,
      payload: delivery.payload,
      idempotencyKey: delivery.idempotencyKey,
    });
    const signatureValid = this.verify(secret, payloadBody, delivery.signature);
    const forcedFailure = simulateFailure || url.includes("fail");

    if (!signatureValid) {
      const failed = this.store.updateWebhookDelivery(deliveryId, {
        attempts: nextAttempts,
        status: "FAILED",
        responseCode: 498,
        responseBody: "signature_verification_failed",
      });
      this.store.addAudit({
        tenantId: failed.tenantId,
        branchId: failed.branchId,
        actorUserId: ctx.userId,
        roleAtTime: ctx.role,
        endpoint: "/api/v1/tenants/:tenantId/webhooks/dispatch",
        method: "POST",
        decision: "DENY",
        reason: "WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
        actionType: "WEBHOOK_DELIVERY",
      });
      this.noteCircuitResult(failed.tenantId, false);
      this.emitWebhookJobMetrics(failed.tenantId, failed.branchId, {
        durationMs: Date.now() - startedAtMs,
        retries: 0,
        failures: 1,
        status: "FAILED",
      });
      return failed;
    }

    if (forcedFailure) {
      const shouldRetry = nextAttempts < delivery.maxAttempts;
      const updated = this.store.updateWebhookDelivery(deliveryId, {
        attempts: nextAttempts,
        status: shouldRetry ? "RETRYING" : "FAILED",
        responseCode: 503,
        responseBody: "simulated_delivery_failure",
        nextRetryAt: shouldRetry ? new Date(Date.now() + 30 * 1000).toISOString() : undefined,
      });
      this.noteCircuitResult(updated.tenantId, false);
      this.emitWebhookJobMetrics(updated.tenantId, updated.branchId, {
        durationMs: Date.now() - startedAtMs,
        retries: shouldRetry ? 1 : 0,
        failures: 1,
        status: shouldRetry ? "RETRYING" : "FAILED",
      });
      return updated;
    }

    const delivered = this.store.updateWebhookDelivery(deliveryId, {
      attempts: nextAttempts,
      status: "DELIVERED",
      responseCode: 202,
      responseBody: "accepted",
      nextRetryAt: undefined,
    });
    this.store.addAudit({
      tenantId: delivered.tenantId,
      branchId: delivered.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/webhooks/dispatch",
      method: "POST",
      decision: "ALLOW",
      reason: `WEBHOOK_DELIVERED:${delivered.endpointId}:${delivered.eventType}`,
      actionType: "WEBHOOK_DELIVERY",
    });
    this.noteCircuitResult(delivered.tenantId, true);
    this.emitWebhookJobMetrics(delivered.tenantId, delivered.branchId, {
      durationMs: Date.now() - startedAtMs,
      retries: 0,
      failures: 0,
      status: "DELIVERED",
    });
    return delivered;
  }

  dispatch(ctx: RequestContext, tenantId: string, input: DispatchInput) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
      throw new ServiceError("INVALID_IDEMPOTENCY_KEY", "idempotencyKey must be a UUID", 400);
    }
    const branchId = input.branchId ?? ctx.branchId;
    this.assertRateLimit(ctx, tenantId, branchId);
    this.assertCircuitClosed(ctx, tenantId, branchId);
    const endpoints = this.store.webhookEndpoints
      .filter((item) => item.tenantId === tenantId && item.enabled)
      .filter((item) => item.eventTypes.includes(input.eventType))
      .filter((item) => {
        if (!item.integrationClientId) {
          return true;
        }
        const client = this.store.integrationClients.find(
          (candidate) => candidate.tenantId === tenantId && candidate.clientId === item.integrationClientId,
        );
        if (!client) {
          return false;
        }
        if (!client.enabled || client.killSwitch) {
          return false;
        }
        if (client.allowedEventTypes.length > 0 && !client.allowedEventTypes.includes(input.eventType)) {
          return false;
        }
        return true;
      });
    if (endpoints.length === 0) {
      throw new ServiceError(
        "WEBHOOK_ENDPOINT_NOT_FOUND",
        "No enabled webhook endpoint for this event type (or control-plane kill-switch active)",
        404,
      );
    }

    const deliveries = endpoints.map((endpoint) =>
      this.dispatchSingle(ctx, tenantId, branchId, endpoint, input),
    );
    return {
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      outboundOnly: true,
      deliveries,
    };
  }

  retryDue(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    this.assertRateLimit(ctx, tenantId, ctx.branchId);
    this.assertCircuitClosed(ctx, tenantId, ctx.branchId);
    const now = Date.now();
    const due = this.store.webhookDeliveries
      .filter((item) => item.tenantId === tenantId && item.status === "RETRYING")
      .filter((item) => (item.nextRetryAt ? Date.parse(item.nextRetryAt) <= now : false));
    const retried = due.map((delivery) => {
      const endpoint = this.store.webhookEndpoints.find((item) => item.endpointId === delivery.endpointId);
      if (!endpoint) {
        return this.store.updateWebhookDelivery(delivery.deliveryId, {
          status: "FAILED",
          responseCode: 404,
          responseBody: "endpoint_not_found",
        });
      }
      return this.attemptDelivery(ctx, endpoint.secret, endpoint.url, delivery.deliveryId, false);
    });
    return {
      retriedCount: retried.length,
      items: retried,
    };
  }

  listDeliveries(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    return this.store.webhookDeliveries
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  verifyDelivery(ctx: RequestContext, tenantId: string, deliveryId: string) {
    this.assertTenantScope(ctx, tenantId);
    this.assertEnabled(tenantId);
    const delivery = this.store.webhookDeliveries.find(
      (item) => item.tenantId === tenantId && item.deliveryId === deliveryId,
    );
    if (!delivery) {
      throw new ServiceError("WEBHOOK_DELIVERY_NOT_FOUND", "Webhook delivery not found", 404);
    }
    const endpoint = this.store.webhookEndpoints.find((item) => item.endpointId === delivery.endpointId);
    if (!endpoint) {
      throw new ServiceError("WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found", 404);
    }
    const body = JSON.stringify({
      tenantId: delivery.tenantId,
      branchId: delivery.branchId,
      eventType: delivery.eventType,
      payload: delivery.payload,
      idempotencyKey: delivery.idempotencyKey,
    });
    const signatureValid = this.verify(endpoint.secret, body, delivery.signature);
    return {
      deliveryId: delivery.deliveryId,
      endpointId: delivery.endpointId,
      signatureValid,
      signatureAlgorithm: this.signatureAlgorithm,
    };
  }
}
