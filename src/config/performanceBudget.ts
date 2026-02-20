type RuntimeEnvironment = "development" | "staging" | "production" | "test";

function parseNumber(input: string | undefined, fallback: number): number {
  if (input === undefined) {
    return fallback;
  }
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function normalizeEnv(value: string | undefined): RuntimeEnvironment {
  const normalized = String(value ?? "development").trim().toLowerCase();
  if (normalized === "production") {
    return "production";
  }
  if (normalized === "staging") {
    return "staging";
  }
  if (normalized === "test") {
    return "test";
  }
  return "development";
}

const runtimeEnv = normalizeEnv(process.env.APP_ENV ?? process.env.NODE_ENV);

const baseBudget = {
  reporting: {
    multiStore: {
      p50Ms: 700,
      p95Ms: 1500,
      hardLimitMs: 2000,
      maxPageSize: 200,
    },
  },
  observability: {
    slis: {
      offlineRetrySuccessRatePct: {
        targetPct: 98,
        window: "1h",
        metricName: "offline_retry_success_rate_pct",
      },
      offlineEscalationRatePct: {
        targetMaxPct: 5,
        window: "1h",
        metricName: "offline_escalation_rate_pct",
      },
      auditWriteLatencyMs: {
        p95TargetMs: 50,
        window: "1h",
        metricName: "audit_write_latency_ms",
      },
    },
  },
};

const envOverlays: Record<RuntimeEnvironment, Partial<typeof baseBudget>> = {
  development: {
    reporting: {
      multiStore: {
        p50Ms: 850,
        p95Ms: 1800,
        hardLimitMs: 2300,
        maxPageSize: 200,
      },
    },
  },
  staging: {
    reporting: {
      multiStore: {
        p50Ms: 700,
        p95Ms: 1500,
        hardLimitMs: 2000,
        maxPageSize: 200,
      },
    },
  },
  production: {
    reporting: {
      multiStore: {
        p50Ms: 650,
        p95Ms: 1400,
        hardLimitMs: 1800,
        maxPageSize: 200,
      },
    },
  },
  test: {
    reporting: {
      multiStore: {
        p50Ms: 700,
        p95Ms: 1500,
        hardLimitMs: 2000,
        maxPageSize: 200,
      },
    },
  },
};

const envBudget = envOverlays[runtimeEnv].reporting?.multiStore ?? baseBudget.reporting.multiStore;

export const PERFORMANCE_BUDGET = Object.freeze({
  runtimeEnv,
  reporting: {
    multiStore: {
      p50Ms: parseNumber(process.env.PERF_REPORT_P50_MS, envBudget.p50Ms),
      p95Ms: parseNumber(process.env.PERF_REPORT_P95_MS, envBudget.p95Ms),
      hardLimitMs: parseNumber(process.env.PERF_REPORT_HARD_LIMIT_MS, envBudget.hardLimitMs),
      maxPageSize: parseNumber(process.env.PERF_REPORT_MAX_PAGE_SIZE, envBudget.maxPageSize),
    },
  },
  observability: baseBudget.observability,
} as const);
