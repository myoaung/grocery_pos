import { randomUUID } from "crypto";
import { PosService } from "../../services/posService";
import type { MemoryStore } from "../../store/memoryStore";
import type {
  LoyaltyOperation,
  LoyaltyQueuePayload,
  LoyaltyRewardHistory,
  LoyaltyRewardRule,
  RequestContext,
} from "../../types";
import { ServiceError } from "../../utils/errors";

interface BalanceView {
  customerId: string;
  name: string;
  tierName: string;
  currentPoints: number;
  redeemableKyat: number;
}

interface AccrueInput {
  customerId: string;
  reason: string;
  amountKyat?: number;
  points?: number;
  offline?: boolean;
  idempotencyKey?: string;
  deviceId?: string;
}

interface RedeemInput {
  customerId: string;
  points: number;
  reason: string;
  offline?: boolean;
  idempotencyKey?: string;
  deviceId?: string;
}

interface UpdateRuleInput {
  pointsPerKyat?: number;
  redemptionRateKyatPerPoint?: number;
  minRedeemPoints?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class LoyaltyRewardsService {
  private readonly posService: PosService;

  constructor(private readonly store: MemoryStore) {
    this.posService = new PosService(store);
  }

  private assertFeatureEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "loyalty_rules")) {
      return;
    }
    throw new ServiceError("FEATURE_FLAG_DISABLED", "Loyalty rules are disabled for this tenant", 409);
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private getCustomer(ctx: RequestContext, tenantId: string, customerId: string) {
    this.assertTenantScope(ctx, tenantId);
    const customer = this.store.customers.find(
      (item) => item.customerId === customerId && item.tenantId === tenantId && item.branchId === ctx.branchId,
    );
    if (!customer) {
      throw new ServiceError("CUSTOMER_NOT_FOUND", "Customer not found in tenant/branch scope", 404);
    }
    return customer;
  }

  private validateRule(rule: LoyaltyRewardRule): void {
    if (rule.pointsPerKyat <= 0) {
      throw new ServiceError("INVALID_LOYALTY_RULE", "pointsPerKyat must be greater than 0", 400);
    }
    if (rule.redemptionRateKyatPerPoint <= 0) {
      throw new ServiceError("INVALID_LOYALTY_RULE", "redemptionRateKyatPerPoint must be greater than 0", 400);
    }
    if (!Number.isInteger(rule.minRedeemPoints) || rule.minRedeemPoints < 0) {
      throw new ServiceError("INVALID_LOYALTY_RULE", "minRedeemPoints must be a non-negative integer", 400);
    }
  }

  getRule(ctx: RequestContext, tenantId: string): LoyaltyRewardRule {
    this.assertTenantScope(ctx, tenantId);
    const existing = this.store.loyaltyRewardRules.find((item) => item.tenantId === tenantId);
    if (existing) {
      return existing;
    }

    const fallback: LoyaltyRewardRule = {
      tenantId,
      pointsPerKyat: 0.01,
      redemptionRateKyatPerPoint: 25,
      minRedeemPoints: 100,
    };
    this.store.upsertLoyaltyRule(fallback);
    return fallback;
  }

  updateRule(ctx: RequestContext, tenantId: string, input: UpdateRuleInput): LoyaltyRewardRule {
    this.assertTenantScope(ctx, tenantId);
    this.assertFeatureEnabled(tenantId);
    const current = this.getRule(ctx, tenantId);
    const next: LoyaltyRewardRule = {
      tenantId,
      pointsPerKyat: input.pointsPerKyat ?? current.pointsPerKyat,
      redemptionRateKyatPerPoint: input.redemptionRateKyatPerPoint ?? current.redemptionRateKyatPerPoint,
      minRedeemPoints: input.minRedeemPoints ?? current.minRedeemPoints,
    };

    this.validateRule(next);
    this.store.upsertLoyaltyRule(next);
    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/rewards/rules",
      method: "PATCH",
      decision: "ALLOW",
      reason: "LOYALTY_RULE_UPDATE",
      actionType: "LOYALTY_RULE_UPDATE",
    });

    return next;
  }

  getBalance(ctx: RequestContext, tenantId: string, customerId: string): BalanceView {
    const customer = this.getCustomer(ctx, tenantId, customerId);
    const rule = this.getRule(ctx, tenantId);
    return {
      customerId: customer.customerId,
      name: customer.name,
      tierName: customer.tierName,
      currentPoints: customer.currentPoints,
      redeemableKyat: round2(customer.currentPoints * rule.redemptionRateKyatPerPoint),
    };
  }

  listHistory(ctx: RequestContext, tenantId: string, customerId?: string): LoyaltyRewardHistory[] {
    this.assertTenantScope(ctx, tenantId);
    return this.store.loyaltyRewardHistory
      .filter(
        (item) =>
          item.tenantId === tenantId && item.branchId === ctx.branchId && (customerId ? item.customerId === customerId : true),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  getKpis(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    const history = this.store.loyaltyRewardHistory.filter(
      (item) => item.tenantId === tenantId && item.branchId === ctx.branchId,
    );
    const customers = this.store.customers.filter(
      (item) => item.tenantId === tenantId && item.branchId === ctx.branchId,
    );

    const accrued = history
      .filter((item) => item.pointsDelta > 0)
      .reduce((acc, item) => acc + item.pointsDelta, 0);
    const redeemed = Math.abs(
      history
        .filter((item) => item.pointsDelta < 0)
        .reduce((acc, item) => acc + item.pointsDelta, 0),
    );
    const activeMembers = customers.filter((item) => item.currentPoints > 0).length;

    return {
      tenantId,
      branchId: ctx.branchId,
      members: customers.length,
      activeMembers,
      totalPointsAccrued: accrued,
      totalPointsRedeemed: redeemed,
      netPointsOutstanding: Math.max(0, accrued - redeemed),
      redemptionRatePct: accrued > 0 ? round2((redeemed / accrued) * 100) : 0,
    };
  }

  private resolveAccrualPoints(rule: LoyaltyRewardRule, input: AccrueInput): number {
    if (input.points !== undefined) {
      if (!Number.isInteger(input.points) || input.points <= 0) {
        throw new ServiceError("INVALID_POINTS", "Points must be a positive integer", 400);
      }
      return input.points;
    }

    if (input.amountKyat === undefined || input.amountKyat <= 0) {
      throw new ServiceError("INVALID_AMOUNT", "amountKyat must be a positive number", 400);
    }

    const points = Math.floor(input.amountKyat * rule.pointsPerKyat);
    if (points <= 0) {
      throw new ServiceError("INSUFFICIENT_ACCRUAL_AMOUNT", "Amount does not yield any loyalty points", 409);
    }
    return points;
  }

  private recordMutation(
    ctx: RequestContext,
    tenantId: string,
    customerId: string,
    operation: LoyaltyOperation,
    pointsDelta: number,
    reason: string,
    source: "POS" | "DASHBOARD" | "OFFLINE_SYNC",
  ) {
    const customer = this.getCustomer(ctx, tenantId, customerId);
    const nextPoints = customer.currentPoints + pointsDelta;
    if (nextPoints < 0) {
      throw new ServiceError("INSUFFICIENT_POINTS", "Not enough points", 409);
    }

    customer.currentPoints = nextPoints;
    this.store.loyaltyLedger.push({
      loyaltyEntryId: randomUUID(),
      tenantId,
      branchId: ctx.branchId,
      customerId,
      pointsDelta,
      reason,
      actorUserId: ctx.userId,
      createdAt: this.store.nowIso(),
    });
    this.store.addLoyaltyRewardHistory({
      tenantId,
      branchId: ctx.branchId,
      customerId,
      operation,
      pointsDelta,
      balanceAfter: nextPoints,
      reason,
      actorUserId: ctx.userId,
      source,
    });

    this.store.events.emit("pointsChange", {
      tenantId,
      branchId: ctx.branchId,
      customerId,
      pointsDelta,
      userId: ctx.userId,
      role: ctx.role,
    });

    return customer;
  }

  accrue(ctx: RequestContext, tenantId: string, input: AccrueInput) {
    this.assertFeatureEnabled(tenantId);
    const rule = this.getRule(ctx, tenantId);
    const points = this.resolveAccrualPoints(rule, input);
    const customer = this.recordMutation(
      ctx,
      tenantId,
      input.customerId,
      "ACCRUE",
      points,
      input.reason,
      input.offline ? "POS" : "DASHBOARD",
    );

    let queueId: string | undefined;
    if (input.offline) {
      const queued = this.posService.enqueueEvent(ctx, {
        eventType: "LOYALTY",
        payload: {
          operation: "ACCRUE",
          customerId: input.customerId,
          points,
          reason: input.reason,
          expectedBalanceBefore: customer.currentPoints - points,
        } as unknown as Record<string, unknown>,
        idempotencyKey: input.idempotencyKey,
        deviceId: input.deviceId,
      });
      queueId = queued.queueId;
    }

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/rewards/accrue",
      method: "POST",
      decision: "ALLOW",
      reason: "LOYALTY_REWARD_ACCRUE",
      actionType: "LOYALTY_REWARD_ACCRUE",
    });

    return {
      customer,
      pointsAdded: points,
      queueId,
    };
  }

  redeem(ctx: RequestContext, tenantId: string, input: RedeemInput) {
    this.assertFeatureEnabled(tenantId);
    const rule = this.getRule(ctx, tenantId);
    if (!Number.isInteger(input.points) || input.points <= 0) {
      throw new ServiceError("INVALID_POINTS", "Points must be a positive integer", 400);
    }
    if (input.points < rule.minRedeemPoints) {
      throw new ServiceError(
        "MIN_REDEEM_NOT_MET",
        `Minimum redeem points is ${rule.minRedeemPoints}`,
        409,
      );
    }

    const customer = this.getCustomer(ctx, tenantId, input.customerId);
    if (customer.currentPoints < input.points) {
      throw new ServiceError("INSUFFICIENT_POINTS", "Not enough points", 409);
    }
    const balanceBefore = customer.currentPoints;

    this.recordMutation(
      ctx,
      tenantId,
      input.customerId,
      "REDEEM",
      -input.points,
      input.reason,
      input.offline ? "POS" : "DASHBOARD",
    );

    let queueId: string | undefined;
    if (input.offline) {
      const queued = this.posService.enqueueEvent(ctx, {
        eventType: "LOYALTY",
        payload: {
          operation: "REDEEM",
          customerId: input.customerId,
          points: input.points,
          reason: input.reason,
          expectedBalanceBefore: balanceBefore,
        } as unknown as Record<string, unknown>,
        idempotencyKey: input.idempotencyKey,
        deviceId: input.deviceId,
      });
      queueId = queued.queueId;
    }

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/rewards/redeem",
      method: "POST",
      decision: "ALLOW",
      reason: "LOYALTY_REWARD_REDEEM",
      actionType: "LOYALTY_REWARD_REDEEM",
    });

    return {
      customer,
      pointsRedeemed: input.points,
      redeemedKyat: round2(input.points * rule.redemptionRateKyatPerPoint),
      queueId,
    };
  }

  applyQueuedMutation(ctx: RequestContext, tenantId: string, payload: LoyaltyQueuePayload) {
    this.assertTenantScope(ctx, tenantId);
    this.assertFeatureEnabled(tenantId);
    const customer = this.getCustomer(ctx, tenantId, payload.customerId);
    if (
      payload.expectedBalanceBefore !== undefined &&
      customer.currentPoints !== payload.expectedBalanceBefore
    ) {
      throw new ServiceError(
        "LOYALTY_BALANCE_CONFLICT",
        "Queued loyalty operation conflicts with current balance",
        409,
      );
    }

    if (payload.operation === "ACCRUE") {
      this.recordMutation(
        ctx,
        tenantId,
        payload.customerId,
        "ACCRUE",
        payload.points,
        payload.reason,
        "OFFLINE_SYNC",
      );
      return;
    }

    if (payload.operation === "REDEEM") {
      this.recordMutation(
        ctx,
        tenantId,
        payload.customerId,
        "REDEEM",
        -payload.points,
        payload.reason,
        "OFFLINE_SYNC",
      );
      return;
    }

    this.recordMutation(
      ctx,
      tenantId,
      payload.customerId,
      "ADJUST",
      payload.points,
      payload.reason,
      "OFFLINE_SYNC",
    );
  }
}
