const url = new URL(window.location.href);
const tenantId = url.searchParams.get("tenantId") || "tenant-a";
const branchId = url.searchParams.get("branchId") || "branch-a-1";
const role = url.searchParams.get("role") || "MANAGER";
const userId = url.searchParams.get("userId") || "u-mg-a";

const headers = {
  "x-user-id": userId,
  "x-role": role,
  "x-tenant-id": tenantId,
  "x-branch-id": branchId,
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = String(value);
  }
}

function showBanner(message, isError = false) {
  const el = document.getElementById("banner");
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.className = "banner hidden";
    return;
  }
  el.textContent = message;
  el.className = isError ? "banner error" : "banner";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message = body.message || body.error || `HTTP ${response.status}`;
    const error = new Error(message);
    error.code = body.error || "HTTP_ERROR";
    throw error;
  }
  return body;
}

function renderList(targetId, items, mapper) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = mapper(item);
    target.appendChild(li);
  });
}

function severityClass(severity) {
  const normalized = String(severity || "INFO").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warn") return "warn";
  return "info";
}

async function loadObservability() {
  const dashboard = await api(`/api/v1/tenants/${tenantId}/observability/dashboard`);
  const payload = dashboard.item;
  setText("cardMetrics", payload.cards.metricsLastHour);
  setText("cardQueued", payload.cards.aggregationQueued);
  setText("cardRunning", payload.cards.aggregationRunning);
  setText("cardRetrying", payload.cards.webhookRetrying);
  setText("cardCache", payload.cards.cacheEntries);

  const slaOutput = document.getElementById("slaOutput");
  if (slaOutput) {
    slaOutput.textContent = JSON.stringify(payload.sla, null, 2);
  }

  renderList(
    "alertList",
    payload.alerts || [],
    (item) =>
      `<span class="pill ${severityClass(item.severity)}">${item.severity}</span>${item.alertCode} - ${item.message}<br><small>${item.metricName}: ${item.observed} / threshold ${item.threshold}</small>`,
  );
}

async function loadJobs() {
  const result = await api(`/api/v1/tenants/${tenantId}/observability/jobs?page=1&pageSize=10`);
  renderList(
    "jobList",
    result.item.items || [],
    (item) =>
      `${item.jobType} | ${item.metricName}: ${item.metricValue} (${item.metricUnit})<br><small>${item.status} | ${new Date(item.createdAt).toLocaleString()}</small>`,
  );
}

function currentSlaHorizon() {
  const value = Number(document.getElementById("slaHorizonInput")?.value || 7);
  return Number.isFinite(value) ? Math.max(1, Math.min(30, Math.trunc(value))) : 7;
}

function currentTrendInputs() {
  const metric = document.getElementById("trendMetricInput")?.value || "net_sales";
  const historyDays = Number(document.getElementById("trendHistoryInput")?.value || 30);
  const forecastDays = Number(document.getElementById("trendForecastInput")?.value || 7);
  return {
    metric,
    historyDays: Number.isFinite(historyDays) ? Math.max(7, Math.min(180, Math.trunc(historyDays))) : 30,
    forecastDays: Number.isFinite(forecastDays) ? Math.max(1, Math.min(30, Math.trunc(forecastDays))) : 7,
  };
}

async function loadPredictiveSla() {
  const horizonDays = currentSlaHorizon();
  const result = await api(`/api/v1/tenants/${tenantId}/predictive/sla?horizonDays=${horizonDays}`);
  const out = document.getElementById("predictiveSlaOutput");
  if (out) {
    out.textContent = JSON.stringify(result.item, null, 2);
  }
}

async function loadPredictiveTrend() {
  const input = currentTrendInputs();
  const result = await api(
    `/api/v1/tenants/${tenantId}/predictive/trends?metric=${encodeURIComponent(input.metric)}&historyDays=${input.historyDays}&forecastDays=${input.forecastDays}`,
  );
  const out = document.getElementById("predictiveTrendOutput");
  if (out) {
    out.textContent = JSON.stringify(result.item.item, null, 2);
  }
}

function exportPredictiveSlaCsv() {
  const horizonDays = currentSlaHorizon();
  window.open(
    `/api/v1/tenants/${tenantId}/predictive/export?dataset=sla&format=csv&horizonDays=${horizonDays}`,
    "_blank",
  );
}

function exportPredictiveTrendCsv() {
  const input = currentTrendInputs();
  window.open(
    `/api/v1/tenants/${tenantId}/predictive/export?dataset=trend&format=csv&metric=${encodeURIComponent(input.metric)}&historyDays=${input.historyDays}&forecastDays=${input.forecastDays}`,
    "_blank",
  );
}

async function loadClients() {
  const result = await api(`/api/v1/tenants/${tenantId}/webhooks/clients`);
  renderList(
    "clientList",
    result.items || [],
    (item) =>
      `<strong>${item.name}</strong> (${item.clientId})<br><small>killSwitch=${item.killSwitch} | token=${item.tokenPreview}</small><br><button class="btn ghost" data-kill="${item.clientId}" data-next="${item.killSwitch ? "false" : "true"}">${item.killSwitch ? "Disable Kill Switch" : "Enable Kill Switch"}</button>`,
  );
  document.querySelectorAll("[data-kill]").forEach((button) => {
    button.addEventListener("click", async () => {
      const clientId = button.getAttribute("data-kill");
      const next = button.getAttribute("data-next") === "true";
      if (!clientId) return;
      await api(`/api/v1/tenants/${tenantId}/webhooks/clients/${clientId}/kill-switch`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: next }),
      });
      await loadClients();
      showBanner(`Kill switch ${next ? "enabled" : "disabled"} for ${clientId}.`);
    });
  });
}

async function loadLegalHolds() {
  const result = await api(`/api/v1/tenants/${tenantId}/compliance/legal-holds`);
  renderList(
    "legalHoldList",
    result.items || [],
    (item) =>
      `<strong>${item.scope}</strong> hold (${item.active ? "ACTIVE" : "RELEASED"})<br><small>${item.reason} | ${new Date(item.createdAt).toLocaleString()}</small>`,
  );
}

function exportComplianceCsv() {
  window.open(`/api/v1/tenants/${tenantId}/compliance/exports?format=csv&page=1&pageSize=200`, "_blank");
}

async function refreshAll() {
  await Promise.all([
    loadObservability(),
    loadJobs(),
    loadPredictiveSla(),
    loadPredictiveTrend(),
    loadClients(),
    loadLegalHolds(),
  ]);
}

function bindEvents() {
  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
    try {
      await refreshAll();
      showBanner("Operational intelligence refreshed.");
    } catch (error) {
      showBanner(error.message || "Refresh failed.", true);
    }
  });

  document.getElementById("slaForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await loadPredictiveSla();
      showBanner("SLA forecast updated.");
    } catch (error) {
      showBanner(error.message || "SLA prediction failed.", true);
    }
  });

  document.getElementById("trendForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await loadPredictiveTrend();
      showBanner("Trend forecast updated.");
    } catch (error) {
      showBanner(error.message || "Trend prediction failed.", true);
    }
  });

  document.getElementById("slaExportBtn")?.addEventListener("click", exportPredictiveSlaCsv);
  document.getElementById("trendExportBtn")?.addEventListener("click", exportPredictiveTrendCsv);
  document.getElementById("complianceExportBtn")?.addEventListener("click", exportComplianceCsv);

  document.getElementById("clientForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const name = document.getElementById("clientNameInput")?.value || "";
      const description = document.getElementById("clientDescInput")?.value || "";
      const created = await api(`/api/v1/tenants/${tenantId}/webhooks/clients`, {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      await loadClients();
      showBanner(`Client created. Token (store safely): ${created.token}`);
    } catch (error) {
      showBanner(error.message || "Client creation failed.", true);
    }
  });

  document.getElementById("legalHoldForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const scope = document.getElementById("legalScopeInput")?.value || "TENANT";
      const reason = document.getElementById("legalReasonInput")?.value || "";
      await api(`/api/v1/tenants/${tenantId}/compliance/legal-holds`, {
        method: "POST",
        body: JSON.stringify({ scope, reason }),
      });
      await loadLegalHolds();
      showBanner("Legal hold created.");
    } catch (error) {
      showBanner(error.message || "Legal hold creation failed.", true);
    }
  });
}

async function init() {
  bindEvents();
  try {
    await refreshAll();
  } catch (error) {
    showBanner(
      `${error.message || "Initialization failed."} Ensure Phase 7 feature flags are enabled for this tenant.`,
      true,
    );
  }
}

void init();
