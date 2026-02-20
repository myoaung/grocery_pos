export const DISCOUNT_REASON_CODES = Object.freeze({
  INVALID_MANUAL_OVERRIDE: "DISC_INVALID_MANUAL_OVERRIDE",
  CASHIER_OVERRIDE_FORBIDDEN: "DISC_CASHIER_OVERRIDE_FORBIDDEN",
  BASE_CAP_ENFORCED: "DISC_BASE_CAP_ENFORCED",
  PROMO_RULE_SUPPRESSED: "DISC_PROMO_RULE_SUPPRESSED",
  PROMO_CAP_ENFORCED: "DISC_PROMO_CAP_ENFORCED",
  GLOBAL_CAP_ENFORCED: "DISC_GLOBAL_CAP_ENFORCED",
  POLICY_CORRUPTED: "DISC_POLICY_CORRUPTED",
} as const);

export type DiscountReasonCodeValue =
  (typeof DISCOUNT_REASON_CODES)[keyof typeof DISCOUNT_REASON_CODES];

interface LocalizedReasonTemplate {
  code: DiscountReasonCodeValue;
  messages: {
    "en-US": string;
    "my-MM": string;
  };
}

export interface DiscountReasonCode {
  code: DiscountReasonCodeValue;
  message: string;
}

export interface DiscountPolicy {
  policyVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  order: string[];
  caps: {
    baseAutomaticPct: number;
    promoBucketPct: number;
    loyaltyPct: number;
    globalPct: number;
    manualOverrideMaxPct: number;
  };
  conflictRules: string[];
  couponRates: Record<string, number>;
  reasonCodes: {
    invalidManualOverride: DiscountReasonCode;
    cashierOverrideForbidden: DiscountReasonCode;
    baseCapEnforced: DiscountReasonCode;
    promoSuppressed: DiscountReasonCode;
    promoCapEnforced: DiscountReasonCode;
    globalCapEnforced: DiscountReasonCode;
    policyCorrupted: DiscountReasonCode;
  };
  changeImpactTemplate: {
    summary: string;
    requiredChecks: string[];
  };
}

const REASON_TEMPLATES = Object.freeze({
  invalidManualOverride: {
    code: DISCOUNT_REASON_CODES.INVALID_MANUAL_OVERRIDE,
    messages: {
      "en-US": "Manual discount override is outside policy range.",
      "my-MM": "Manual discount override is outside policy range.",
    },
  },
  cashierOverrideForbidden: {
    code: DISCOUNT_REASON_CODES.CASHIER_OVERRIDE_FORBIDDEN,
    messages: {
      "en-US": "Cashier role cannot apply manual override discounts.",
      "my-MM": "Cashier role cannot apply manual override discounts.",
    },
  },
  baseCapEnforced: {
    code: DISCOUNT_REASON_CODES.BASE_CAP_ENFORCED,
    messages: {
      "en-US": "Base automatic discounts were capped by policy.",
      "my-MM": "Base automatic discounts were capped by policy.",
    },
  },
  promoSuppressed: {
    code: DISCOUNT_REASON_CODES.PROMO_RULE_SUPPRESSED,
    messages: {
      "en-US": "Promo rule was suppressed by precedence policy.",
      "my-MM": "Promo rule was suppressed by precedence policy.",
    },
  },
  promoCapEnforced: {
    code: DISCOUNT_REASON_CODES.PROMO_CAP_ENFORCED,
    messages: {
      "en-US": "Promo discount was capped by policy.",
      "my-MM": "Promo discount was capped by policy.",
    },
  },
  globalCapEnforced: {
    code: DISCOUNT_REASON_CODES.GLOBAL_CAP_ENFORCED,
    messages: {
      "en-US": "Final stacked discount was capped by global policy.",
      "my-MM": "Final stacked discount was capped by global policy.",
    },
  },
  policyCorrupted: {
    code: DISCOUNT_REASON_CODES.POLICY_CORRUPTED,
    messages: {
      "en-US": "Discount policy is invalid and has been blocked for safety.",
      "my-MM": "Discount policy is invalid and has been blocked for safety.",
    },
  },
} as const satisfies Record<string, LocalizedReasonTemplate>);

function normalizeLocale(locale: string | undefined): "en-US" | "my-MM" {
  const normalized = String(locale ?? "en-US").trim().toLowerCase();
  if (normalized === "my-mm" || normalized === "my") {
    return "my-MM";
  }
  return "en-US";
}

function resolveReasonMessages(locale: "en-US" | "my-MM") {
  return {
    invalidManualOverride: {
      code: REASON_TEMPLATES.invalidManualOverride.code,
      message: REASON_TEMPLATES.invalidManualOverride.messages[locale],
    },
    cashierOverrideForbidden: {
      code: REASON_TEMPLATES.cashierOverrideForbidden.code,
      message: REASON_TEMPLATES.cashierOverrideForbidden.messages[locale],
    },
    baseCapEnforced: {
      code: REASON_TEMPLATES.baseCapEnforced.code,
      message: REASON_TEMPLATES.baseCapEnforced.messages[locale],
    },
    promoSuppressed: {
      code: REASON_TEMPLATES.promoSuppressed.code,
      message: REASON_TEMPLATES.promoSuppressed.messages[locale],
    },
    promoCapEnforced: {
      code: REASON_TEMPLATES.promoCapEnforced.code,
      message: REASON_TEMPLATES.promoCapEnforced.messages[locale],
    },
    globalCapEnforced: {
      code: REASON_TEMPLATES.globalCapEnforced.code,
      message: REASON_TEMPLATES.globalCapEnforced.messages[locale],
    },
    policyCorrupted: {
      code: REASON_TEMPLATES.policyCorrupted.code,
      message: REASON_TEMPLATES.policyCorrupted.messages[locale],
    },
  } as const;
}

const DEFAULT_POLICY_CORE = {
  policyVersion: "P5X-2026.02.20.1",
  effectiveFrom: "2026-02-20T00:00:00.000Z",
  effectiveTo: null,
  order: [
    "VOLUME_STACK",
    "BASKET_STACK",
    "CATEGORY_STACK",
    "COUPON_STACK",
    "LOYALTY_SYNERGY",
    "MANUAL_OVERRIDE",
  ],
  caps: {
    baseAutomaticPct: 12,
    promoBucketPct: 8,
    loyaltyPct: 3,
    globalPct: 25,
    manualOverrideMaxPct: 10,
  },
  conflictRules: [
    "COUPON_STACK and MANUAL_OVERRIDE are mutually exclusive in promo bucket (higher pct wins).",
    "On equal coupon/manual percentages, MANUAL_OVERRIDE wins by precedence order.",
    "Cashier cannot submit MANUAL_OVERRIDE > 0.",
  ],
  couponRates: {
    WEEKEND5: 5,
    VIP3: 3,
  },
  changeImpactTemplate: {
    summary: "Discount policy update impact review",
    requiredChecks: [
      "Re-run boundary tests at cap edges.",
      "Confirm reasonCode enums unchanged.",
      "Validate cashier restriction behavior.",
      "Validate CSV/PDF report parity for discount totals.",
      "Record ACP + change log updates before release.",
    ],
  },
} as const;

type DiscountPolicyOverride = Partial<Omit<DiscountPolicy, "caps" | "reasonCodes" | "changeImpactTemplate">> & {
  caps?: Partial<DiscountPolicy["caps"]>;
  reasonCodes?: Partial<DiscountPolicy["reasonCodes"]>;
  changeImpactTemplate?: Partial<DiscountPolicy["changeImpactTemplate"]>;
};

const TENANT_POLICY_OVERRIDES: Record<string, DiscountPolicyOverride> = {};

export function setDiscountPolicyOverrideForTesting(tenantId: string, override: DiscountPolicyOverride): void {
  TENANT_POLICY_OVERRIDES[tenantId] = override;
}

export function clearDiscountPolicyOverrideForTesting(tenantId: string): void {
  delete TENANT_POLICY_OVERRIDES[tenantId];
}

export function isPolicyActive(policy: Pick<DiscountPolicy, "effectiveFrom" | "effectiveTo">, atIso: string): boolean {
  if (policy.effectiveFrom > atIso) {
    return false;
  }
  if (policy.effectiveTo && policy.effectiveTo < atIso) {
    return false;
  }
  return true;
}

export function resolveDiscountPolicy(tenantId: string, localeInput?: string): DiscountPolicy {
  const locale = normalizeLocale(localeInput);
  const override = TENANT_POLICY_OVERRIDES[tenantId] ?? {};
  const reasons = resolveReasonMessages(locale);
  const overrideReasons = override.reasonCodes ?? {};

  return {
    policyVersion: override.policyVersion ?? DEFAULT_POLICY_CORE.policyVersion,
    effectiveFrom: override.effectiveFrom ?? DEFAULT_POLICY_CORE.effectiveFrom,
    effectiveTo: override.effectiveTo ?? DEFAULT_POLICY_CORE.effectiveTo,
    order: [...(override.order ?? DEFAULT_POLICY_CORE.order)],
    caps: {
      ...DEFAULT_POLICY_CORE.caps,
      ...(override.caps ?? {}),
    },
    conflictRules: [...(override.conflictRules ?? DEFAULT_POLICY_CORE.conflictRules)],
    couponRates: {
      ...DEFAULT_POLICY_CORE.couponRates,
      ...(override.couponRates ?? {}),
    },
    reasonCodes: {
      invalidManualOverride: overrideReasons.invalidManualOverride ?? reasons.invalidManualOverride,
      cashierOverrideForbidden: overrideReasons.cashierOverrideForbidden ?? reasons.cashierOverrideForbidden,
      baseCapEnforced: overrideReasons.baseCapEnforced ?? reasons.baseCapEnforced,
      promoSuppressed: overrideReasons.promoSuppressed ?? reasons.promoSuppressed,
      promoCapEnforced: overrideReasons.promoCapEnforced ?? reasons.promoCapEnforced,
      globalCapEnforced: overrideReasons.globalCapEnforced ?? reasons.globalCapEnforced,
      policyCorrupted: overrideReasons.policyCorrupted ?? reasons.policyCorrupted,
    },
    changeImpactTemplate: {
      summary: override.changeImpactTemplate?.summary ?? DEFAULT_POLICY_CORE.changeImpactTemplate.summary,
      requiredChecks: [
        ...(override.changeImpactTemplate?.requiredChecks ?? DEFAULT_POLICY_CORE.changeImpactTemplate.requiredChecks),
      ],
    },
  };
}

export function validateDiscountPolicy(policy: DiscountPolicy): string[] {
  const errors: string[] = [];
  const requiredOrder = new Set([
    "VOLUME_STACK",
    "BASKET_STACK",
    "CATEGORY_STACK",
    "COUPON_STACK",
    "LOYALTY_SYNERGY",
    "MANUAL_OVERRIDE",
  ]);
  for (const step of requiredOrder) {
    if (!policy.order.includes(step)) {
      errors.push(`Missing policy order step: ${step}`);
    }
  }

  const caps = policy.caps;
  const capValues = [
    caps.baseAutomaticPct,
    caps.promoBucketPct,
    caps.loyaltyPct,
    caps.globalPct,
    caps.manualOverrideMaxPct,
  ];
  if (capValues.some((item) => !Number.isFinite(item) || item < 0)) {
    errors.push("Caps must be finite non-negative values.");
  }
  if (caps.manualOverrideMaxPct > caps.globalPct) {
    errors.push("manualOverrideMaxPct cannot exceed globalPct.");
  }
  if (caps.baseAutomaticPct > caps.globalPct) {
    errors.push("baseAutomaticPct cannot exceed globalPct.");
  }
  if (!/^P[0-9A-Z.-]+$/i.test(policy.policyVersion)) {
    errors.push("policyVersion format is invalid.");
  }
  if (!policy.effectiveFrom) {
    errors.push("effectiveFrom is required.");
  }
  if (policy.effectiveTo && policy.effectiveTo < policy.effectiveFrom) {
    errors.push("effectiveTo cannot be earlier than effectiveFrom.");
  }

  const reasonValues = Object.values(policy.reasonCodes).map((item) => item.code);
  const enumValues = new Set(Object.values(DISCOUNT_REASON_CODES));
  for (const code of reasonValues) {
    if (!enumValues.has(code)) {
      errors.push(`Unknown reason code: ${code}`);
    }
  }

  return errors;
}

export function discountErrorReason(
  errorCode: string,
  tenantId = "default",
  localeInput?: string,
): DiscountReasonCode | undefined {
  const policy = resolveDiscountPolicy(tenantId, localeInput);
  if (errorCode === "INVALID_DISCOUNT_OVERRIDE") {
    return policy.reasonCodes.invalidManualOverride;
  }
  if (errorCode === "FORBIDDEN_DISCOUNT_OVERRIDE") {
    return policy.reasonCodes.cashierOverrideForbidden;
  }
  if (errorCode === "DISCOUNT_POLICY_CORRUPTED") {
    return policy.reasonCodes.policyCorrupted;
  }
  return undefined;
}
