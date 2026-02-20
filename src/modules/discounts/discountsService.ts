import type { MemoryStore } from "../../store/memoryStore";
import {
  isPolicyActive,
  resolveDiscountPolicy,
  validateDiscountPolicy,
} from "../../config/discountPolicy";
import type { RequestContext } from "../../types";
import { ServiceError } from "../../utils/errors";

interface DiscountLineInput {
  productId: string;
  quantity: number;
}

interface DiscountEvaluateInput {
  mode: "RETAIL" | "WHOLESALE";
  customerId?: string;
  lines: DiscountLineInput[];
  applyLoyaltySynergy?: boolean;
  manualOverridePct?: number;
  couponCode?: string;
}

interface DiscountRuleResult {
  ruleKey: string;
  pct: number;
  reason: string;
}

interface DiscountEvaluationResult {
  mode: "RETAIL" | "WHOLESALE";
  subtotal: number;
  stackedDiscountPct: number;
  discountTotal: number;
  finalTotal: number;
  rules: DiscountRuleResult[];
  rejectionReasons: Array<{
    code: string;
    message: string;
  }>;
  lines: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
    lineDiscount: number;
    lineTotal: number;
  }>;
  loyalty: {
    customerId: string | null;
    startingPoints: number;
    synergyPct: number;
    projectedPointsEarned: number;
  };
  resolutionPolicy: {
    order: string[];
    caps: {
      baseAutomaticPct: number;
      promoBucketPct: number;
      loyaltyPct: number;
      globalPct: number;
    };
    conflictRules: string[];
    applied: {
      baseAutomaticPct: number;
      promoPct: number;
      loyaltyPct: number;
      preGlobalCapPct: number;
      finalPct: number;
    };
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((acc, item) => acc + item, 0);
}

export class DiscountsService {
  constructor(private readonly store: MemoryStore) {}

  private assertFeatureEnabled(tenantId: string): void {
    if (this.store.getFeatureFlag(tenantId, "advanced_discounts")) {
      return;
    }
    throw new ServiceError(
      "FEATURE_FLAG_DISABLED",
      "Advanced discount engine is disabled for this tenant",
      409,
    );
  }

  private policyForTenant(tenantId: string, localeInput?: string) {
    return resolveDiscountPolicy(tenantId, localeInput);
  }

  private assertPolicyIntegrity(tenantId: string, policy: ReturnType<DiscountsService["policyForTenant"]>): void {
    const validationErrors = validateDiscountPolicy(policy);
    if (!isPolicyActive(policy, this.store.nowIso())) {
      validationErrors.push("Discount policy is outside active effective window.");
    }
    if (validationErrors.length === 0) {
      return;
    }
    throw new ServiceError(
      "DISCOUNT_POLICY_CORRUPTED",
      `${policy.reasonCodes.policyCorrupted.message} ${validationErrors.join(" ")}`,
      409,
    );
  }

  getPolicy(ctx: RequestContext, tenantId: string, localeInput?: string) {
    this.assertTenantScope(ctx, tenantId);
    const policy = this.policyForTenant(tenantId, localeInput);
    const validationErrors = validateDiscountPolicy(policy);
    return {
      ...policy,
      active: isPolicyActive(policy, this.store.nowIso()),
      validationErrors,
    };
  }

  private assertTenantScope(ctx: RequestContext, tenantId: string): void {
    if (ctx.role !== "APPLICATION_OWNER" && ctx.tenantId !== tenantId) {
      throw new ServiceError("FORBIDDEN_TENANT_SCOPE", "Tenant scope mismatch", 403);
    }
  }

  private findCustomerPoints(tenantId: string, branchId: string, customerId: string | undefined): number {
    if (!customerId) {
      return 0;
    }

    const customer = this.store.customers.find(
      (item) => item.customerId === customerId && item.tenantId === tenantId && item.branchId === branchId,
    );
    return customer?.currentPoints ?? 0;
  }

  private computeVolumePct(totalQty: number): number {
    if (totalQty >= 20) {
      return 6;
    }
    if (totalQty >= 10) {
      return 4;
    }
    if (totalQty >= 5) {
      return 2;
    }
    return 0;
  }

  private computeBasketPct(subtotal: number): number {
    if (subtotal >= 120000) {
      return 4;
    }
    if (subtotal >= 80000) {
      return 3;
    }
    if (subtotal >= 50000) {
      return 1.5;
    }
    return 0;
  }

  private computeCategoryPct(categories: Set<string>): number {
    let pct = 0;
    if (categories.has("Fruits")) {
      pct += 1;
    }
    if (categories.has("Staples")) {
      pct += 1;
    }
    return pct;
  }

  private computeLoyaltySynergyPct(points: number, apply: boolean): number {
    if (!apply) {
      return 0;
    }
    if (points >= 1000) {
      return 3;
    }
    if (points >= 400) {
      return 2;
    }
    if (points >= 150) {
      return 1;
    }
    return 0;
  }

  evaluate(ctx: RequestContext, tenantId: string, input: DiscountEvaluateInput): DiscountEvaluationResult {
    this.assertTenantScope(ctx, tenantId);
    this.assertFeatureEnabled(tenantId);
    const policy = this.policyForTenant(tenantId);
    this.assertPolicyIntegrity(tenantId, policy);

    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new ServiceError("EMPTY_CART", "At least one line is required", 400);
    }

    const manualOverridePct = input.manualOverridePct ?? 0;
    if (manualOverridePct < 0) {
      throw new ServiceError("INVALID_DISCOUNT_OVERRIDE", policy.reasonCodes.invalidManualOverride.message, 400);
    }
    if (manualOverridePct > policy.caps.manualOverrideMaxPct) {
      throw new ServiceError(
        "INVALID_DISCOUNT_OVERRIDE",
        `manualOverridePct cannot exceed ${policy.caps.manualOverrideMaxPct}%`,
        400,
      );
    }
    if (manualOverridePct > 0 && ctx.role === "CASHIER") {
      throw new ServiceError("FORBIDDEN_DISCOUNT_OVERRIDE", policy.reasonCodes.cashierOverrideForbidden.message, 403);
    }

    const expandedLines = input.lines.map((line) => {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new ServiceError("INVALID_QUANTITY", "Line quantity must be a positive integer", 400);
      }

      const product = this.store.products.find(
        (item) => item.productId === line.productId && item.tenantId === tenantId,
      );
      if (!product) {
        throw new ServiceError("PRODUCT_NOT_FOUND", "Product not found in tenant scope", 404);
      }

      const unitPrice = input.mode === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
      const lineSubtotal = round2(unitPrice * line.quantity);

      return {
        productId: product.productId,
        productName: product.nameEn,
        category: product.category,
        quantity: line.quantity,
        unitPrice,
        lineSubtotal,
      };
    });

    const subtotal = round2(sum(expandedLines.map((item) => item.lineSubtotal)));
    const totalQty = expandedLines.reduce((acc, item) => acc + item.quantity, 0);
    const categories = new Set(expandedLines.map((item) => item.category));

    const customerPoints = this.findCustomerPoints(tenantId, ctx.branchId, input.customerId);
    const loyaltySynergyPct = this.computeLoyaltySynergyPct(customerPoints, Boolean(input.applyLoyaltySynergy));

    const rules: DiscountRuleResult[] = [];

    const volumePct = this.computeVolumePct(totalQty);
    if (volumePct > 0) {
      rules.push({ ruleKey: "VOLUME_STACK", pct: volumePct, reason: `Quantity ${totalQty} qualifies` });
    }

    const basketPct = this.computeBasketPct(subtotal);
    if (basketPct > 0) {
      rules.push({ ruleKey: "BASKET_STACK", pct: basketPct, reason: `Subtotal ${subtotal} qualifies` });
    }

    const categoryPct = this.computeCategoryPct(categories);
    if (categoryPct > 0) {
      rules.push({ ruleKey: "CATEGORY_STACK", pct: categoryPct, reason: "Category bundle promotion" });
    }

    const normalizedCoupon = input.couponCode?.trim().toUpperCase() ?? "";
    const couponPct =
      normalizedCoupon.length > 0 ? policy.couponRates[normalizedCoupon] ?? 0 : 0;
    const baseAutomaticRawPct = round2(volumePct + basketPct + categoryPct);
    const baseAutomaticPct = Math.min(policy.caps.baseAutomaticPct, baseAutomaticRawPct);
    const rejectionReasons: Array<{ code: string; message: string }> = [];

    if (baseAutomaticRawPct > policy.caps.baseAutomaticPct) {
      rules.push({
        ruleKey: "BASE_CAP_ENFORCED",
        pct: 0,
        reason: `Base automatic discounts capped at ${policy.caps.baseAutomaticPct}%`,
      });
      rejectionReasons.push(policy.reasonCodes.baseCapEnforced);
    }

    let promoPct = 0;
    if (couponPct > 0 || manualOverridePct > 0) {
      const couponWins = couponPct > manualOverridePct;
      const manualWins = manualOverridePct >= couponPct;
      const winnerKey = manualWins ? "MANUAL_OVERRIDE" : "COUPON_STACK";
      const winnerPct = manualWins ? manualOverridePct : couponPct;
      const loserKey = manualWins ? "COUPON_STACK" : "MANUAL_OVERRIDE";
      const loserPct = manualWins ? couponPct : manualOverridePct;

      promoPct = Math.min(policy.caps.promoBucketPct, winnerPct);

      rules.push({
        ruleKey: winnerKey,
        pct: promoPct,
        reason: `${winnerKey} selected by promo conflict rule`,
      });
      if (loserPct > 0) {
        rules.push({
          ruleKey: `${loserKey}_SUPPRESSED`,
          pct: 0,
          reason: `${loserKey} suppressed because ${winnerKey} has higher or equal precedence`,
        });
        rejectionReasons.push({
          code: policy.reasonCodes.promoSuppressed.code,
          message: `${policy.reasonCodes.promoSuppressed.message} (${loserKey})`,
        });
      }
      if (winnerPct > policy.caps.promoBucketPct) {
        rules.push({
          ruleKey: "PROMO_CAP_ENFORCED",
          pct: 0,
          reason: `Promo bucket capped at ${policy.caps.promoBucketPct}%`,
        });
        rejectionReasons.push(policy.reasonCodes.promoCapEnforced);
      }
      if (couponWins && couponPct > 0) {
        rules.push({
          ruleKey: "COUPON_INPUT",
          pct: 0,
          reason: `Coupon ${input.couponCode} evaluated`,
        });
      }
    }

    const loyaltyPct = Math.min(policy.caps.loyaltyPct, loyaltySynergyPct);
    if (loyaltyPct > 0) {
      rules.push({ ruleKey: "LOYALTY_SYNERGY", pct: loyaltyPct, reason: `Customer points ${customerPoints}` });
    }

    const preGlobalCapPct = round2(baseAutomaticPct + promoPct + loyaltyPct);
    const stackedDiscountPct = Math.min(policy.caps.globalPct, preGlobalCapPct);
    if (preGlobalCapPct > policy.caps.globalPct) {
      rules.push({
        ruleKey: "GLOBAL_CAP_ENFORCED",
        pct: 0,
        reason: `Global discount capped at ${policy.caps.globalPct}%`,
      });
      rejectionReasons.push(policy.reasonCodes.globalCapEnforced);
    }
    const discountTotal = round2(subtotal * (stackedDiscountPct / 100));
    const finalTotal = round2(Math.max(0, subtotal - discountTotal));

    const lines = expandedLines.map((item) => {
      const lineDiscount = round2(item.lineSubtotal * (stackedDiscountPct / 100));
      const lineTotal = round2(Math.max(0, item.lineSubtotal - lineDiscount));
      return {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineSubtotal: item.lineSubtotal,
        lineDiscount,
        lineTotal,
      };
    });

    const pointsRule = this.store.loyaltyRewardRules.find((item) => item.tenantId === tenantId)?.pointsPerKyat ?? 0.01;
    const projectedPointsEarned = Math.floor(finalTotal * pointsRule);

    return {
      mode: input.mode,
      subtotal,
      stackedDiscountPct,
      discountTotal,
      finalTotal,
      rules,
      rejectionReasons,
      lines,
      loyalty: {
        customerId: input.customerId ?? null,
        startingPoints: customerPoints,
        synergyPct: loyaltySynergyPct,
        projectedPointsEarned,
      },
      resolutionPolicy: {
        order: [...policy.order],
        caps: {
          baseAutomaticPct: policy.caps.baseAutomaticPct,
          promoBucketPct: policy.caps.promoBucketPct,
          loyaltyPct: policy.caps.loyaltyPct,
          globalPct: policy.caps.globalPct,
        },
        conflictRules: [...policy.conflictRules],
        applied: {
          baseAutomaticPct,
          promoPct,
          loyaltyPct,
          preGlobalCapPct,
          finalPct: stackedDiscountPct,
        },
      },
    };
  }

  listHistory(ctx: RequestContext, tenantId: string) {
    this.assertTenantScope(ctx, tenantId);
    return this.store.discountEvaluations
      .filter((item) => item.tenantId === tenantId && item.branchId === ctx.branchId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  apply(ctx: RequestContext, tenantId: string, input: DiscountEvaluateInput) {
    this.assertFeatureEnabled(tenantId);
    const result = this.evaluate(ctx, tenantId, input);

    this.store.addDiscountEvaluation({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      customerId: input.customerId,
      mode: input.mode,
      subtotal: result.subtotal,
      stackedDiscountPct: result.stackedDiscountPct,
      discountTotal: result.discountTotal,
      finalTotal: result.finalTotal,
      manualOverridePct: input.manualOverridePct ?? 0,
      loyaltySynergyPct: result.loyalty.synergyPct,
      lineCount: result.lines.length,
    });

    this.store.addAudit({
      tenantId,
      branchId: ctx.branchId,
      actorUserId: ctx.userId,
      roleAtTime: ctx.role,
      endpoint: "/api/v1/tenants/:tenantId/discounts/advanced/apply",
      method: "POST",
      decision: "ALLOW",
      reason: `DISCOUNT_ADVANCED_APPLY_${result.stackedDiscountPct}`,
      actionType: "DISCOUNT_ADVANCED_APPLY",
    });

    return result;
  }
}
