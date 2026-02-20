const search = new URLSearchParams(window.location.search);
const role = String(search.get("role") || "MANAGER").trim().toUpperCase();
const tenantId = String(search.get("tenantId") || "tenant-a").trim();
const branchId = String(search.get("branchId") || "branch-a-1").trim();
const userIdFromQuery = String(search.get("userId") || "").trim();
const defaultUserByRole = {
  APPLICATION_OWNER: "u-ao",
  TENANT_OWNER: "u-to-a",
  MANAGER: "u-mg-a",
  CASHIER: "u-ca-a",
  INVENTORY_STAFF: "u-is-a",
};
const userId = userIdFromQuery || defaultUserByRole[role] || "u-mg-a";
const headers = {
  "x-user-id": userId,
  "x-role": role,
  "x-tenant-id": tenantId,
  "x-branch-id": branchId,
};
const riskMode = (search.get("riskMode") || "").trim().toUpperCase();
const riskFactors = (search.get("riskFactors") || "").trim();
if (["WARN", "READ_ONLY", "BLOCK"].includes(riskMode)) {
  headers["x-risk-mode"] = riskMode;
}
if (riskFactors.length > 0) {
  headers["x-risk-factors"] = riskFactors;
}

const cashierMinimalMode = role === "CASHIER";

const explanationCatalog = {
  DUPLICATE_IDEMPOTENCY_KEY: {
    code: "LOCK-IDEMPOTENCY-001",
    severity: "warn",
    message: "Duplicate request was blocked to prevent double-post.",
    cashierMessage: "Duplicate request blocked.",
  },
  READ_ONLY_RISK_POLICY: {
    code: "LOCK-RISK-READONLY-001",
    severity: "critical",
    message: "Risk policy set this session to read-only mode.",
    cashierMessage: "Read-only mode is active.",
  },
  RISK_POLICY_BLOCKED: {
    code: "LOCK-RISK-BLOCK-001",
    severity: "critical",
    message: "Risk policy blocked this session from restricted actions.",
    cashierMessage: "Session blocked by policy.",
  },
  READ_ONLY_CONFLICT_FALLBACK: {
    code: "LOCK-CONFLICT-READONLY-001",
    severity: "warn",
    message: "Open conflicts require manager resolution before mutations.",
    cashierMessage: "Action blocked until conflict is resolved.",
  },
  FORBIDDEN_DISCOUNT_OVERRIDE: {
    code: "LOCK-DISCOUNT-001",
    severity: "warn",
    message: "Manual discount override is forbidden for cashier role.",
    cashierMessage: "Manual discount not allowed.",
  },
  OFFLINE_REPLAY_WINDOW_EXCEEDED: {
    code: "LOCK-OFFLINE-REPLAY-001",
    severity: "critical",
    message: "Queued item exceeded replay window and needs manager action.",
    cashierMessage: "Offline item expired and needs manager action.",
  },
  OFFLINE_RETRY_EXHAUSTED: {
    code: "LOCK-OFFLINE-RETRY-001",
    severity: "critical",
    message: "Queue retries are exhausted. Escalate for manual resolution.",
    cashierMessage: "Retry limit reached. Escalate.",
  },
  DISCOUNT_POLICY_CORRUPTED: {
    code: "LOCK-DISCOUNT-POLICY-001",
    severity: "critical",
    message: "Discount policy failed safety checks. Discount actions are disabled.",
    cashierMessage: "Discount policy unavailable.",
  },
  REPORT_PERFORMANCE_BUDGET_EXCEEDED: {
    code: "LOCK-PERF-001",
    severity: "critical",
    message: "Report runtime exceeded policy budget.",
    cashierMessage: "Report temporarily unavailable.",
  },
};

const state = {
  conflicts: [],
  queue: [],
  offlineStatus: {
    pending: 0,
    failed: 0,
    conflict: 0,
    confirmed: 0,
    oldestPendingMinutes: 0,
    prolongedOffline: false,
  },
  risk: {
    mode: "ALLOW",
    factors: [],
    message: "No elevated risk signals detected.",
  },
  discountPolicy: {
    loaded: false,
    active: false,
    policyVersion: "",
  },
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(options.headers ?? {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP ${response.status}`);
    error.code = body.error || "HTTP_ERROR";
    error.mode = body.mode || "ALLOW";
    error.status = response.status;
    error.explanationCode = body.explanationCode;
    error.explanationMessage = body.explanationMessage;
    error.explanationSeverity = body.explanationSeverity;
    throw error;
  }

  return body;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = String(text);
  }
}

function setAlert(level, text) {
  const banner = document.getElementById("alertBanner");
  if (!banner) {
    return;
  }

  if (!text) {
    banner.textContent = "";
    banner.className = "alert hidden";
    return;
  }

  banner.textContent = text;
  const normalized = level === "error" ? "critical" : level;
  banner.className = `alert ${normalized}`;
}

function setExplanationPanel(info) {
  const panel = document.getElementById("explanationPanel");
  const codeEl = document.getElementById("explanationCode");
  const messageEl = document.getElementById("explanationMessage");
  if (!panel || !codeEl || !messageEl) {
    return;
  }

  if (!info) {
    panel.className = "explanation hidden";
    codeEl.textContent = "";
    messageEl.textContent = "";
    return;
  }

  panel.className = `explanation ${info.severity || "info"}`;
  codeEl.textContent = info.code;
  messageEl.textContent = cashierMinimalMode && info.cashierMessage ? info.cashierMessage : info.message;
}

function mapErrorInfo(error) {
  const sourceCode = error.code || error.error || "HTTP_ERROR";
  const catalog = explanationCatalog[sourceCode] || null;
  const code = error.explanationCode || catalog?.code || "LOCK-GENERIC-001";
  const severityRaw = String(error.explanationSeverity || catalog?.severity || "warn").toLowerCase();
  const severity = severityRaw === "critical" ? "critical" : severityRaw === "info" ? "info" : "warn";
  const message =
    error.explanationMessage ||
    catalog?.message ||
    error.message ||
    error.error ||
    "Request failed.";
  return {
    sourceCode,
    code,
    severity,
    message,
    cashierMessage: catalog?.cashierMessage,
  };
}

function mapErrorMessage(error) {
  return mapErrorInfo(error).message;
}

function applyPolicyFallback(errorInfo) {
  const previewBtn = document.getElementById("discountPreviewBtn");
  const applyBtn = document.getElementById("discountApplyBtn");
  if (previewBtn) {
    previewBtn.disabled = true;
  }
  if (applyBtn) {
    applyBtn.disabled = true;
  }
  setExplanationPanel({
    code: errorInfo?.code || "LOCK-DISCOUNT-POLICY-001",
    severity: "critical",
    message:
      errorInfo?.message ||
      "Discount policy preview is unavailable. Discount actions are disabled for safety.",
    cashierMessage: "Discount unavailable.",
  });
}

function showError(error) {
  const info = mapErrorInfo(error);
  setAlert(info.severity, info.message);
  setExplanationPanel(info);
}

function applyMutationLockdown() {
  const riskLock = state.risk.mode === "READ_ONLY" || state.risk.mode === "BLOCK";
  const syncBtn = document.getElementById("syncBtn");
  const resolveBtn = document.getElementById("resolveFirstBtn");
  const loyaltyRedeemBtn = document.getElementById("loyaltyRedeemBtn");
  const runExtReportBtn = document.getElementById("runExtReportBtn");

  if (syncBtn) {
    syncBtn.disabled = riskLock;
  }

  if (resolveBtn) {
    resolveBtn.disabled = riskLock;
  }
  if (loyaltyRedeemBtn) {
    loyaltyRedeemBtn.disabled = riskLock;
  }
  if (runExtReportBtn) {
    runExtReportBtn.disabled = riskLock;
  }
}

function renderQueue() {
  const tbody = document.getElementById("queueTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const item of state.queue) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.queueId}</td>
      <td>${item.eventType}</td>
      <td>${item.state}</td>
      <td>${new Date(item.updatedAt).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderConflicts() {
  const tbody = document.getElementById("conflictTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const item of state.conflicts) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.conflictId}</td>
      <td>${item.conflictType}</td>
      <td>${item.resolutionStatus}</td>
      <td>${new Date(item.createdAt).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderRisk() {
  setText("riskModeState", state.risk.mode);
  setText("riskFactors", state.risk.factors.length > 0 ? state.risk.factors.join(", ") : "No elevated signals");
}

function renderStates() {
  setText("queueCount", state.queue.length);
  const openConflicts = state.conflicts.filter((item) => item.resolutionStatus === "OPEN").length;
  setText("conflictCount", openConflicts);

  const readOnlyFromConflict = openConflicts > 0;
  const readOnlyFromRisk = state.risk.mode === "READ_ONLY";
  const blockedFromRisk = state.risk.mode === "BLOCK";

  const readOnly = readOnlyFromConflict || readOnlyFromRisk || blockedFromRisk;
  setText("readonlyState", readOnly ? "ON" : "OFF");
  setText("offlinePendingState", state.offlineStatus.pending);
  setText(
    "offlineStatusHint",
    `Failed: ${state.offlineStatus.failed} | Conflict: ${state.offlineStatus.conflict} | Confirmed: ${state.offlineStatus.confirmed} | Oldest Pending: ${state.offlineStatus.oldestPendingMinutes}m`,
  );

  if (state.offlineStatus.prolongedOffline) {
    setAlert(
      "warn",
      "Prolonged offline detected. Retry/backoff policy active and manager action may be required.",
    );
    setExplanationPanel({
      code: "LOCK-OFFLINE-SLA-001",
      severity: "warn",
      message: "Offline queue has exceeded SLA age and requires attention.",
      cashierMessage: "Offline queue needs manager attention.",
    });
  }

  if (blockedFromRisk) {
    setText("modeState", "BLOCKED");
  } else if (readOnlyFromRisk) {
    setText("modeState", "READ_ONLY_RISK");
  } else if (readOnlyFromConflict) {
    setText("modeState", "READ_ONLY_CONFLICT");
  } else if (state.risk.mode === "WARN") {
    setText("modeState", "WARN");
  } else {
    setText("modeState", "ACTIVE");
  }

  applyMutationLockdown();
}

async function loadBrand() {
  const appBrand = await api("/api/v1/config/brand/app");
  const tenantBrand = await api(`/api/v1/config/brand/tenant/${tenantId}`);

  setText("appName", appBrand.brand.appName);
  setText("tenantName", tenantBrand.brand.tenantName);
  setText("tenantLogo", tenantBrand.brand.logoText);
}

async function loadRiskSession() {
  const risk = await api("/api/v1/risk/sessions");
  state.risk = {
    mode: risk.session.mode,
    factors: risk.session.factors,
    message: risk.session.message,
  };
  renderRisk();
}

async function refresh() {
  const [queue, conflicts, offlineStatus] = await Promise.all([
    api(`/api/v1/tenants/${tenantId}/sync/queue`),
    api(`/api/v1/tenants/${tenantId}/conflicts`),
    api(`/api/v1/tenants/${tenantId}/offline/status`),
  ]);

  state.queue = queue.items;
  state.conflicts = conflicts.items;
  state.offlineStatus = offlineStatus.item;

  renderQueue();
  renderConflicts();
  renderStates();
}

async function syncQueue() {
  try {
    await api(`/api/v1/tenants/${tenantId}/sync/retry`, { method: "POST", body: JSON.stringify({}) });
    setAlert("info", "Queue sync completed.");
    setExplanationPanel(null);
  } catch (error) {
    showError(error);
  }
  await refresh().catch((error) => {
    showError(error);
  });
}

async function resolveFirstConflict() {
  const open = state.conflicts.find((item) => item.resolutionStatus === "OPEN");
  if (!open) return;

  try {
    await api(`/api/v1/tenants/${tenantId}/conflicts/${open.conflictId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ note: "Resolved from dashboard" }),
    });
    setAlert("info", "Conflict resolved.");
    setExplanationPanel(null);
  } catch (error) {
    showError(error);
  }

  await refresh().catch((error) => {
    showError(error);
  });
}

async function refreshLoyaltyBalance() {
  const customerId = document.getElementById("loyaltyCustomerId")?.value || "cust-a-1";
  const result = await api(`/api/v1/tenants/${tenantId}/rewards/balance/${customerId}`);
  setText("loyaltyPointsState", result.item.currentPoints);
}

async function redeemLoyaltyPopup() {
  const customerId = document.getElementById("loyaltyCustomerId")?.value || "cust-a-1";
  const pointsRaw = window.prompt("Redeem points", "100");
  if (!pointsRaw) {
    return;
  }
  const reason = window.prompt("Redeem reason", "POS redemption") || "POS redemption";
  const points = Number(pointsRaw);
  if (!Number.isInteger(points) || points <= 0) {
    setAlert("warn", "Points must be a positive integer.");
    setExplanationPanel({
      code: "LOCK-LOYALTY-INPUT-001",
      severity: "warn",
      message: "Points value must be a positive integer.",
      cashierMessage: "Enter whole points.",
    });
    return;
  }

  try {
    await api(`/api/v1/tenants/${tenantId}/rewards/redeem`, {
      method: "POST",
      body: JSON.stringify({
        customerId,
        points,
        reason,
      }),
    });
    setAlert("info", "Loyalty redemption applied.");
    setExplanationPanel(null);
    await refreshLoyaltyBalance();
  } catch (error) {
    showError(error);
  }
}

function selectedExtensionTemplate() {
  return document.getElementById("extTemplateSelect")?.value || "REP-X-LOY-001";
}

async function runExtensionReport() {
  const templateId = selectedExtensionTemplate();
  const report = await api(`/api/v1/tenants/${tenantId}/reports/extensions/${templateId}`);
  const output = document.getElementById("extReportOutput");
  if (output) {
    output.textContent = JSON.stringify(report, null, 2);
  }
}

function exportExtension(format) {
  const templateId = selectedExtensionTemplate();
  window.open(`/api/v1/tenants/${tenantId}/reports/extensions/${templateId}/export?format=${format}`, "_blank");
}

function phase5DiscountPayload() {
  const productId = document.getElementById("discountProductId")?.value || "prod-a-001";
  const qty = Number(document.getElementById("discountQty")?.value || 1);
  const customerId = document.getElementById("discountCustomerId")?.value || "";
  const couponCode = document.getElementById("discountCouponCode")?.value || "";
  const manualOverridePct = Number(document.getElementById("discountManualPct")?.value || 0);

  return {
    mode: "RETAIL",
    customerId: customerId || undefined,
    lines: [{ productId, quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1 }],
    applyLoyaltySynergy: true,
    couponCode: couponCode || undefined,
    manualOverridePct: Number.isFinite(manualOverridePct) ? manualOverridePct : 0,
  };
}

async function loadDiscountPolicyPreview() {
  try {
    const preview = await api(`/api/v1/tenants/${tenantId}/discounts/advanced/policy/preview`);
    const item = preview.item || {};
    state.discountPolicy = {
      loaded: true,
      active: Boolean(item.active),
      policyVersion: String(item.policyVersion || ""),
    };
    setText(
      "discountPolicyState",
      state.discountPolicy.policyVersion
        ? `${state.discountPolicy.policyVersion} (${state.discountPolicy.active ? "ACTIVE" : "INACTIVE"})`
        : "UNKNOWN",
    );
    if (!state.discountPolicy.active) {
      applyPolicyFallback({
        code: "LOCK-DISCOUNT-POLICY-001",
        message: "Discount policy is currently inactive. Discount actions are disabled.",
      });
    }
  } catch (error) {
    const info = mapErrorInfo(error);
    applyPolicyFallback(info);
  }
}

function setJsonOutput(id, value) {
  const output = document.getElementById(id);
  if (!output) {
    return;
  }
  output.textContent = JSON.stringify(value, null, 2);
}

function renderDiscountBreakdown(result) {
  const summary = document.getElementById("phase5DiscountSummary");
  const rulesTable = document.getElementById("phase5DiscountRulesTable");
  const reasonsList = document.getElementById("phase5DiscountReasons");

  if (summary) {
    summary.textContent = `Subtotal: ${result.subtotal} | Discount: ${result.discountTotal} | Final: ${result.finalTotal} | Stacked: ${result.stackedDiscountPct}%`;
  }

  if (rulesTable) {
    rulesTable.innerHTML = "";
    for (const rule of result.rules ?? []) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${rule.ruleKey}</td><td>${rule.pct}</td><td>${rule.reason}</td>`;
      rulesTable.appendChild(row);
    }
  }

  if (reasonsList) {
    reasonsList.innerHTML = "";
    const reasons = result.rejectionReasons ?? [];
    if (reasons.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No rejection or suppression reasons.";
      reasonsList.appendChild(li);
    } else {
      for (const reason of reasons) {
        const li = document.createElement("li");
        li.textContent = `${reason.code}: ${reason.message}`;
        reasonsList.appendChild(li);
      }
    }
  }
}

async function evaluatePhase5Discount(apply) {
  if (!state.discountPolicy.loaded) {
    await loadDiscountPolicyPreview();
  }
  if (!state.discountPolicy.loaded || !state.discountPolicy.active) {
    const err = new Error("Discount policy preview is not active.");
    err.code = "DISCOUNT_POLICY_CORRUPTED";
    throw err;
  }
  const endpoint = apply ? "apply" : "evaluate";
  const payload = await api(`/api/v1/tenants/${tenantId}/discounts/advanced/${endpoint}`, {
    method: "POST",
    body: JSON.stringify(phase5DiscountPayload()),
  });
  setJsonOutput("phase5DiscountOutput", payload);
  renderDiscountBreakdown(payload.item ?? payload);
}

async function evaluateRiskCompliance() {
  const action = document.getElementById("riskActionInput")?.value || "READ";
  const vpnDetected = Boolean(document.getElementById("riskVpnInput")?.checked);
  const restrictedLocation = Boolean(document.getElementById("riskRestrictedInput")?.checked);
  const untrustedDevice = Boolean(document.getElementById("riskDeviceInput")?.checked);

  const response = await fetch(`/api/v1/tenants/${tenantId}/risk-compliance/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      endpoint: `/api/v1/tenants/${tenantId}/sales/checkout`,
      action,
      vpnDetected,
      restrictedLocation,
      untrustedDevice,
    }),
  });

  const payload = await response.json().catch(() => ({ error: "UNKNOWN" }));
  setJsonOutput("phase5RiskOutput", payload);

  if (!response.ok) {
    showError(payload);
    return;
  }

  if (payload.mode === "WARN") {
    setAlert("warn", payload.message);
    setExplanationPanel({
      code: "LOCK-RISK-WARN-001",
      severity: "warn",
      message: payload.message,
      cashierMessage: "Risk warning active.",
    });
  } else if (payload.mode === "READ_ONLY" || payload.mode === "BLOCK") {
    setAlert("critical", payload.message);
    setExplanationPanel({
      code: payload.mode === "BLOCK" ? "LOCK-RISK-BLOCK-001" : "LOCK-RISK-READONLY-001",
      severity: "critical",
      message: payload.message,
      cashierMessage: payload.mode === "BLOCK" ? "Session blocked." : "Read-only mode active.",
    });
  } else {
    setAlert("info", payload.message);
    setExplanationPanel(null);
  }
}

async function init() {
  try {
    await loadBrand();
    await loadRiskSession();
    await refreshLoyaltyBalance();
    await loadDiscountPolicyPreview();

    if (state.risk.mode === "WARN") {
      setAlert("warn", state.risk.message);
      setExplanationPanel({
        code: "LOCK-RISK-WARN-001",
        severity: "warn",
        message: state.risk.message,
        cashierMessage: "Risk warning active.",
      });
    } else if (state.risk.mode === "READ_ONLY" || state.risk.mode === "BLOCK") {
      setAlert("critical", state.risk.message);
      setExplanationPanel({
        code: state.risk.mode === "BLOCK" ? "LOCK-RISK-BLOCK-001" : "LOCK-RISK-READONLY-001",
        severity: "critical",
        message: state.risk.message,
        cashierMessage: state.risk.mode === "BLOCK" ? "Session blocked." : "Read-only mode active.",
      });
    } else {
      setAlert("info", "Session active.");
      if (state.discountPolicy.active) {
        setExplanationPanel(null);
      }
    }

    if (state.risk.mode !== "BLOCK") {
      await refresh();
    } else {
      renderStates();
    }

    setText("connectionState", "ONLINE");
  } catch (error) {
    console.error(error);
    showError(error);
    setText("connectionState", "OFFLINE");
  }

  document.getElementById("syncBtn")?.addEventListener("click", () => {
    void syncQueue();
  });

  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
    try {
      await loadRiskSession();
      if (state.risk.mode !== "BLOCK") {
        await refresh();
      } else {
        renderStates();
      }
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("resolveFirstBtn")?.addEventListener("click", () => {
    void resolveFirstConflict();
  });

  document.getElementById("loyaltyRefreshBtn")?.addEventListener("click", async () => {
    try {
      await refreshLoyaltyBalance();
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("loyaltyRedeemBtn")?.addEventListener("click", () => {
    void redeemLoyaltyPopup();
  });

  document.getElementById("runExtReportBtn")?.addEventListener("click", async () => {
    try {
      await runExtensionReport();
      setAlert("info", "Reporting extension generated.");
      setExplanationPanel(null);
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("extCsvBtn")?.addEventListener("click", () => {
    exportExtension("csv");
  });
  document.getElementById("extPdfBtn")?.addEventListener("click", () => {
    exportExtension("pdf");
  });
  document.getElementById("extPrintBtn")?.addEventListener("click", () => {
    exportExtension("print");
  });

  document.getElementById("discountPreviewBtn")?.addEventListener("click", async () => {
    try {
      await evaluatePhase5Discount(false);
      setAlert("info", "Advanced discount preview generated.");
      setExplanationPanel(null);
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("discountApplyBtn")?.addEventListener("click", async () => {
    try {
      await evaluatePhase5Discount(true);
      setAlert("info", "Advanced discount applied.");
      setExplanationPanel(null);
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("riskEvaluateBtn")?.addEventListener("click", () => {
    void evaluateRiskCompliance();
  });
}

void init();
