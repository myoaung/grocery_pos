import type { RequestContext } from "../../types";
import type { MemoryStore } from "../../store/memoryStore";
import { ServiceError } from "../../utils/errors";
import { PosService } from "../../services/posService";

export class OfflineAutomationService {
  private readonly posService: PosService;

  constructor(private readonly store: MemoryStore) {
    this.posService = new PosService(store);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  runAutomation(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    const sync = this.posService.syncQueue(ctx);
    const duplicates = this.store.queue.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.branchId === ctx.branchId &&
        item.state === "FAILED" &&
        item.errorCode === "DUPLICATE_IDEMPOTENCY_KEY",
    ).length;

    const openConflicts = this.store.conflicts.filter(
      (item) => item.tenantId === tenantId && item.branchId === ctx.branchId && item.resolutionStatus === "OPEN",
    ).length;

    let severity: "WARN" | "READ_ONLY" | "BLOCK" = "WARN";
    if (sync.failed >= 3) {
      severity = "BLOCK";
    } else if (duplicates > 0 || openConflicts > 0) {
      severity = "READ_ONLY";
    }

    const createdAlerts = [];
    if (duplicates > 0) {
      createdAlerts.push(
        this.store.addOfflineAlert({
          tenantId,
          branchId: ctx.branchId,
          category: "QUEUE",
          severity,
          message: `${duplicates} duplicate idempotency keys were rejected during automated sync.`,
          source: "OFFLINE_AUTOMATION",
          acknowledged: false,
        }),
      );
    }

    if (openConflicts > 0) {
      createdAlerts.push(
        this.store.addOfflineAlert({
          tenantId,
          branchId: ctx.branchId,
          category: "CONFLICT",
          severity: "READ_ONLY",
          message: `${openConflicts} open conflicts require manager/owner resolution.`,
          source: "OFFLINE_AUTOMATION",
          acknowledged: false,
        }),
      );
    }

    if (severity !== "WARN" || createdAlerts.length > 0) {
      createdAlerts.push(
        this.store.addOfflineAlert({
          tenantId,
          branchId: ctx.branchId,
          category: "RISK",
          severity,
          message: `Automation run completed with enforcement mode ${severity}.`,
          source: "OFFLINE_AUTOMATION",
          acknowledged: false,
        }),
      );
    }

    if (severity !== "WARN") {
      this.store.events.emit("conflictDetected", {
        tenantId,
        branchId: ctx.branchId,
        mode: severity,
        message: `Offline automation set enforcement to ${severity}.`,
        userId: ctx.userId,
        role: ctx.role,
      });
    }

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/offline/automation/run",
      method: "POST",
      decision: "ALLOW",
      reason: `OFFLINE_AUTOMATION_${severity}`,
      actionType: "OFFLINE_AUTOMATION_RUN",
    });

    return {
      summary: sync,
      duplicates,
      openConflicts,
      enforcementMode: severity,
      alerts: createdAlerts,
    };
  }

  listAlerts(ctx: RequestContext, tenantId: string, includeAcknowledged: boolean) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.offlineAlerts.filter(
      (alert) =>
        alert.tenantId === tenantId &&
        alert.branchId === ctx.branchId &&
        (includeAcknowledged ? true : !alert.acknowledged),
    );
  }

  acknowledgeAlert(ctx: RequestContext, tenantId: string, alertId: string, note?: string) {
    this.assertTenantScope(ctx, tenantId);
    const alert = this.store.offlineAlerts.find(
      (item) => item.alertId === alertId && item.tenantId === tenantId && item.branchId === ctx.branchId,
    );
    if (!alert) {
      throw new ServiceError("OFFLINE_ALERT_NOT_FOUND", "Alert not found", 404);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = ctx.userId;
    alert.acknowledgedAt = this.store.nowIso();

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/offline/alerts/:alertId/ack",
      method: "PATCH",
      decision: "ALLOW",
      reason: note ? `OFFLINE_ALERT_ACK:${note}` : "OFFLINE_ALERT_ACK",
      actionType: "OFFLINE_ALERT_ACK",
    });
    return alert;
  }
}
