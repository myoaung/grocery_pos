import type { MemoryStore } from "../../store/memoryStore";
import type { NotificationSeverity, RequestContext, Role } from "../../types";
import type { FiamService } from "./fiamService";

const installedStores = new WeakSet<MemoryStore>();

function normalizeSeverity(input: string | undefined): NotificationSeverity {
  if (input === "WARN" || input === "READ_ONLY" || input === "BLOCK") {
    return input;
  }
  return "INFO";
}

function fallbackRole(input: string | undefined): Role {
  if (
    input === "APPLICATION_OWNER" ||
    input === "TENANT_OWNER" ||
    input === "MANAGER" ||
    input === "CASHIER" ||
    input === "INVENTORY_STAFF"
  ) {
    return input;
  }
  return "MANAGER";
}

export class NotificationTriggerService {
  constructor(
    private readonly store: MemoryStore,
    private readonly fiamService: FiamService,
  ) {
    if (installedStores.has(store)) {
      return;
    }

    installedStores.add(store);
    this.attachListeners();
  }

  private asContext(payload: {
    tenantId: string;
    branchId: string;
    userId?: string;
    role?: string;
  }): RequestContext {
    return {
      userId: payload.userId ?? "u-mg-a",
      role: fallbackRole(payload.role),
      tenantId: payload.tenantId,
      branchId: payload.branchId,
    };
  }

  private attachListeners(): void {
    this.store.events.on(
      "stockChange",
      (payload: {
        tenantId: string;
        branchId: string;
        productId: string;
        productName?: string;
        onHandQty: number;
        stockAlert: number;
        userId?: string;
        role?: string;
      }) => {
        if (payload.onHandQty > payload.stockAlert) {
          return;
        }

        const ctx = this.asContext(payload);
        const key = `stock:${payload.tenantId}:${payload.branchId}:${payload.productId}:${payload.onHandQty}`;
        this.fiamService.trigger(ctx, payload.tenantId, {
          eventType: "LOW_STOCK",
          severity: "WARN",
          title: "Low Stock Alert",
          body: `${payload.productName ?? payload.productId} is at ${payload.onHandQty} (alert ${payload.stockAlert}).`,
          data: {
            productId: payload.productId,
            onHandQty: payload.onHandQty,
            stockAlert: payload.stockAlert,
          },
          targetRoles: ["TENANT_OWNER", "MANAGER", "INVENTORY_STAFF", "CASHIER"],
          idempotencyKey: key,
          source: "TRIGGER",
        });
      },
    );

    this.store.events.on(
      "pointsChange",
      (payload: {
        tenantId: string;
        branchId: string;
        customerId: string;
        pointsDelta: number;
        userId?: string;
        role?: string;
      }) => {
        if (payload.pointsDelta === 0) {
          return;
        }

        const ctx = this.asContext(payload);
        const direction = payload.pointsDelta > 0 ? "earned" : "redeemed";
        const key = `loyalty:${payload.tenantId}:${payload.branchId}:${payload.customerId}:${payload.pointsDelta}:${direction}`;
        this.fiamService.trigger(ctx, payload.tenantId, {
          eventType: "LOYALTY_POINTS",
          severity: "INFO",
          title: "Loyalty Update",
          body: `Customer ${payload.customerId} ${direction} ${Math.abs(payload.pointsDelta)} points.`,
          data: {
            customerId: payload.customerId,
            pointsDelta: payload.pointsDelta,
          },
          targetRoles: ["TENANT_OWNER", "MANAGER", "CASHIER"],
          idempotencyKey: key,
          source: "TRIGGER",
        });
      },
    );

    this.store.events.on(
      "conflictDetected",
      (payload: {
        tenantId: string;
        branchId: string;
        conflictId?: string;
        mode?: string;
        message?: string;
        userId?: string;
        role?: string;
      }) => {
        const ctx = this.asContext(payload);
        const severity = normalizeSeverity(payload.mode);
        const key = `conflict:${payload.tenantId}:${payload.branchId}:${payload.conflictId ?? payload.message ?? "unknown"}`;
        this.fiamService.trigger(ctx, payload.tenantId, {
          eventType: "OFFLINE_CONFLICT",
          severity,
          title: "Offline Conflict Warning",
          body: payload.message ?? "Conflict detected during sync. Review and resolve before checkout.",
          data: {
            conflictId: payload.conflictId,
            mode: severity,
          },
          targetRoles: ["TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
          idempotencyKey: key,
          source: "TRIGGER",
        });
      },
    );

    this.store.events.on(
      "riskMode",
      (payload: {
        tenantId: string;
        branchId: string;
        mode: "WARN" | "READ_ONLY" | "BLOCK";
        message: string;
        userId?: string;
        role?: string;
      }) => {
        const ctx = this.asContext(payload);
        const severity = normalizeSeverity(payload.mode);
        const key = `risk:${payload.tenantId}:${payload.branchId}:${payload.mode}:${payload.userId ?? "unknown"}`;
        this.fiamService.trigger(ctx, payload.tenantId, {
          eventType: "OFFLINE_CONFLICT",
          severity,
          title: "Risk Enforcement Update",
          body: payload.message,
          data: {
            mode: payload.mode,
            source: "RISK_POLICY",
          },
          targetRoles: ["TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
          idempotencyKey: key,
          source: "TRIGGER",
        });
      },
    );

    this.store.events.on(
      "systemEvent",
      (payload: {
        tenantId: string;
        branchId: string;
        severity?: string;
        title: string;
        body: string;
        userId?: string;
        role?: string;
      }) => {
        const ctx = this.asContext(payload);
        const severity = normalizeSeverity(payload.severity);
        const key = `system:${payload.tenantId}:${payload.branchId}:${payload.title}:${payload.body}`;
        this.fiamService.trigger(ctx, payload.tenantId, {
          eventType: "SYSTEM_EVENT",
          severity,
          title: payload.title,
          body: payload.body,
          data: {},
          targetRoles: ["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF"],
          idempotencyKey: key,
          source: "TRIGGER",
        });
      },
    );
  }
}
