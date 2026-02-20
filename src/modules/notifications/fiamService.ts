import { randomUUID } from "crypto";
import type {
  NotificationEventType,
  NotificationPayload,
  NotificationRecord,
  NotificationSeverity,
  RequestContext,
  Role,
} from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";

export interface NotificationTriggerInput {
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  branchId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  targetRoles?: Role[];
  idempotencyKey?: string;
  forceQueue?: boolean;
  source: "MANUAL" | "TRIGGER";
}

export interface FiamConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  enabled: boolean;
}

export class FiamService {
  private readonly config: FiamConfig;

  constructor(private readonly store: MemoryStore) {
    this.config = {
      projectId: process.env.FIAM_PROJECT_ID ?? "cosmic-forge-dev",
      appId: process.env.FIAM_APP_ID ?? "cfgp-pos-tablet",
      apiKey: process.env.FIAM_API_KEY ?? "local-dev-key",
      enabled: String(process.env.FIAM_ENABLED ?? "true").toLowerCase() !== "false",
    };
  }

  private dedupeKey(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}:${idempotencyKey}`;
  }

  private ensureTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  getConfig() {
    return this.config;
  }

  listFeed(ctx: RequestContext, tenantId: string, includeRead: boolean): NotificationRecord[] {
    this.ensureTenantScope(ctx, tenantId);
    return this.store.notifications.filter((item) => {
      if (item.tenantId !== tenantId || item.branchId !== ctx.branchId) {
        return false;
      }
      if (!item.targetRoles.includes(ctx.role)) {
        return false;
      }
      if (!includeRead && item.readBy.includes(ctx.userId)) {
        return false;
      }
      return true;
    });
  }

  trigger(ctx: RequestContext, tenantId: string, input: NotificationTriggerInput): { item: NotificationRecord; deduplicated: boolean } {
    this.ensureTenantScope(ctx, tenantId);
    const branchId = input.branchId ?? ctx.branchId;
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const dedupe = this.dedupeKey(tenantId, idempotencyKey);

    const existing = this.store.notifications.find(
      (item) => item.tenantId === tenantId && item.idempotencyKey === idempotencyKey && item.branchId === branchId,
    );
    if (existing || this.store.notificationIdempotency.has(dedupe)) {
      const resolved = existing ?? this.store.notifications.find((item) => item.tenantId === tenantId && item.idempotencyKey === idempotencyKey);
      if (!resolved) {
        throw new ServiceError("DUPLICATE_NOTIFICATION", "Duplicate idempotency key for notification trigger", 409);
      }
      return { item: resolved, deduplicated: true };
    }

    const targetRoles = input.targetRoles ?? ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"];
    const item: NotificationRecord = {
      notificationId: randomUUID(),
      tenantId,
      branchId,
      eventType: input.eventType,
      severity: input.severity,
      targetRoles,
      payload: {
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      },
      idempotencyKey,
      status: "PENDING",
      createdBy: ctx.userId,
      source: input.source,
      deliveryProvider: "FIREBASE_FIAM",
      attempts: 0,
      readBy: [],
      createdAt: this.store.nowIso(),
      updatedAt: this.store.nowIso(),
    };

    this.store.notifications.push(item);
    this.store.notificationIdempotency.add(dedupe);

    if (!input.forceQueue && this.store.isNotificationOnline(tenantId, branchId) && this.config.enabled) {
      this.deliver(item);
    } else if (!this.config.enabled) {
      item.status = "FAILED";
      item.errorMessage = "FIAM_DISABLED";
      item.updatedAt = this.store.nowIso();
    }

    this.store.addAudit({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/notifications/trigger",
      method: "POST",
      decision: "ALLOW",
      reason: `NOTIFICATION_TRIGGER_${item.eventType}`,
      actionType: "NOTIFICATION_TRIGGER",
    });

    return { item, deduplicated: false };
  }

  private deliver(item: NotificationRecord): void {
    item.attempts += 1;
    item.status = "SENT";
    item.sentAt = this.store.nowIso();
    item.updatedAt = this.store.nowIso();
    item.errorMessage = undefined;
  }

  retryPending(ctx: RequestContext, tenantId: string): { retried: number; sent: number; stillPending: number; failed: number } {
    this.ensureTenantScope(ctx, tenantId);
    const items = this.store.notifications.filter(
      (item) =>
        item.tenantId === tenantId && item.branchId === ctx.branchId && (item.status === "PENDING" || item.status === "FAILED"),
    );

    let sent = 0;
    let pending = 0;
    let failed = 0;

    for (const item of items) {
      if (!this.store.isNotificationOnline(tenantId, ctx.branchId)) {
        item.status = "PENDING";
        item.errorMessage = "OFFLINE";
        item.updatedAt = this.store.nowIso();
        pending += 1;
        continue;
      }

      if (!this.config.enabled) {
        item.status = "FAILED";
        item.errorMessage = "FIAM_DISABLED";
        item.updatedAt = this.store.nowIso();
        failed += 1;
        continue;
      }

      this.deliver(item);
      sent += 1;
    }

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/notifications/retry",
      method: "POST",
      decision: "ALLOW",
      reason: "NOTIFICATION_RETRY",
      actionType: "NOTIFICATION_RETRY",
    });

    return {
      retried: items.length,
      sent,
      stillPending: pending,
      failed,
    };
  }

  markRead(ctx: RequestContext, tenantId: string, notificationId: string): NotificationRecord {
    this.ensureTenantScope(ctx, tenantId);
    const item = this.store.notifications.find(
      (row) => row.notificationId === notificationId && row.tenantId === tenantId && row.branchId === ctx.branchId,
    );

    if (!item) {
      throw new ServiceError("NOTIFICATION_NOT_FOUND", "Notification not found", 404);
    }
    if (!item.targetRoles.includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Role cannot access this notification", 403);
    }

    if (!item.readBy.includes(ctx.userId)) {
      item.readBy.push(ctx.userId);
      item.updatedAt = this.store.nowIso();
    }

    return item;
  }

  setConnectivity(ctx: RequestContext, tenantId: string, branchId: string, online: boolean): { tenantId: string; branchId: string; online: boolean } {
    this.ensureTenantScope(ctx, tenantId);
    if (!["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Notification connectivity override requires manager/owner role", 403);
    }

    this.store.setNotificationConnectivity(tenantId, branchId, online);
    this.store.addAudit({
      tenantId,
      branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/notifications/connectivity",
      method: "PATCH",
      decision: "ALLOW",
      reason: `NOTIFICATION_CONNECTIVITY_${online ? "ONLINE" : "OFFLINE"}`,
      actionType: "NOTIFICATION_CONNECTIVITY",
    });
    return { tenantId, branchId, online };
  }
}
