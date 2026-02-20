export class ServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface UserExplanation {
  explanationCode: string;
  explanationMessage: string;
  explanationSeverity: "INFO" | "WARN" | "CRITICAL";
}

const explanationMap: Record<string, UserExplanation> = {
  DUPLICATE_IDEMPOTENCY_KEY: {
    explanationCode: "LOCK-IDEMPOTENCY-001",
    explanationMessage: "Duplicate request rejected to prevent double posting.",
    explanationSeverity: "WARN",
  },
  OFFLINE_REPLAY_WINDOW_EXCEEDED: {
    explanationCode: "LOCK-OFFLINE-REPLAY-001",
    explanationMessage: "Queued item exceeded replay window and requires manual action.",
    explanationSeverity: "CRITICAL",
  },
  OFFLINE_RETRY_EXHAUSTED: {
    explanationCode: "LOCK-OFFLINE-RETRY-001",
    explanationMessage: "Queue retry attempts exhausted. Escalation is required.",
    explanationSeverity: "CRITICAL",
  },
  READ_ONLY_CONFLICT_FALLBACK: {
    explanationCode: "LOCK-CONFLICT-READONLY-001",
    explanationMessage: "Open conflicts force read-only mode until manager action.",
    explanationSeverity: "WARN",
  },
  READ_ONLY_RISK_POLICY: {
    explanationCode: "LOCK-RISK-READONLY-001",
    explanationMessage: "Risk policy set session to read-only mode.",
    explanationSeverity: "CRITICAL",
  },
  RISK_POLICY_BLOCKED: {
    explanationCode: "LOCK-RISK-BLOCK-001",
    explanationMessage: "Risk policy blocked this operation.",
    explanationSeverity: "CRITICAL",
  },
  FORBIDDEN_DISCOUNT_OVERRIDE: {
    explanationCode: "LOCK-DISCOUNT-001",
    explanationMessage: "Manual discount override is not permitted for your role.",
    explanationSeverity: "WARN",
  },
  DISCOUNT_POLICY_CORRUPTED: {
    explanationCode: "LOCK-DISCOUNT-POLICY-001",
    explanationMessage: "Discount policy failed validation and was blocked.",
    explanationSeverity: "CRITICAL",
  },
  REPORT_PERFORMANCE_BUDGET_EXCEEDED: {
    explanationCode: "LOCK-PERF-001",
    explanationMessage: "Report request exceeded runtime budget and was blocked.",
    explanationSeverity: "CRITICAL",
  },
};

export function resolveUserExplanation(errorCode: string): UserExplanation | undefined {
  return explanationMap[errorCode];
}

export function asServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }

  if (error instanceof Error) {
    return new ServiceError("INTERNAL_ERROR", error.message, 500);
  }

  return new ServiceError("INTERNAL_ERROR", "Unexpected error", 500);
}
