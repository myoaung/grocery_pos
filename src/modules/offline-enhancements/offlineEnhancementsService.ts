import { randomUUID } from "crypto";
import { PosService } from "../../services/posService";
import type { MemoryStore } from "../../store/memoryStore";
import type { LoyaltyQueuePayload, ReportQueuePayload, RequestContext } from "../../types";
import { ServiceError } from "../../utils/errors";
import { LoyaltyRewardsService } from "../loyalty-rewards/loyaltyRewardsService";
import { ReportingExtensionsService } from "../reporting-extensions/reportingExtensionsService";

interface QueueLoyaltyInput {
  operation: "ACCRUE" | "REDEEM";
  customerId: string;
  points: number;
  reason: string;
  idempotencyKey?: string;
  deviceId?: string;
}

interface QueueReportInput {
  templateId: string;
  filters?: Record<string, unknown>;
  idempotencyKey?: string;
  deviceId?: string;
}

export class OfflineEnhancementsService {
  private readonly posService: PosService;
  private readonly loyaltyService: LoyaltyRewardsService;
  private readonly reportingService: ReportingExtensionsService;

  constructor(private readonly store: MemoryStore) {
    this.posService = new PosService(store);
    this.loyaltyService = new LoyaltyRewardsService(store);
    this.reportingService = new ReportingExtensionsService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private duplicateKey(tenantId: string, idempotencyKey: string): boolean {
    if (this.store.idempotencyKeys.has(`${tenantId}:${idempotencyKey}`)) {
      return true;
    }
    return this.store.transactions.some(
      (item) => item.tenantId === tenantId && item.idempotencyKey === idempotencyKey,
    );
  }

  queueLoyalty(ctx: RequestContext, tenantId: string, input: QueueLoyaltyInput) {
    this.assertTenantScope(ctx, tenantId);
    if (input.operation === "REDEEM" && ctx.role === "CASHIER") {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Cashier cannot queue loyalty redemption", 403);
    }
    if (input.operation === "ACCRUE" && !["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"].includes(ctx.role)) {
      throw new ServiceError("FORBIDDEN_ROLE_PERMISSION", "Role cannot queue loyalty accrual", 403);
    }
    if (!Number.isInteger(input.points) || input.points <= 0) {
      throw new ServiceError("INVALID_POINTS", "Points must be a positive integer", 400);
    }

    const customer = this.store.customers.find(
      (item) => item.customerId === input.customerId && item.tenantId === tenantId && item.branchId === ctx.branchId,
    );
    if (!customer) {
      throw new ServiceError("CUSTOMER_NOT_FOUND", "Customer not found in tenant/branch scope", 404);
    }

    const queued = this.posService.enqueueEvent(ctx, {
      eventType: "LOYALTY",
      payload: {
        operation: input.operation,
        customerId: input.customerId,
        points: input.points,
        reason: input.reason,
        expectedBalanceBefore: customer.currentPoints,
      } as unknown as Record<string, unknown>,
      idempotencyKey: input.idempotencyKey,
      deviceId: input.deviceId,
    });

    const event = this.store.addOfflineEventLog({
      tenantId,
      branchId: ctx.branchId,
      queueId: queued.queueId,
      idempotencyKey: queued.idempotencyKey,
      eventType: queued.eventType,
      status: "QUEUED",
      message: `Queued loyalty ${input.operation} operation.`,
      actorUserId: ctx.userId,
    });

    return {
      queue: queued,
      event,
    };
  }

  queueReport(ctx: RequestContext, tenantId: string, input: QueueReportInput) {
    this.assertTenantScope(ctx, tenantId);
    const templates = this.reportingService.listTemplates(ctx, tenantId);
    const found = templates.find((item) => item.templateId === input.templateId);
    if (!found) {
      throw new ServiceError("REPORT_TEMPLATE_NOT_ALLOWED", "Template is not accessible for role", 403);
    }

    const queued = this.posService.enqueueEvent(ctx, {
      eventType: "REPORT",
      payload: {
        templateId: input.templateId,
        filters: input.filters ?? {},
      } as unknown as Record<string, unknown>,
      idempotencyKey: input.idempotencyKey,
      deviceId: input.deviceId,
    });

    const event = this.store.addOfflineEventLog({
      tenantId,
      branchId: ctx.branchId,
      queueId: queued.queueId,
      idempotencyKey: queued.idempotencyKey,
      eventType: queued.eventType,
      status: "QUEUED",
      message: `Queued report request for template ${input.templateId}.`,
      actorUserId: ctx.userId,
    });

    return {
      queue: queued,
      event,
    };
  }

  listOfflineEvents(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.offlineEventLogs
      .filter((item) => item.tenantId === tenantId && item.branchId === ctx.branchId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  status(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    const queue = this.store.queue.filter((item) => item.tenantId === tenantId && item.branchId === ctx.branchId);
    const pending = queue.filter((item) => item.state === "PENDING").length;
    const failed = queue.filter((item) => item.state === "FAILED").length;
    const conflict = queue.filter((item) => item.state === "CONFLICT").length;
    const confirmed = queue.filter((item) => item.state === "CONFIRMED").length;
    const candidates = queue.filter((item) => ["PENDING", "FAILED"].includes(item.state));
    const oldestPendingMinutes =
      candidates.length > 0
        ? Math.round(
            (Date.now() - Date.parse(candidates.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0].createdAt)) /
              (1000 * 60),
          )
        : 0;
    const prolongedOffline = oldestPendingMinutes >= 30;
    return {
      tenantId,
      branchId: ctx.branchId,
      pending,
      failed,
      conflict,
      confirmed,
      oldestPendingMinutes,
      prolongedOffline,
      retryPolicy: {
        initialBackoffMs: 1000,
        maxBackoffMs: 30000,
        maxReplayWindowHours: 72,
        maxRetryAttempts: 5,
      },
    };
  }

  reconcile(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    const candidates = this.store.queue.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.branchId === ctx.branchId &&
        ["LOYALTY", "REPORT"].includes(item.eventType) &&
        ["PENDING", "FAILED"].includes(item.state),
    );

    let processed = 0;
    let confirmed = 0;
    let conflicts = 0;
    let failed = 0;
    let duplicates = 0;

    for (const item of candidates) {
      processed += 1;
      item.state = "SYNCING";
      item.updatedAt = this.store.nowIso();

      try {
        if (this.duplicateKey(tenantId, item.idempotencyKey)) {
          item.state = "FAILED";
          item.errorCode = "DUPLICATE_IDEMPOTENCY_KEY";
          item.errorMessage = "Duplicate idempotency key rejected during offline reconcile";
          item.updatedAt = this.store.nowIso();
          duplicates += 1;
          failed += 1;
          this.store.addOfflineEventLog({
            tenantId,
            branchId: ctx.branchId,
            queueId: item.queueId,
            idempotencyKey: item.idempotencyKey,
            eventType: item.eventType,
            status: "FAILED",
            message: "Duplicate idempotency key rejected during reconcile.",
            actorUserId: ctx.userId,
          });
          continue;
        }

        if (item.eventType === "LOYALTY") {
          const payload = item.payload as unknown as LoyaltyQueuePayload;
          this.loyaltyService.applyQueuedMutation(ctx, tenantId, payload);
        }

        if (item.eventType === "REPORT") {
          const payload = item.payload as unknown as ReportQueuePayload;
          this.reportingService.generate(ctx, tenantId, payload.templateId, payload.filters ?? {});
        }

        this.store.idempotencyKeys.add(`${tenantId}:${item.idempotencyKey}`);
        this.store.transactions.push({
          transactionId: randomUUID(),
          tenantId,
          branchId: ctx.branchId,
          sourceQueueId: item.queueId,
          eventType: item.eventType,
          idempotencyKey: item.idempotencyKey,
          createdAt: this.store.nowIso(),
        });
        item.state = "CONFIRMED";
        item.errorCode = undefined;
        item.errorMessage = undefined;
        item.updatedAt = this.store.nowIso();
        confirmed += 1;

        this.store.addOfflineEventLog({
          tenantId,
          branchId: ctx.branchId,
          queueId: item.queueId,
          idempotencyKey: item.idempotencyKey,
          eventType: item.eventType,
          status: "SYNCED",
          message: "Queued event synchronized successfully.",
          actorUserId: ctx.userId,
        });
      } catch (error) {
        const serviceError = error instanceof ServiceError ? error : undefined;
        if (serviceError?.code === "LOYALTY_BALANCE_CONFLICT" || serviceError?.code === "INSUFFICIENT_POINTS") {
          item.state = "CONFLICT";
          item.errorCode = serviceError.code;
          item.errorMessage = serviceError.message;
          item.updatedAt = this.store.nowIso();
          conflicts += 1;

          const payload = item.payload as unknown as LoyaltyQueuePayload;
          const customer = this.store.customers.find(
            (row) => row.customerId === payload.customerId && row.tenantId === tenantId && row.branchId === ctx.branchId,
          );

          const conflict = this.store.addConflict({
            tenantId,
            branchId: ctx.branchId,
            queueId: item.queueId,
            conflictType: "QUANTITY",
            localValue: payload as unknown as Record<string, unknown>,
            serverValue: {
              currentPoints: customer?.currentPoints ?? null,
            },
          });
          this.store.events.emit("conflictDetected", {
            tenantId,
            branchId: ctx.branchId,
            conflictId: conflict.conflictId,
            mode: "READ_ONLY",
            message: "Offline loyalty conflict detected during reconcile.",
            userId: ctx.userId,
            role: ctx.role,
          });
          this.store.addOfflineEventLog({
            tenantId,
            branchId: ctx.branchId,
            queueId: item.queueId,
            idempotencyKey: item.idempotencyKey,
            eventType: item.eventType,
            status: "CONFLICT",
            message: serviceError.message,
            actorUserId: ctx.userId,
          });
          continue;
        }

        item.state = "FAILED";
        item.errorCode = serviceError?.code ?? "OFFLINE_RECONCILE_FAILED";
        item.errorMessage = serviceError?.message ?? (error instanceof Error ? error.message : "Unknown reconcile error");
        item.updatedAt = this.store.nowIso();
        failed += 1;
        this.store.addOfflineEventLog({
          tenantId,
          branchId: ctx.branchId,
          queueId: item.queueId,
          idempotencyKey: item.idempotencyKey,
          eventType: item.eventType,
          status: "FAILED",
          message: item.errorMessage,
          actorUserId: ctx.userId,
        });
      }
    }

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/offline/reconcile",
      method: "POST",
      decision: "ALLOW",
      reason: "OFFLINE_ENHANCED_RECONCILE",
      actionType: "OFFLINE_ENHANCED_RECONCILE",
    });

    return {
      processed,
      confirmed,
      conflicts,
      failed,
      duplicates,
    };
  }
}
