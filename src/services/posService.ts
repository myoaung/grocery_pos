import { randomUUID } from "crypto";
import { allReportIds, ownerReportIds, tenantReportIds } from "../config/reporting";
import type { MemoryStore } from "../store/memoryStore";
import type {
  ConflictRecord,
  LoyaltyQueuePayload,
  OfflineQueueItem,
  ReportId,
  ReportResult,
  RequestContext,
  Sale,
  SaleLine,
} from "../types";
import { ServiceError } from "../utils/errors";
import { assertBranchForTenant, assertProductForTenant, assertUser } from "../utils/keys";

interface ProductInput {
  sku: string;
  barcode: string;
  nameMm: string;
  nameEn: string;
  category: string;
  unitType: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  taxCategory: string;
  stockAlert: number;
}

interface InventoryActionInput {
  action: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT" | "DAMAGE" | "TRANSFER";
  productId: string;
  quantity: number;
  destinationBranchId?: string;
  reason?: string;
  offline?: boolean;
  idempotencyKey?: string;
  deviceId?: string;
}

interface CheckoutLineInput {
  productId: string;
  quantity: number;
  manualDiscount?: number;
}

interface CheckoutInput {
  mode: "RETAIL" | "WHOLESALE";
  lines: CheckoutLineInput[];
  customerId?: string;
  offline?: boolean;
  idempotencyKey?: string;
  deviceId?: string;
}

interface QueuePayload {
  eventType: "SALE" | "INVENTORY" | "LOYALTY" | "REPORT";
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  deviceId?: string;
}

interface LoyaltyRedeemInput {
  customerId: string;
  points: number;
  reason: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

const OFFLINE_SYNC_POLICY = {
  initialBackoffMs: 1000,
  maxBackoffMs: 30000,
  maxReplayWindowHours: 72,
  maxRetryAttempts: 5,
  prolongedOfflineWarnMinutes: 30,
} as const;

export class PosService {
  constructor(private readonly store: MemoryStore) {}

  private auditAllow(ctx: RequestContext, endpoint: string, method: string, actionType: string, reason = "ALLOW"): void {
    this.store.addAudit({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint,
      method,
      decision: "ALLOW",
      reason,
      actionType,
    });
  }

  private auditDeny(ctx: RequestContext, endpoint: string, method: string, actionType: string, reason: string): void {
    this.store.addAudit({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint,
      method,
      decision: "DENY",
      reason,
      actionType,
    });
  }

  private idempotencyFingerprint(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}:${idempotencyKey}`;
  }

  private isKnownIdempotencyKey(tenantId: string, idempotencyKey: string, excludeQueueId?: string): boolean {
    const fingerprint = this.idempotencyFingerprint(tenantId, idempotencyKey);
    if (this.store.idempotencyKeys.has(fingerprint)) {
      return true;
    }

    if (
      this.store.transactions.some(
        (item) => item.tenantId === tenantId && item.idempotencyKey === idempotencyKey,
      )
    ) {
      return true;
    }

    return this.store.queue.some(
      (item) => item.tenantId === tenantId && item.idempotencyKey === idempotencyKey && item.queueId !== excludeQueueId,
    );
  }

  private assertIdempotencyAvailable(ctx: RequestContext, idempotencyKey: string | undefined, endpoint: string, method: string): void {
    if (!idempotencyKey) {
      return;
    }

    if (!this.isKnownIdempotencyKey(ctx.tenantId, idempotencyKey)) {
      return;
    }

    this.auditDeny(ctx, endpoint, method, "IDEMPOTENCY_REJECT", `DUPLICATE_IDEMPOTENCY_KEY:${idempotencyKey}`);
    throw new ServiceError("DUPLICATE_IDEMPOTENCY_KEY", "Duplicate idempotency key rejected", 409);
  }

  private queueReplayDeadlineFrom(baseIso: string): string {
    return new Date(Date.parse(baseIso) + OFFLINE_SYNC_POLICY.maxReplayWindowHours * 60 * 60 * 1000).toISOString();
  }

  private retryBackoffMs(retryCount: number): number {
    const computed = OFFLINE_SYNC_POLICY.initialBackoffMs * 2 ** Math.max(0, retryCount - 1);
    return Math.min(OFFLINE_SYNC_POLICY.maxBackoffMs, computed);
  }

  private scheduleRetry(item: OfflineQueueItem): void {
    item.retryCount += 1;
    item.nextRetryAt = new Date(Date.now() + this.retryBackoffMs(item.retryCount)).toISOString();
  }

  private replayExpired(item: OfflineQueueItem): boolean {
    return Date.now() > Date.parse(item.replayDeadlineAt);
  }

  private backoffActive(item: OfflineQueueItem): boolean {
    if (!item.nextRetryAt) {
      return false;
    }
    return Date.now() < Date.parse(item.nextRetryAt);
  }

  private maybeCreateProlongedOfflineAlert(ctx: RequestContext): void {
    const pending = this.store.queue
      .filter((row) => row.tenantId === ctx.tenantId && row.branchId === ctx.branchId)
      .filter((row) => ["PENDING", "FAILED"].includes(row.state));

    if (pending.length === 0) {
      return;
    }

    const oldest = pending.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    const ageMinutes = (Date.now() - Date.parse(oldest.createdAt)) / (1000 * 60);
    if (ageMinutes < OFFLINE_SYNC_POLICY.prolongedOfflineWarnMinutes) {
      return;
    }

    const existing = this.store.offlineAlerts.some(
      (item) =>
        item.tenantId === ctx.tenantId &&
        item.branchId === ctx.branchId &&
        item.category === "QUEUE" &&
        item.source === "OFFLINE_SLA" &&
        item.acknowledged === false,
    );
    if (existing) {
      return;
    }

    const message = `Offline queue exceeds ${OFFLINE_SYNC_POLICY.prolongedOfflineWarnMinutes} minutes. Retry/backoff active.`;
    this.store.addOfflineAlert({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      category: "QUEUE",
      severity: "WARN",
      message,
      source: "OFFLINE_SLA",
      acknowledged: false,
    });
    this.store.events.emit("offlineSla", {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      mode: "WARN",
      message,
      userId: ctx.userId,
      role: ctx.role,
    });
  }

  listProducts(ctx: RequestContext): ReturnType<PosService["serializeProduct"]>[] {
    return this.store.products
      .filter((product) => product.tenantId === ctx.tenantId)
      .map((product) => this.serializeProduct(ctx, product));
  }

  getProduct(ctx: RequestContext, productId: string): ReturnType<PosService["serializeProduct"]> {
    const product = assertProductForTenant(this.store.products, productId, ctx.tenantId);
    return this.serializeProduct(ctx, product);
  }

  createProduct(ctx: RequestContext, input: ProductInput): ReturnType<PosService["serializeProduct"]> {
    const duplicated = this.store.products.some(
      (item) => item.tenantId === ctx.tenantId && (item.sku === input.sku || item.barcode === input.barcode),
    );
    if (duplicated) {
      throw new ServiceError("DUPLICATE_PRODUCT", "SKU or barcode already exists", 409);
    }

    const product = {
      productId: randomUUID(),
      tenantId: ctx.tenantId,
      ...input,
      updatedAt: this.store.nowIso(),
    };

    this.store.products.push(product);
    this.store.branches
      .filter((branch) => branch.tenantId === ctx.tenantId)
      .forEach((branch) => this.store.setStock(ctx.tenantId, branch.branchId, product.productId, 0));

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/products", "POST", "PRODUCT_CREATE");
    return this.serializeProduct(ctx, product);
  }

  updateProduct(ctx: RequestContext, productId: string, input: Partial<ProductInput>): ReturnType<PosService["serializeProduct"]> {
    const product = assertProductForTenant(this.store.products, productId, ctx.tenantId);

    if (input.sku && input.sku !== product.sku) {
      const duplicateSku = this.store.products.some(
        (item) => item.tenantId === ctx.tenantId && item.productId !== productId && item.sku === input.sku,
      );
      if (duplicateSku) {
        throw new ServiceError("DUPLICATE_SKU", "SKU already exists", 409);
      }
    }

    if (input.barcode && input.barcode !== product.barcode) {
      const duplicateBarcode = this.store.products.some(
        (item) => item.tenantId === ctx.tenantId && item.productId !== productId && item.barcode === input.barcode,
      );
      if (duplicateBarcode) {
        throw new ServiceError("DUPLICATE_BARCODE", "Barcode already exists", 409);
      }
    }

    Object.assign(product, input);
    product.updatedAt = this.store.nowIso();

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/products/:productId", "PATCH", "PRODUCT_UPDATE");
    return this.serializeProduct(ctx, product);
  }

  private serializeProduct(ctx: RequestContext, product: (typeof this.store.products)[number]) {
    const stockByBranch = this.store.branches
      .filter((branch) => branch.tenantId === ctx.tenantId)
      .map((branch) => ({
        branchId: branch.branchId,
        onHandQty: this.store.getStock(ctx.tenantId, branch.branchId, product.productId),
      }));

    return {
      ...product,
      stockByBranch,
    };
  }

  applyInventoryAction(ctx: RequestContext, input: InventoryActionInput): { success: true; queueId?: string } {
    if (input.quantity <= 0) {
      throw new ServiceError("INVALID_QUANTITY", "Quantity must be positive", 400);
    }

    this.assertIdempotencyAvailable(ctx, input.idempotencyKey, "/api/v1/tenants/:tenantId/inventory/action", "POST");

    const branch = assertBranchForTenant(this.store.branches, ctx.branchId, ctx.tenantId);
    const product = assertProductForTenant(this.store.products, input.productId, ctx.tenantId);
    const current = this.store.getStock(ctx.tenantId, branch.branchId, product.productId);

    let next = current;
    if (input.action === "STOCK_IN") {
      next = current + input.quantity;
    }
    if (["STOCK_OUT", "DAMAGE"].includes(input.action)) {
      next = current - input.quantity;
    }
    if (input.action === "ADJUSTMENT") {
      const delta = input.reason?.toLowerCase().includes("decrease") ? -input.quantity : input.quantity;
      next = current + delta;
    }

    if (input.action === "TRANSFER") {
      if (!input.destinationBranchId) {
        throw new ServiceError("MISSING_DESTINATION_BRANCH", "Destination branch is required", 400);
      }
      const destination = assertBranchForTenant(this.store.branches, input.destinationBranchId, ctx.tenantId);
      const sourceAfterTransfer = current - input.quantity;
      if (sourceAfterTransfer < 0) {
        throw new ServiceError("NEGATIVE_STOCK_BLOCKED", "Negative stock is forbidden system-wide", 409);
      }

      const destinationCurrent = this.store.getStock(ctx.tenantId, destination.branchId, product.productId);
      this.store.setStock(ctx.tenantId, branch.branchId, product.productId, sourceAfterTransfer);
      this.store.setStock(ctx.tenantId, destination.branchId, product.productId, destinationCurrent + input.quantity);

      this.store.addInventoryLog({
        tenantId: ctx.tenantId,
        branchId: branch.branchId,
        productId: product.productId,
        action: "TRANSFER_OUT",
        quantity: input.quantity,
        reason: input.reason ?? "transfer out",
        actorUserId: ctx.userId,
      });

      this.store.addInventoryLog({
        tenantId: ctx.tenantId,
        branchId: destination.branchId,
        productId: product.productId,
        action: "TRANSFER_IN",
        quantity: input.quantity,
        reason: input.reason ?? "transfer in",
        actorUserId: ctx.userId,
      });

      this.store.events.emit("stockChange", {
        tenantId: ctx.tenantId,
        branchId: branch.branchId,
        productId: product.productId,
        productName: product.nameEn,
        onHandQty: sourceAfterTransfer,
        stockAlert: product.stockAlert,
        userId: ctx.userId,
        role: ctx.role,
      });

      this.store.events.emit("stockChange", {
        tenantId: ctx.tenantId,
        branchId: destination.branchId,
        productId: product.productId,
        productName: product.nameEn,
        onHandQty: destinationCurrent + input.quantity,
        stockAlert: product.stockAlert,
        userId: ctx.userId,
        role: ctx.role,
      });

      this.auditAllow(ctx, "/api/v1/tenants/:tenantId/inventory/transfers", "POST", "INVENTORY_TRANSFER");

      if (input.offline) {
        const queue = this.enqueueEvent(ctx, {
          eventType: "INVENTORY",
          payload: {
            action: "TRANSFER",
            productId: product.productId,
            quantity: input.quantity,
            sourceBranchId: branch.branchId,
            destinationBranchId: destination.branchId,
            reason: input.reason,
          },
          idempotencyKey: input.idempotencyKey,
          deviceId: input.deviceId,
        });
        return { success: true, queueId: queue.queueId };
      }

      return { success: true };
    }

    if (next < 0) {
      throw new ServiceError("NEGATIVE_STOCK_BLOCKED", "Negative stock is forbidden system-wide", 409);
    }

    this.store.setStock(ctx.tenantId, branch.branchId, product.productId, next);
    this.store.addInventoryLog({
      tenantId: ctx.tenantId,
      branchId: branch.branchId,
      productId: product.productId,
      action: input.action,
      quantity: input.quantity,
      reason: input.reason,
      actorUserId: ctx.userId,
    });

    this.store.events.emit("stockChange", {
      tenantId: ctx.tenantId,
      branchId: branch.branchId,
      productId: product.productId,
      productName: product.nameEn,
      onHandQty: next,
      stockAlert: product.stockAlert,
      userId: ctx.userId,
      role: ctx.role,
    });

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/inventory/action", "POST", `INVENTORY_${input.action}`);

    if (input.offline) {
      const queue = this.enqueueEvent(ctx, {
        eventType: "INVENTORY",
        payload: {
          action: input.action,
          productId: product.productId,
          quantity: input.quantity,
          branchId: branch.branchId,
          reason: input.reason,
        },
        idempotencyKey: input.idempotencyKey,
        deviceId: input.deviceId,
      });
      return { success: true, queueId: queue.queueId };
    }

    return { success: true };
  }

  checkout(ctx: RequestContext, input: CheckoutInput): {
    sale: Sale;
    queueId?: string;
    queued: boolean;
    localCommitMs: number;
  } {
    if (input.lines.length === 0) {
      throw new ServiceError("EMPTY_CART", "At least one line is required", 400);
    }

    this.assertIdempotencyAvailable(ctx, input.idempotencyKey, "/api/v1/tenants/:tenantId/sales/checkout", "POST");

    const startedAt = Date.now();
    const saleLines: SaleLine[] = [];

    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw new ServiceError("INVALID_QUANTITY", "Quantity must be positive", 400);
      }

      const product = assertProductForTenant(this.store.products, line.productId, ctx.tenantId);
      const available = this.store.getStock(ctx.tenantId, ctx.branchId, product.productId);
      if (line.quantity > available) {
        throw new ServiceError("NEGATIVE_STOCK_BLOCKED", "Checkout blocked because stock would become negative", 409);
      }

      const unitPrice = input.mode === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
      const manualDiscount = line.manualDiscount ?? 0;
      if (manualDiscount > 0 && ctx.role === "CASHIER") {
        throw new ServiceError("FORBIDDEN_DISCOUNT_OVERRIDE", "Cashier cannot override discounts", 403);
      }

      const automaticDiscount = line.quantity >= 10 ? unitPrice * line.quantity * 0.02 : 0;
      const discountAmount = round2(manualDiscount + automaticDiscount);
      const lineTotalBeforeDiscount = round2(unitPrice * line.quantity);
      const taxableAmount = round2(lineTotalBeforeDiscount - discountAmount);
      const taxRate = this.store.findTaxRate(ctx.tenantId, product.taxCategory, this.store.nowIso());
      const taxAmount = round2(taxableAmount * taxRate);
      const netLineTotal = round2(taxableAmount + taxAmount);

      saleLines.push({
        productId: product.productId,
        quantity: line.quantity,
        unitPrice,
        discountAmount,
        taxableAmount,
        taxAmount,
        lineTotalBeforeDiscount,
        netLineTotal,
        costSnapshotAtSale: product.costPrice,
      });
    }

    for (const line of saleLines) {
      const stock = this.store.getStock(ctx.tenantId, ctx.branchId, line.productId);
      this.store.setStock(ctx.tenantId, ctx.branchId, line.productId, stock - line.quantity);
      this.store.addInventoryLog({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: line.productId,
        action: "STOCK_OUT",
        quantity: line.quantity,
        reason: "sale deduction",
        actorUserId: ctx.userId,
      });

      const product = assertProductForTenant(this.store.products, line.productId, ctx.tenantId);
      this.store.events.emit("stockChange", {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: line.productId,
        productName: product.nameEn,
        onHandQty: stock - line.quantity,
        stockAlert: product.stockAlert,
        userId: ctx.userId,
        role: ctx.role,
      });
    }

    const subtotal = round2(sum(saleLines.map((line) => line.lineTotalBeforeDiscount)));
    const discountTotal = round2(sum(saleLines.map((line) => line.discountAmount)));
    const taxTotal = round2(sum(saleLines.map((line) => line.taxAmount)));
    const netTotal = round2(sum(saleLines.map((line) => line.netLineTotal)));

    const sale: Sale = {
      saleId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      cashierUserId: ctx.userId,
      customerId: input.customerId,
      mode: input.mode,
      status: "CONFIRMED",
      lines: saleLines,
      subtotal,
      discountTotal,
      taxTotal,
      netTotal,
      createdAt: this.store.nowIso(),
    };

    this.store.sales.push(sale);
    this.updateCustomerTotalsFromSale(ctx, sale);

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/sales/checkout", "POST", "SALES_CHECKOUT");

    if (input.offline) {
      const queue = this.enqueueEvent(ctx, {
        eventType: "SALE",
        payload: {
          saleId: sale.saleId,
          mode: sale.mode,
          lines: sale.lines,
          createdAt: sale.createdAt,
          productUpdatedAtMap: Object.fromEntries(
            sale.lines.map((line) => {
              const product = assertProductForTenant(this.store.products, line.productId, ctx.tenantId);
              return [line.productId, product.updatedAt];
            }),
          ),
        },
        idempotencyKey: input.idempotencyKey,
        deviceId: input.deviceId,
      });

      const localCommitMs = Date.now() - startedAt;
      return {
        sale,
        queueId: queue.queueId,
        queued: true,
        localCommitMs,
      };
    }

    this.store.transactions.push({
      transactionId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      sourceQueueId: "",
      eventType: "SALE",
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      createdAt: this.store.nowIso(),
    });
    if (input.idempotencyKey) {
      this.store.idempotencyKeys.add(this.idempotencyFingerprint(ctx.tenantId, input.idempotencyKey));
    }

    const localCommitMs = Date.now() - startedAt;
    return {
      sale,
      queued: false,
      localCommitMs,
    };
  }
  private updateCustomerTotalsFromSale(ctx: RequestContext, sale: Sale): void {
    if (!sale.customerId) {
      return;
    }

    const customer = this.store.customers.find(
      (item) => item.customerId === sale.customerId && item.tenantId === ctx.tenantId && item.branchId === ctx.branchId,
    );

    if (!customer) {
      return;
    }

    customer.visitCount += 1;
    customer.totalSpending = round2(customer.totalSpending + sale.netTotal);
    if (!this.store.getFeatureFlag(ctx.tenantId, "loyalty_rules")) {
      return;
    }

    const pointsRule =
      this.store.loyaltyRewardRules.find((item) => item.tenantId === ctx.tenantId)?.pointsPerKyat ?? 0.01;
    const points = Math.floor(sale.netTotal * pointsRule);
    if (points > 0) {
      customer.currentPoints += points;
      this.store.loyaltyLedger.push({
        loyaltyEntryId: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        customerId: customer.customerId,
        pointsDelta: points,
        reason: "sale accrual",
        actorUserId: ctx.userId,
        createdAt: this.store.nowIso(),
      });
      this.store.addLoyaltyRewardHistory({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        customerId: customer.customerId,
        operation: "ACCRUE",
        pointsDelta: points,
        balanceAfter: customer.currentPoints,
        reason: "sale accrual",
        actorUserId: ctx.userId,
        source: "POS",
      });

      this.store.events.emit("pointsChange", {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        customerId: customer.customerId,
        pointsDelta: points,
        userId: ctx.userId,
        role: ctx.role,
      });
    }

    if (customer.totalSpending >= 500000) {
      customer.tierName = "GOLD";
    } else if (customer.totalSpending >= 250000) {
      customer.tierName = "SILVER";
    }
  }

  enqueueEvent(ctx: RequestContext, input: QueuePayload): OfflineQueueItem {
    this.assertIdempotencyAvailable(ctx, input.idempotencyKey, "/api/v1/tenants/:tenantId/sync/queue", "POST");

    const item: OfflineQueueItem = {
      queueId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      deviceId: input.deviceId ?? "device-local",
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      eventType: input.eventType,
      payload: input.payload,
      state: "PENDING",
      retryCount: 0,
      replayDeadlineAt: this.queueReplayDeadlineFrom(this.store.nowIso()),
      nextRetryAt: this.store.nowIso(),
      createdAt: this.store.nowIso(),
      updatedAt: this.store.nowIso(),
    };

    this.store.queue.push(item);
    this.maybeCreateProlongedOfflineAlert(ctx);
    if (input.eventType === "LOYALTY" || input.eventType === "REPORT") {
      this.store.addOfflineEventLog({
        tenantId: item.tenantId,
        branchId: item.branchId,
        queueId: item.queueId,
        idempotencyKey: item.idempotencyKey,
        eventType: item.eventType,
        status: "QUEUED",
        message: `Queued ${item.eventType} event for sync.`,
        actorUserId: ctx.userId,
      });
    }
    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/sync/queue", "POST", "QUEUE_ENQUEUE");
    return item;
  }

  listQueue(ctx: RequestContext): OfflineQueueItem[] {
    return this.store.queue.filter((item) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId);
  }

  syncQueue(ctx: RequestContext): {
    processed: number;
    confirmed: number;
    conflicts: number;
    failed: number;
    deferred: number;
    expired: number;
  } {
    const items = this.store.queue.filter(
      (item) =>
        item.tenantId === ctx.tenantId &&
        item.branchId === ctx.branchId &&
        ["PENDING", "FAILED"].includes(item.state),
    );

    let confirmed = 0;
    let conflicts = 0;
    let failed = 0;
    let deferred = 0;
    let expired = 0;
    let escalations = 0;

    for (const item of items) {
      if (this.backoffActive(item)) {
        deferred += 1;
        continue;
      }

      if (this.replayExpired(item)) {
        item.state = "FAILED";
        item.errorCode = "OFFLINE_REPLAY_WINDOW_EXCEEDED";
        item.errorMessage = `Replay window exceeded (${OFFLINE_SYNC_POLICY.maxReplayWindowHours}h)`;
        item.updatedAt = this.store.nowIso();
        item.nextRetryAt = undefined;
        failed += 1;
        expired += 1;
        this.store.addOfflineAlert({
          tenantId: item.tenantId,
          branchId: item.branchId,
          category: "QUEUE",
          severity: "BLOCK",
          message: `Queue item ${item.queueId} exceeded replay window and requires manual action.`,
          source: "OFFLINE_SLA",
          acknowledged: false,
        });
        escalations += 1;
        continue;
      }

      item.state = "SYNCING";
      item.updatedAt = this.store.nowIso();

      try {
        const keyFingerprint = this.idempotencyFingerprint(item.tenantId, item.idempotencyKey);
        const alreadySynced =
          this.store.idempotencyKeys.has(keyFingerprint) ||
          this.store.transactions.some(
            (tx) =>
              tx.tenantId === item.tenantId &&
              tx.idempotencyKey === item.idempotencyKey &&
              tx.sourceQueueId !== item.queueId,
          );

        if (alreadySynced) {
          item.state = "FAILED";
          item.errorCode = "DUPLICATE_IDEMPOTENCY_KEY";
          item.errorMessage = "Duplicate idempotency key rejected during sync";
          item.updatedAt = this.store.nowIso();
          this.scheduleRetry(item);
          if (item.eventType === "LOYALTY" || item.eventType === "REPORT") {
            this.store.addOfflineEventLog({
              tenantId: item.tenantId,
              branchId: item.branchId,
              queueId: item.queueId,
              idempotencyKey: item.idempotencyKey,
              eventType: item.eventType,
              status: "FAILED",
              message: "Duplicate idempotency key rejected during sync.",
              actorUserId: ctx.userId,
            });
          }
          this.auditDeny(
            ctx,
            "/api/v1/tenants/:tenantId/sync/retry",
            "POST",
            "IDEMPOTENCY_REJECT",
            `DUPLICATE_IDEMPOTENCY_KEY:${item.idempotencyKey}`,
          );
          failed += 1;
          continue;
        }

        if (item.eventType === "SALE") {
          const conflict = this.detectSaleConflict(ctx, item);
          if (conflict) {
            item.state = "CONFLICT";
            item.updatedAt = this.store.nowIso();
            this.store.conflicts.push(conflict);
            this.store.events.emit("conflictDetected", {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              conflictId: conflict.conflictId,
              mode: "READ_ONLY",
              message: "Price conflict detected during offline sync. Manager resolution required.",
              userId: ctx.userId,
              role: ctx.role,
            });
            this.auditAllow(ctx, "/api/v1/tenants/:tenantId/sync/retry", "POST", "SYNC_CONFLICT", "CONFLICT_CREATED");
            conflicts += 1;
            continue;
          }
        }

        if (item.eventType === "LOYALTY") {
          const conflict = this.detectLoyaltyConflict(ctx, item);
          if (conflict) {
            item.state = "CONFLICT";
            item.updatedAt = this.store.nowIso();
            this.store.conflicts.push(conflict);
            this.store.events.emit("conflictDetected", {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              conflictId: conflict.conflictId,
              mode: "READ_ONLY",
              message: "Loyalty conflict detected during offline sync.",
              userId: ctx.userId,
              role: ctx.role,
            });
            this.store.addOfflineEventLog({
              tenantId: item.tenantId,
              branchId: item.branchId,
              queueId: item.queueId,
              idempotencyKey: item.idempotencyKey,
              eventType: item.eventType,
              status: "CONFLICT",
              message: "Loyalty payload conflicts with current points balance.",
              actorUserId: ctx.userId,
            });
            this.auditAllow(ctx, "/api/v1/tenants/:tenantId/sync/retry", "POST", "SYNC_CONFLICT", "CONFLICT_CREATED");
            conflicts += 1;
            continue;
          }

          this.applyQueuedLoyaltyMutation(ctx, item);
        }

        this.store.idempotencyKeys.add(this.idempotencyFingerprint(item.tenantId, item.idempotencyKey));
        this.store.transactions.push({
          transactionId: randomUUID(),
          tenantId: item.tenantId,
          branchId: item.branchId,
          sourceQueueId: item.queueId,
          eventType: item.eventType,
          idempotencyKey: item.idempotencyKey,
          createdAt: this.store.nowIso(),
        });

        item.state = "CONFIRMED";
        item.updatedAt = this.store.nowIso();
        item.nextRetryAt = undefined;
        if (item.eventType === "LOYALTY" || item.eventType === "REPORT") {
          this.store.addOfflineEventLog({
            tenantId: item.tenantId,
            branchId: item.branchId,
            queueId: item.queueId,
            idempotencyKey: item.idempotencyKey,
            eventType: item.eventType,
            status: "SYNCED",
            message: "Queued event confirmed by sync.",
            actorUserId: ctx.userId,
          });
        }
        confirmed += 1;
      } catch (error) {
        const nextRetryCount = item.retryCount + 1;
        const exhausted = nextRetryCount >= OFFLINE_SYNC_POLICY.maxRetryAttempts;
        item.state = "FAILED";
        item.errorCode = exhausted ? "OFFLINE_RETRY_EXHAUSTED" : "SYNC_FAILED";
        item.errorMessage = error instanceof Error ? error.message : "Unknown sync error";
        item.updatedAt = this.store.nowIso();
        if (exhausted) {
          item.retryCount = nextRetryCount;
          item.nextRetryAt = undefined;
          this.store.addOfflineAlert({
            tenantId: item.tenantId,
            branchId: item.branchId,
            category: "QUEUE",
            severity: "READ_ONLY",
            message: `Queue item ${item.queueId} exhausted retry attempts (${OFFLINE_SYNC_POLICY.maxRetryAttempts}).`,
            source: "OFFLINE_SLA",
            acknowledged: false,
          });
          escalations += 1;
        } else {
          this.scheduleRetry(item);
        }
        if (item.eventType === "LOYALTY" || item.eventType === "REPORT") {
          this.store.addOfflineEventLog({
            tenantId: item.tenantId,
            branchId: item.branchId,
            queueId: item.queueId,
            idempotencyKey: item.idempotencyKey,
            eventType: item.eventType,
            status: "FAILED",
            message: item.errorMessage,
            actorUserId: ctx.userId,
          });
        }
        failed += 1;
      }
    }

    this.maybeCreateProlongedOfflineAlert(ctx);
    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/sync/retry", "POST", "QUEUE_SYNC");

    const actionable = Math.max(0, items.length - deferred);
    const retrySuccessRatePct = actionable > 0 ? round2((confirmed / actionable) * 100) : 100;
    const escalationRatePct = actionable > 0 ? round2((escalations / actionable) * 100) : 0;
    this.store.addStructuredMetric({
      metricName: "offline_retry_success_rate_pct",
      metricUnit: "ratio",
      metricValue: retrySuccessRatePct,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      tags: {
        actionable: String(actionable),
        confirmed: String(confirmed),
      },
      source: "SERVICE",
    });
    this.store.addStructuredMetric({
      metricName: "offline_escalation_rate_pct",
      metricUnit: "ratio",
      metricValue: escalationRatePct,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      tags: {
        actionable: String(actionable),
        escalations: String(escalations),
      },
      source: "SERVICE",
    });

    return {
      processed: items.length,
      confirmed,
      conflicts,
      failed,
      deferred,
      expired,
    };
  }

  private detectSaleConflict(ctx: RequestContext, item: OfflineQueueItem): ConflictRecord | null {
    const payload = item.payload as {
      mode: "RETAIL" | "WHOLESALE";
      lines: SaleLine[];
      productUpdatedAtMap: Record<string, string>;
    };

    for (const line of payload.lines) {
      const product = assertProductForTenant(this.store.products, line.productId, ctx.tenantId);
      const localUpdatedAt = payload.productUpdatedAtMap[line.productId];
      const serverUnitPrice = payload.mode === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;

      if (product.updatedAt > localUpdatedAt && round2(serverUnitPrice) !== round2(line.unitPrice)) {
        return {
          conflictId: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          queueId: item.queueId,
          conflictType: "PRICE",
          localValue: {
            productId: line.productId,
            unitPrice: line.unitPrice,
          },
          serverValue: {
            productId: line.productId,
            unitPrice: serverUnitPrice,
          },
          resolutionStatus: "OPEN",
          createdAt: this.store.nowIso(),
        };
      }
    }

    return null;
  }

  private applyQueuedLoyaltyMutation(ctx: RequestContext, item: OfflineQueueItem): void {
    if (!this.store.getFeatureFlag(ctx.tenantId, "loyalty_rules")) {
      throw new ServiceError("FEATURE_FLAG_DISABLED", "Loyalty rules are disabled for this tenant", 409);
    }

    const payload = item.payload as unknown as LoyaltyQueuePayload;
    const customer = this.store.customers.find(
      (entry) => entry.customerId === payload.customerId && entry.tenantId === ctx.tenantId && entry.branchId === ctx.branchId,
    );
    if (!customer) {
      throw new ServiceError("CUSTOMER_NOT_FOUND", "Customer not found for queued loyalty payload", 404);
    }
    if (payload.expectedBalanceBefore === undefined) {
      return;
    }
    if (customer.currentPoints !== payload.expectedBalanceBefore) {
      return;
    }

    let delta = payload.points;
    let operation: "ACCRUE" | "REDEEM" | "ADJUST" = "ACCRUE";
    if (payload.operation === "REDEEM") {
      if (customer.currentPoints < payload.points) {
        throw new ServiceError("INSUFFICIENT_POINTS", "Not enough points for queued redemption", 409);
      }
      delta = -payload.points;
      operation = "REDEEM";
    } else if (payload.operation === "ADJUST") {
      operation = "ADJUST";
    }

    customer.currentPoints += delta;
    this.store.loyaltyLedger.push({
      loyaltyEntryId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customer.customerId,
      pointsDelta: delta,
      reason: payload.reason,
      actorUserId: ctx.userId,
      createdAt: this.store.nowIso(),
    });
    this.store.addLoyaltyRewardHistory({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customer.customerId,
      operation,
      pointsDelta: delta,
      balanceAfter: customer.currentPoints,
      reason: payload.reason,
      actorUserId: ctx.userId,
      source: "OFFLINE_SYNC",
    });

    this.store.events.emit("pointsChange", {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customer.customerId,
      pointsDelta: delta,
      userId: ctx.userId,
      role: ctx.role,
    });
  }

  private detectLoyaltyConflict(ctx: RequestContext, item: OfflineQueueItem): ConflictRecord | null {
    const payload = item.payload as unknown as LoyaltyQueuePayload;
    const customer = this.store.customers.find(
      (entry) => entry.customerId === payload.customerId && entry.tenantId === ctx.tenantId && entry.branchId === ctx.branchId,
    );

    if (!customer) {
      return {
        conflictId: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        queueId: item.queueId,
        conflictType: "UNKNOWN",
        localValue: payload as unknown as Record<string, unknown>,
        serverValue: {
          customerId: payload.customerId,
          currentPoints: null,
        },
        resolutionStatus: "OPEN",
        createdAt: this.store.nowIso(),
      };
    }

    const expectedBefore = payload.expectedBalanceBefore;
    if (expectedBefore === undefined) {
      return null;
    }
    if (payload.operation === "REDEEM" && expectedBefore < payload.points) {
      return {
        conflictId: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        queueId: item.queueId,
        conflictType: "QUANTITY",
        localValue: payload as unknown as Record<string, unknown>,
        serverValue: {
          customerId: payload.customerId,
          currentPoints: customer.currentPoints,
        },
        resolutionStatus: "OPEN",
        createdAt: this.store.nowIso(),
      };
    }

    const expectedAfter =
      payload.operation === "REDEEM" ? expectedBefore - payload.points : expectedBefore + payload.points;
    const acceptableBalances = new Set<number>([expectedBefore, expectedAfter]);
    if (!acceptableBalances.has(customer.currentPoints)) {
      return {
        conflictId: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        queueId: item.queueId,
        conflictType: "QUANTITY",
        localValue: {
          customerId: payload.customerId,
          operation: payload.operation,
          expectedBalanceAfter: expectedAfter,
          points: payload.points,
        },
        serverValue: {
          customerId: payload.customerId,
          currentPoints: customer.currentPoints,
        },
        resolutionStatus: "OPEN",
        createdAt: this.store.nowIso(),
      };
    }

    return null;
  }

  listConflicts(ctx: RequestContext): ConflictRecord[] {
    return this.store.conflicts.filter((item) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId);
  }

  resolveConflict(ctx: RequestContext, conflictId: string, note: string): ConflictRecord {
    const conflict = this.store.resolveConflict(conflictId, ctx.userId, note);
    const queue = this.store.queue.find((item) => item.queueId === conflict.queueId);
    if (queue) {
      queue.state = "CONFIRMED";
      queue.updatedAt = this.store.nowIso();
      if (!this.store.idempotencyKeys.has(`${queue.tenantId}:${queue.idempotencyKey}`)) {
        this.store.idempotencyKeys.add(`${queue.tenantId}:${queue.idempotencyKey}`);
      }
    }

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/conflicts/:conflictId/resolve", "POST", "CONFLICT_RESOLVE");
    return conflict;
  }

  escalateConflict(ctx: RequestContext, conflictId: string, note: string): ConflictRecord {
    const conflict = this.store.escalateConflict(conflictId, ctx.userId, note);
    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/conflicts/:conflictId/escalate", "POST", "CONFLICT_ESCALATE");
    return conflict;
  }

  listSales(ctx: RequestContext): Sale[] {
    return this.store.sales.filter((sale) => sale.tenantId === ctx.tenantId && sale.branchId === ctx.branchId);
  }

  getSale(ctx: RequestContext, saleId: string): Sale {
    const sale = this.store.sales.find(
      (item) => item.saleId === saleId && item.tenantId === ctx.tenantId && item.branchId === ctx.branchId,
    );

    if (!sale) {
      throw new ServiceError("SALE_NOT_FOUND", "Sale not found", 404);
    }

    return sale;
  }

  voidSale(ctx: RequestContext, saleId: string): Sale {
    const sale = this.getSale(ctx, saleId);
    if (sale.status === "VOID") {
      return sale;
    }

    sale.status = "VOID";
    for (const line of sale.lines) {
      const stock = this.store.getStock(ctx.tenantId, ctx.branchId, line.productId);
      this.store.setStock(ctx.tenantId, ctx.branchId, line.productId, stock + line.quantity);
    }

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/sales/:saleId/void", "POST", "SALE_VOID");
    return sale;
  }

  listCustomers(ctx: RequestContext) {
    return this.store.customers.filter((item) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId);
  }

  createCustomer(ctx: RequestContext, input: { name: string; phone: string }) {
    const customer = {
      customerId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: input.name,
      phone: input.phone,
      visitCount: 0,
      totalSpending: 0,
      currentPoints: 0,
      tierName: "STANDARD" as const,
    };

    this.store.customers.push(customer);
    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/customers", "POST", "CUSTOMER_CREATE");
    return customer;
  }

  updateCustomer(ctx: RequestContext, customerId: string, input: { name?: string; phone?: string }) {
    const customer = this.store.customers.find(
      (item) => item.customerId === customerId && item.tenantId === ctx.tenantId && item.branchId === ctx.branchId,
    );

    if (!customer) {
      throw new ServiceError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    }

    Object.assign(customer, input);
    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/customers/:customerId", "PATCH", "CUSTOMER_UPDATE");
    return customer;
  }

  loyaltyRedeem(ctx: RequestContext, input: LoyaltyRedeemInput) {
    if (!this.store.getFeatureFlag(ctx.tenantId, "loyalty_rules")) {
      throw new ServiceError("FEATURE_FLAG_DISABLED", "Loyalty rules are disabled for this tenant", 409);
    }

    const customer = this.store.customers.find(
      (item) => item.customerId === input.customerId && item.tenantId === ctx.tenantId && item.branchId === ctx.branchId,
    );

    if (!customer) {
      throw new ServiceError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
    }

    if (input.points <= 0) {
      throw new ServiceError("INVALID_POINTS", "Points must be positive", 400);
    }

    if (customer.currentPoints < input.points) {
      throw new ServiceError("INSUFFICIENT_POINTS", "Not enough points", 409);
    }

    const minRedeemPoints =
      this.store.loyaltyRewardRules.find((item) => item.tenantId === ctx.tenantId)?.minRedeemPoints ?? 100;
    if (input.points < minRedeemPoints) {
      throw new ServiceError("MIN_REDEEM_NOT_MET", `Minimum redeem points is ${minRedeemPoints}`, 409);
    }

    customer.currentPoints -= input.points;
    this.store.loyaltyLedger.push({
      loyaltyEntryId: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customer.customerId,
      pointsDelta: -input.points,
      reason: input.reason,
      actorUserId: ctx.userId,
      createdAt: this.store.nowIso(),
    });
    this.store.addLoyaltyRewardHistory({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customer.customerId,
      operation: "REDEEM",
      pointsDelta: -input.points,
      balanceAfter: customer.currentPoints,
      reason: input.reason,
      actorUserId: ctx.userId,
      source: "POS",
    });

    this.store.events.emit("pointsChange", {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerId: customer.customerId,
      pointsDelta: -input.points,
      userId: ctx.userId,
      role: ctx.role,
    });

    this.auditAllow(ctx, "/api/v1/tenants/:tenantId/loyalty/redeem", "POST", "LOYALTY_REDEEM");
    return customer;
  }

  getTenantReport(ctx: RequestContext, reportId: ReportId): ReportResult {
    if (!allReportIds.includes(reportId)) {
      throw new ServiceError("REPORT_NOT_FOUND", "Unknown report id", 404);
    }

    if (!reportId.startsWith("REP-T-") && !reportId.startsWith("REP-A-")) {
      throw new ServiceError("INVALID_TENANT_REPORT", "Report is not tenant-scoped", 403);
    }

    const rows = this.generateReportRows(ctx, reportId);
    this.auditAllow(ctx, `/api/v1/reports/tenant/${reportId}`, "GET", "REPORT_TENANT_READ");

    return {
      reportId,
      generatedAt: this.store.nowIso(),
      rows,
    };
  }

  getOwnerReport(ctx: RequestContext, reportId: ReportId): ReportResult {
    if (!ownerReportIds.includes(reportId)) {
      throw new ServiceError("INVALID_OWNER_REPORT", "Report is not owner-scoped", 403);
    }

    const rows = this.generateReportRows(ctx, reportId);
    this.auditAllow(ctx, `/api/v1/reports/owner/${reportId}`, "GET", "REPORT_OWNER_READ");

    return {
      reportId,
      generatedAt: this.store.nowIso(),
      rows,
    };
  }

  private generateReportRows(ctx: RequestContext, reportId: ReportId): Array<Record<string, string | number | boolean | null>> {
    const tenantSales = this.store.sales.filter((sale) => sale.tenantId === ctx.tenantId);
    const branchSales = tenantSales.filter((sale) => sale.branchId === ctx.branchId);

    if (reportId === "REP-T-001") {
      return [
        {
          business_date: new Date().toISOString().slice(0, 10),
          branch_name: this.store.branches.find((b) => b.branchId === ctx.branchId)?.branchName ?? ctx.branchId,
          gross_sales: round2(sum(branchSales.map((sale) => sale.subtotal))),
          discount_total: round2(sum(branchSales.map((sale) => sale.discountTotal))),
          tax_total: round2(sum(branchSales.map((sale) => sale.taxTotal))),
          net_sales: round2(sum(branchSales.map((sale) => sale.netTotal))),
          receipt_count: branchSales.length,
          avg_receipt: branchSales.length ? round2(sum(branchSales.map((sale) => sale.netTotal)) / branchSales.length) : 0,
        },
      ];
    }

    if (reportId === "REP-T-002") {
      return [
        {
          year_month: new Date().toISOString().slice(0, 7),
          net_sales: round2(sum(tenantSales.map((sale) => sale.netTotal))),
          receipt_count: tenantSales.length,
          avg_receipt: tenantSales.length ? round2(sum(tenantSales.map((sale) => sale.netTotal)) / tenantSales.length) : 0,
          growth_pct: 0,
        },
      ];
    }

    if (reportId === "REP-T-003") {
      return this.store.products
        .filter((product) => product.tenantId === ctx.tenantId)
        .map((product) => {
          const onHand = this.store.getStock(ctx.tenantId, ctx.branchId, product.productId);
          return {
            product_sku: product.sku,
            product_name: product.nameEn,
            branch_name: this.store.branches.find((branch) => branch.branchId === ctx.branchId)?.branchName ?? ctx.branchId,
            on_hand_qty: onHand,
            cost_price: product.costPrice,
            retail_price: product.retailPrice,
            inventory_value_cost: round2(onHand * product.costPrice),
            inventory_value_retail: round2(onHand * product.retailPrice),
          };
        });
    }

    if (reportId === "REP-T-004") {
      return this.store.products
        .filter((product) => product.tenantId === ctx.tenantId)
        .map((product) => {
          const onHand = this.store.getStock(ctx.tenantId, ctx.branchId, product.productId);
          return {
            product_sku: product.sku,
            product_name: product.nameEn,
            branch_name: this.store.branches.find((branch) => branch.branchId === ctx.branchId)?.branchName ?? ctx.branchId,
            on_hand_qty: onHand,
            stock_alert_level: product.stockAlert,
            stock_gap: round2(product.stockAlert - onHand),
            last_movement_at: this.store.inventoryLogs
              .filter((log) => log.productId === product.productId)
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.createdAt,
          };
        })
        .filter((row) => Number(row.on_hand_qty) <= Number(row.stock_alert_level));
    }

    if (reportId === "REP-T-005") {
      const revenue = round2(sum(tenantSales.map((sale) => sale.netTotal)));
      const cogs = round2(sum(tenantSales.flatMap((sale) => sale.lines.map((line) => line.costSnapshotAtSale * line.quantity))));
      const grossProfit = round2(revenue - cogs);
      const margin = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;
      return [
        {
          date_bucket: new Date().toISOString().slice(0, 10),
          revenue,
          cogs,
          gross_profit: grossProfit,
          gross_margin_pct: margin,
        },
      ];
    }

    if (reportId === "REP-T-006") {
      return this.store.users
        .filter((user) => user.tenantId === ctx.tenantId)
        .map((user) => {
          const ownSales = tenantSales.filter((sale) => sale.cashierUserId === user.userId);
          const total = round2(sum(ownSales.map((sale) => sale.netTotal)));
          return {
            user_id: user.userId,
            user_name: user.email,
            role: user.role,
            branch_name: this.store.branches.find((branch) => branch.branchId === user.branchId)?.branchName ?? user.branchId,
            sales_count: ownSales.length,
            sales_total: total,
            avg_sale: ownSales.length ? round2(total / ownSales.length) : 0,
            discount_override_count: this.store.auditLogs.filter(
              (log) => log.actorUserId === user.userId && log.actionType === "DISCOUNT_OVERRIDE",
            ).length,
          };
        });
    }

    if (reportId === "REP-T-007") {
      return this.store.customers
        .filter((customer) => customer.tenantId === ctx.tenantId)
        .map((customer) => {
          const ledger = this.store.loyaltyLedger.filter((entry) => entry.customerId === customer.customerId);
          const pointsEarned = sum(ledger.filter((entry) => entry.pointsDelta > 0).map((entry) => entry.pointsDelta));
          const pointsRedeemed = Math.abs(sum(ledger.filter((entry) => entry.pointsDelta < 0).map((entry) => entry.pointsDelta)));

          return {
            customer_id: customer.customerId,
            customer_name: customer.name,
            current_points: customer.currentPoints,
            points_earned: pointsEarned,
            points_redeemed: pointsRedeemed,
            total_spend: customer.totalSpending,
            tier_name: customer.tierName,
          };
        });
    }

    if (reportId === "REP-T-008") {
      return tenantSales.flatMap((sale) =>
        sale.lines.map((line) => {
          const product = assertProductForTenant(this.store.products, line.productId, ctx.tenantId);
          return {
            tax_category: product.taxCategory,
            rule_id: `${ctx.tenantId}-${product.taxCategory}`,
            taxable_sales: line.taxableAmount,
            tax_amount: line.taxAmount,
            effective_rate: line.taxableAmount > 0 ? round2((line.taxAmount / line.taxableAmount) * 100) : 0,
          };
        }),
      );
    }

    if (reportId === "REP-O-001") {
      const tenantIds = Array.from(new Set(this.store.users.map((user) => user.tenantId)));
      return tenantIds.map((tenantId) => {
        const tenantSalesAll = this.store.sales.filter((sale) => sale.tenantId === tenantId);
        return {
          tenant_id: tenantId,
          tenant_name: tenantId,
          active_users: this.store.users.filter((user) => user.tenantId === tenantId && user.isActive).length,
          active_branches: this.store.branches.filter((branch) => branch.tenantId === tenantId && branch.isActive).length,
          sales_count: tenantSalesAll.length,
          net_sales: round2(sum(tenantSalesAll.map((sale) => sale.netTotal))),
          last_activity_at: tenantSalesAll.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.createdAt,
        };
      });
    }

    if (reportId === "REP-O-002") {
      const tenantIds = Array.from(new Set(this.store.users.map((user) => user.tenantId)));
      const tenantTotals = tenantIds.map((tenantId) => {
        const total = round2(sum(this.store.sales.filter((sale) => sale.tenantId === tenantId).map((sale) => sale.netTotal)));
        return { tenantId, total };
      });
      const platformGmv = round2(sum(tenantTotals.map((row) => row.total)));
      return tenantTotals.map((row) => ({
        tenant_id: row.tenantId,
        tenant_name: row.tenantId,
        net_sales: row.total,
        share_pct: platformGmv > 0 ? round2((row.total / platformGmv) * 100) : 0,
        growth_pct: 0,
      }));
    }

    if (reportId === "REP-O-003") {
      return this.store.metrics.map((metric) => ({
        timestamp_bucket: metric.timestamp,
        request_count: metric.requestCount,
        error_rate_pct: metric.requestCount > 0 ? round2((metric.errorCount / metric.requestCount) * 100) : 0,
        p95_latency_ms: metric.p95LatencyMs,
        sync_backlog_count: metric.syncBacklogCount,
        uptime_pct: metric.uptimePct,
      }));
    }

    if (reportId === "REP-O-004") {
      return this.store.conflicts.map((conflict) => ({
        tenant_id: conflict.tenantId,
        branch_id: conflict.branchId,
        risk_event_type: conflict.conflictType,
        risk_score: conflict.conflictType === "PRICE" ? 50 : 30,
        action_taken: conflict.resolutionStatus,
        occurred_at: conflict.createdAt,
      }));
    }

    if (reportId === "REP-O-005") {
      const tenantIds = Array.from(new Set(this.store.users.map((user) => user.tenantId)));
      const activeTenantCount = tenantIds.filter(
        (tenantId) => this.store.sales.filter((sale) => sale.tenantId === tenantId).length > 0,
      ).length;
      return [
        {
          period: new Date().toISOString().slice(0, 7),
          new_tenants: 0,
          active_tenants: activeTenantCount,
          retention_pct: tenantIds.length > 0 ? round2((activeTenantCount / tenantIds.length) * 100) : 0,
          avg_sales_per_tenant: activeTenantCount > 0 ? round2(sum(this.store.sales.map((sale) => sale.netTotal)) / activeTenantCount) : 0,
        },
      ];
    }

    if (reportId === "REP-O-006") {
      const actionGroups = new Map<string, number>();
      for (const log of this.store.auditLogs) {
        actionGroups.set(log.actionType, (actionGroups.get(log.actionType) ?? 0) + 1);
      }
      return Array.from(actionGroups.entries()).map(([feature, count]) => ({
        feature_key: feature,
        tenant_id: ctx.tenantId,
        event_count: count,
        unique_users: new Set(this.store.auditLogs.filter((log) => log.actionType === feature).map((log) => log.actorUserId)).size,
        adoption_pct: 0,
      }));
    }

    if (reportId === "REP-O-007") {
      const endpointGroups = new Map<string, { errors: number; requests: number }>();
      for (const log of this.store.auditLogs) {
        const current = endpointGroups.get(log.endpoint) ?? { errors: 0, requests: 0 };
        current.requests += 1;
        if (log.decision === "DENY") {
          current.errors += 1;
        }
        endpointGroups.set(log.endpoint, current);
      }
      return Array.from(endpointGroups.entries()).map(([endpoint, stats]) => ({
        endpoint,
        error_code: "AUTHZ",
        error_count: stats.errors,
        request_count: stats.requests,
        error_rate_pct: stats.requests > 0 ? round2((stats.errors / stats.requests) * 100) : 0,
      }));
    }

    if (reportId === "REP-O-008") {
      return this.store.backupRuns.map((run) => ({
        tenant_id: run.tenantId,
        backup_job_id: run.backupRunId,
        last_success_at: run.status === "SUCCESS" ? run.createdAt : null,
        success_rate_pct: run.status === "SUCCESS" ? 100 : 0,
        avg_duration_sec: run.durationSec,
        last_restore_test_at: run.restoreTestAt ?? null,
      }));
    }

    if (reportId === "REP-A-001") {
      const total = round2(sum(tenantSales.map((sale) => sale.netTotal)));
      return [
        {
          forecast_period: "next_month",
          predicted_net_sales: round2(total * 1.05),
          confidence_band: "medium",
          model_version: "baseline-1",
        },
      ];
    }

    if (reportId === "REP-A-002") {
      return tenantSales.map((sale) => ({
        period: sale.createdAt.slice(0, 10),
        net_sales: sale.netTotal,
        trend_direction: "stable",
      }));
    }

    if (reportId === "REP-A-003") {
      const byBranch = new Map<string, number>();
      for (const sale of tenantSales) {
        byBranch.set(sale.branchId, round2((byBranch.get(sale.branchId) ?? 0) + sale.netTotal));
      }
      return Array.from(byBranch.entries()).map(([branchId, total]) => ({
        branch_id: branchId,
        net_sales: total,
      }));
    }

    if (reportId === "REP-A-004") {
      const byProduct = new Map<string, number>();
      for (const sale of tenantSales) {
        for (const line of sale.lines) {
          byProduct.set(line.productId, round2((byProduct.get(line.productId) ?? 0) + line.netLineTotal));
        }
      }
      return Array.from(byProduct.entries()).map(([productId, total]) => ({
        metric_name: "product_net_sales",
        metric_key: productId,
        metric_value: total,
      }));
    }

    return [];
  }

  validateTenantRouteAccess(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  validateBranchScopedRoute(ctx: RequestContext): void {
    assertBranchForTenant(this.store.branches, ctx.branchId, ctx.tenantId);
    const user = assertUser(this.store.users, ctx.userId);
    if (ctx.role !== "APPLICATION_OWNER" && user.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "User tenant mismatch", 403);
    }
  }

  validateTenantReportRole(ctx: RequestContext, reportId: ReportId): void {
    if (!tenantReportIds.includes(reportId) && !reportId.startsWith("REP-A-")) {
      throw new ServiceError("REPORT_NOT_ALLOWED", "Invalid tenant report id", 403);
    }

    if (ctx.role === "INVENTORY_STAFF" && !["REP-T-003", "REP-T-004"].includes(reportId)) {
      throw new ServiceError("REPORT_NOT_ALLOWED", "Inventory staff can access inventory reports only", 403);
    }

    if (ctx.role === "CASHIER" && reportId === "REP-T-005" && !this.store.systemConfig.cashierCanViewProfit) {
      throw new ServiceError("REPORT_NOT_ALLOWED", "Cashier cannot access profit summary", 403);
    }
  }

  validateOwnerReportRole(ctx: RequestContext): void {
    if (ctx.role !== "APPLICATION_OWNER") {
      throw new ServiceError("REPORT_NOT_ALLOWED", "Owner reports are restricted to application owner", 403);
    }
  }
}
