const url = new URL(window.location.href);
const tenantId = url.searchParams.get("tenantId") || "tenant-a";
const branchId = url.searchParams.get("branchId") || "branch-a-1";
const role = url.searchParams.get("role") || "MANAGER";
const userId = url.searchParams.get("userId") || "u-mg-a";
const adminAuditRoles = new Set(["APPLICATION_OWNER", "TENANT_OWNER", "MANAGER"]);

const headers = {
  "x-user-id": userId,
  "x-role": role,
  "x-tenant-id": tenantId,
  "x-branch-id": branchId,
};

function canAccessAuditUi() {
  return adminAuditRoles.has(role);
}

let currentReportId = "REP-A-001";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = String(value);
  }
}

function showBanner(message, error = false) {
  const banner = document.getElementById("banner");
  if (!banner) return;
  if (!message) {
    banner.textContent = "";
    banner.className = "banner hidden";
    return;
  }
  banner.textContent = message;
  banner.className = error ? "banner error" : "banner";
}

function configureAuditSection() {
  const section = document.getElementById("audit");
  const navAudit = document.getElementById("navAudit");
  const hint = document.getElementById("auditAccessHint");
  if (!section || !navAudit) {
    return;
  }

  if (canAccessAuditUi()) {
    section.classList.remove("hidden");
    navAudit.classList.remove("hidden");
    if (hint) {
      hint.textContent = "Admin roles only: APPLICATION_OWNER, TENANT_OWNER, MANAGER";
    }
    return;
  }

  section.classList.add("hidden");
  navAudit.classList.add("hidden");
}

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

function renderBars(targetId, items) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = "";
  const max = Math.max(1, ...items.map((item) => Number(item.value || 0)));
  items.forEach((item) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.dataset.label = String(item.label);
    const height = Math.max(8, Math.round((Number(item.value || 0) / max) * 96));
    bar.style.height = `${height}px`;
    target.appendChild(bar);
  });
}

function buildReportQuery() {
  const reportId = document.getElementById("reportIdInput")?.value || "REP-A-001";
  const dateFrom = document.getElementById("reportFromInput")?.value || "";
  const dateTo = document.getElementById("reportToInput")?.value || "";
  const compareTenantId = document.getElementById("compareTenantInput")?.value || "";
  currentReportId = reportId;

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (compareTenantId) params.set("compareTenantId", compareTenantId);
  return { reportId, query: params.toString() ? `?${params.toString()}` : "" };
}

async function loadBrandAndContext() {
  const appBrand = await api("/api/v1/config/brand/app");
  const tenantBrand = await api(`/api/v1/config/brand/tenant/${tenantId}`);
  const riskSession = await api("/api/v1/risk/sessions");

  setText("appName", appBrand.brand.appName);
  setText("tenantName", tenantBrand.brand.tenantName);
  setText("tenantLogo", tenantBrand.brand.logoText);
  setText("ctxRole", role);
  setText("ctxBranch", branchId);
  setText("riskMode", riskSession.session.mode);
}

async function loadOverview() {
  const kpis = await api(`/api/v1/tenants/${tenantId}/dashboard/kpis`);
  setText("kpiSales", kpis.item.salesToday);
  setText("kpiReceipts", kpis.item.receiptsToday);
  setText("kpiAvg", kpis.item.avgReceipt);
  setText("kpiLowStock", kpis.item.lowStockCount);
  setText("kpiCustomers", kpis.item.customerCount);
  setText("kpiConflicts", kpis.item.openConflictCount);

  const [sales, inventory, customers] = await Promise.all([
    api(`/api/v1/tenants/${tenantId}/dashboard/charts/sales`),
    api(`/api/v1/tenants/${tenantId}/dashboard/charts/inventory`),
    api(`/api/v1/tenants/${tenantId}/dashboard/charts/customers`),
  ]);
  renderBars("chartSales", sales.items);
  renderBars("chartInventory", inventory.items);
  renderBars("chartCustomers", customers.items);
}

async function loadManagement() {
  const [branches, users] = await Promise.all([
    api(`/api/v1/tenants/${tenantId}/branches`),
    api(`/api/v1/tenants/${tenantId}/users`),
  ]);

  renderList(
    "branchList",
    branches.items,
    (branch) => `<strong>${branch.branchCode}</strong> - ${branch.branchName} (${branch.isActive ? "ACTIVE" : "INACTIVE"})`,
  );
  renderList(
    "userList",
    users.items,
    (user) => `${user.email} | ${user.role} | ${user.branchId} | ${user.isActive ? "ACTIVE" : "INACTIVE"}`,
  );
}

async function loadTemplates() {
  const templates = await api("/api/v1/reports/advanced/templates");
  renderList(
    "templateList",
    templates.items,
    (template) => `${template.reportId} - ${template.title} <br><small>${template.filters.join(", ")}</small>`,
  );
}

async function runAdvancedReport() {
  const { reportId, query } = buildReportQuery();
  const report = await api(`/api/v1/reports/advanced/${reportId}${query}`);
  const out = document.getElementById("reportOutput");
  if (out) {
    out.textContent = JSON.stringify(report, null, 2);
  }
}

async function loadRewardPanel() {
  const [kpis, history] = await Promise.all([
    api(`/api/v1/tenants/${tenantId}/rewards/kpis`),
    api(`/api/v1/tenants/${tenantId}/rewards/history`),
  ]);
  setText("rewardMembers", kpis.item.members);
  setText("rewardActive", kpis.item.activeMembers);
  setText("rewardAccrued", kpis.item.totalPointsAccrued);
  setText("rewardRedeemed", kpis.item.totalPointsRedeemed);

  renderList(
    "rewardHistoryList",
    history.items.slice(0, 8),
    (item) =>
      `${item.operation} | ${item.customerId} | ${item.pointsDelta} points | ${new Date(item.createdAt).toLocaleString()}`,
  );
}

async function loadExtensionTemplates() {
  const templates = await api(`/api/v1/tenants/${tenantId}/reports/extensions/templates`);
  renderList(
    "extTemplateList",
    templates.items,
    (template) =>
      `${template.templateId} - ${template.title}<br><small>${template.category} | export: ${template.exportFormats.join(", ")}</small>`,
  );
}

function extensionTemplateId() {
  return document.getElementById("extTemplateInput")?.value || "REP-X-LOY-001";
}

async function runExtensionReport() {
  const templateId = extensionTemplateId();
  const report = await api(`/api/v1/tenants/${tenantId}/reports/extensions/${templateId}`);
  const out = document.getElementById("extReportOutput");
  if (out) {
    out.textContent = JSON.stringify(report, null, 2);
  }
}

function exportExtensionReport(format) {
  const templateId = extensionTemplateId();
  window.open(`/api/v1/tenants/${tenantId}/reports/extensions/${templateId}/export?format=${format}`, "_blank");
}

function phase5ReportKey() {
  return document.getElementById("phase5ReportKey")?.value || "summary";
}

async function runPhase5MultiStoreReport() {
  const key = phase5ReportKey();
  const report = await api(`/api/v1/tenants/${tenantId}/reports/multi-store/${key}`);
  const out = document.getElementById("phase5ReportOutput");
  if (out) {
    out.textContent = JSON.stringify(report, null, 2);
  }
}

function exportPhase5MultiStore(format) {
  const key = phase5ReportKey();
  window.open(`/api/v1/tenants/${tenantId}/reports/multi-store/${key}/export?format=${format}`, "_blank");
}

async function loadPhase5ComplianceEvents() {
  const result = await api(`/api/v1/tenants/${tenantId}/risk-compliance/events`);
  renderList(
    "phase5RiskEvents",
    result.items.slice(0, 8),
    (item) => `${item.mode} | ${item.decision} | ${item.action} | ${item.endpoint} | ${new Date(item.createdAt).toLocaleString()}`,
  );
}

async function loadOfflineEnhanced() {
  const [status, events] = await Promise.all([
    api(`/api/v1/tenants/${tenantId}/offline/status`),
    api(`/api/v1/tenants/${tenantId}/offline/events`),
  ]);
  const s = status.item;
  setText("offlineEnhancedSummary", `Pending: ${s.pending} | Failed: ${s.failed} | Conflict: ${s.conflict} | Confirmed: ${s.confirmed}`);
  renderList(
    "offlineEventList",
    events.items.slice(0, 8),
    (item) => `${item.status} [${item.eventType}] ${item.message} (${new Date(item.createdAt).toLocaleString()})`,
  );
}

async function loadPlugins() {
  const [catalog] = await Promise.all([api("/api/v1/plugins")]);
  renderList(
    "pluginCatalog",
    catalog.items,
    (plugin) => `${plugin.pluginId} (${plugin.pluginType}) v${plugin.version}<br><small>${plugin.description}</small>`,
  );
}

async function loadAlerts() {
  const alerts = await api(`/api/v1/tenants/${tenantId}/offline/alerts`);
  renderList(
    "alertList",
    alerts.items,
    (alert) =>
      `<strong>${alert.severity}</strong> [${alert.category}] ${alert.message} ${
        alert.acknowledged ? "" : `<button data-ack="${alert.alertId}" class="btn ghost">Ack</button>`
      }`,
  );

  document.querySelectorAll("[data-ack]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const alertId = btn.getAttribute("data-ack");
      if (!alertId) return;
      await api(`/api/v1/tenants/${tenantId}/offline/alerts/${alertId}/ack`, {
        method: "PATCH",
        body: JSON.stringify({ note: "acknowledged from dashboard" }),
      });
      await loadAlerts();
    });
  });
}

async function loadAuditView() {
  if (!canAccessAuditUi()) {
    return;
  }
  const severity = document.getElementById("auditSeverityFilter")?.value || "";
  const [result, integrity] = await Promise.all([api("/api/v1/audit/logs"), api("/api/v1/audit/integrity")]);
  const items = (result.items || [])
    .filter((item) => (severity ? item.severity === severity : true))
    .slice(0, 25);

  const integrityEl = document.getElementById("auditIntegrity");
  if (integrityEl) {
    integrityEl.textContent = JSON.stringify(integrity.item || {}, null, 2);
  }

  renderList(
    "auditList",
    items,
    (item) =>
      `<span class="severity-pill ${String(item.severity || "INFO").toLowerCase()}">${item.severity}</span> ${item.decision} | ${item.actionType} | ${item.endpoint}<br><small>${item.reason} | ${new Date(item.createdAt).toLocaleString()}</small>`,
  );
}

async function bindForms() {
  document.getElementById("branchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const branchCode = document.getElementById("branchCodeInput")?.value || "";
    const branchName = document.getElementById("branchNameInput")?.value || "";
    await api(`/api/v1/tenants/${tenantId}/branches`, {
      method: "POST",
      body: JSON.stringify({ branchCode, branchName }),
    });
    await loadManagement();
    showBanner("Branch created.");
  });

  document.getElementById("userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("userEmailInput")?.value || "";
    const roleInput = document.getElementById("userRoleInput")?.value || "CASHIER";
    const userBranch = document.getElementById("userBranchInput")?.value || branchId;
    await api(`/api/v1/tenants/${tenantId}/users`, {
      method: "POST",
      body: JSON.stringify({ email, role: roleInput, branchId: userBranch }),
    });
    await loadManagement();
    showBanner("User created.");
  });

  document.getElementById("brandForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const tenantName = document.getElementById("brandTenantNameInput")?.value || undefined;
    const logoText = document.getElementById("brandLogoInput")?.value || undefined;
    const primary = document.getElementById("brandPrimaryInput")?.value || undefined;
    const accent = document.getElementById("brandAccentInput")?.value || undefined;
    await api(`/api/v1/config/brand/tenant/${tenantId}`, {
      method: "PATCH",
      body: JSON.stringify({ tenantName, logoText, primary, accent }),
    });
    await loadBrandAndContext();
    showBanner("Branding updated.");
  });

  document.getElementById("reportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runAdvancedReport();
    showBanner("Advanced report generated.");
  });

  document.getElementById("rewardActionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = document.getElementById("rewardActionInput")?.value || "ACCRUE";
    const customerId = document.getElementById("rewardCustomerInput")?.value || "cust-a-1";
    const points = Number(document.getElementById("rewardPointsInput")?.value || 0);
    if (!Number.isInteger(points) || points <= 0) {
      throw new Error("Points must be a positive integer.");
    }

    const endpoint = action === "REDEEM" ? "redeem" : "accrue";
    const payload =
      action === "REDEEM"
        ? { customerId, points, reason: "dashboard reward action" }
        : { customerId, points, reason: "dashboard reward action" };
    await api(`/api/v1/tenants/${tenantId}/rewards/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadRewardPanel();
    showBanner(`Reward action ${action} applied.`);
  });

  document.getElementById("exportCsvBtn")?.addEventListener("click", async () => {
    const { reportId, query } = buildReportQuery();
    window.open(`/api/v1/reports/advanced/${reportId}/export?format=csv${query ? `&${query.slice(1)}` : ""}`, "_blank");
  });

  document.getElementById("exportPdfBtn")?.addEventListener("click", async () => {
    const { reportId, query } = buildReportQuery();
    window.open(`/api/v1/reports/advanced/${reportId}/export?format=pdf${query ? `&${query.slice(1)}` : ""}`, "_blank");
  });

  document.getElementById("registerPluginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pluginId = document.getElementById("registerPluginId")?.value || "mock-gateway-v1";
    await api(`/api/v1/tenants/${tenantId}/plugins/register`, {
      method: "POST",
      body: JSON.stringify({ pluginId, pluginType: "PAYMENT", enabled: true }),
    });
    showBanner("Plugin registered for tenant.");
  });

  document.getElementById("chargeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pluginId = document.getElementById("chargePluginId")?.value || "mock-gateway-v1";
    const amount = Number(document.getElementById("chargeAmount")?.value || 0);
    const orderRef = document.getElementById("chargeOrderRef")?.value || "ORDER-001";
    const result = await api(`/api/v1/tenants/${tenantId}/plugins/${pluginId}/payments/charge`, {
      method: "POST",
      body: JSON.stringify({ amount, currency: "MMK", orderRef, method: "CARD" }),
    });
    const out = document.getElementById("chargeOutput");
    if (out) {
      out.textContent = JSON.stringify(result, null, 2);
    }
    showBanner(`Charge ${result.result.status}.`);
  });

  document.getElementById("runAutomationBtn")?.addEventListener("click", async () => {
    const output = await api(`/api/v1/tenants/${tenantId}/offline/automation/run`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const out = document.getElementById("automationOutput");
    if (out) {
      out.textContent = JSON.stringify(output, null, 2);
    }
    await loadAlerts();
    showBanner(`Offline automation completed (${output.enforcementMode}).`);
  });

  document.getElementById("refreshAllBtn")?.addEventListener("click", async () => {
    await refreshAll();
    showBanner("Dashboard refreshed.");
  });

  document.getElementById("auditRefreshBtn")?.addEventListener("click", async () => {
    if (!canAccessAuditUi()) {
      showBanner("Audit view is restricted to admin roles.", true);
      return;
    }
    await loadAuditView();
    showBanner("Audit view refreshed.");
  });

  document.getElementById("queueReportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const templateId = document.getElementById("offlineTemplateInput")?.value || "REP-X-OPS-001";
    await api(`/api/v1/tenants/${tenantId}/offline/reports/queue`, {
      method: "POST",
      body: JSON.stringify({
        templateId,
        filters: {},
      }),
    });
    await loadOfflineEnhanced();
    showBanner("Offline report request queued.");
  });

  document.getElementById("offlineReconcileBtn")?.addEventListener("click", async () => {
    const result = await api(`/api/v1/tenants/${tenantId}/offline/reconcile`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await Promise.all([loadOfflineEnhanced(), loadRewardPanel()]);
    showBanner(`Offline reconcile done. Confirmed: ${result.confirmed}, Conflicts: ${result.conflicts}.`);
  });

  document.getElementById("extReportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runExtensionReport();
    showBanner("Reporting extension generated.");
  });

  document.getElementById("extExportCsvBtn")?.addEventListener("click", () => {
    exportExtensionReport("csv");
  });
  document.getElementById("extExportPdfBtn")?.addEventListener("click", () => {
    exportExtensionReport("pdf");
  });
  document.getElementById("extExportPrintBtn")?.addEventListener("click", () => {
    exportExtensionReport("print");
  });

  document.getElementById("phase5DiscountForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      mode: "RETAIL",
      customerId: document.getElementById("phase5DiscountCustomerId")?.value || undefined,
      lines: [
        {
          productId: document.getElementById("phase5DiscountProductId")?.value || "prod-a-001",
          quantity: Number(document.getElementById("phase5DiscountQty")?.value || 1),
        },
      ],
      applyLoyaltySynergy: true,
      couponCode: document.getElementById("phase5DiscountCouponCode")?.value || undefined,
      manualOverridePct: Number(document.getElementById("phase5DiscountManualPct")?.value || 0),
    };
    const result = await api(`/api/v1/tenants/${tenantId}/discounts/advanced/apply`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const out = document.getElementById("phase5DiscountOutput");
    if (out) {
      out.textContent = JSON.stringify(result, null, 2);
    }
    showBanner("Phase 5 advanced discount applied.");
  });

  document.getElementById("phase5ReportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runPhase5MultiStoreReport();
    showBanner("Phase 5 multi-store report generated.");
  });

  document.getElementById("phase5ExportCsvBtn")?.addEventListener("click", () => {
    exportPhase5MultiStore("csv");
  });

  document.getElementById("phase5ExportPdfBtn")?.addEventListener("click", () => {
    exportPhase5MultiStore("pdf");
  });

  document.getElementById("phase5RiskPolicyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      policyName: document.getElementById("phase5PolicyName")?.value || "Dashboard policy",
      scope: document.getElementById("phase5PolicyScope")?.value || "BRANCH",
      mode: document.getElementById("phase5PolicyMode")?.value || "WARN",
      conditions: {
        vpnDetected: Boolean(document.getElementById("phase5PolicyVpn")?.checked),
        restrictedLocation: Boolean(document.getElementById("phase5PolicyRestricted")?.checked),
        untrustedDevice: Boolean(document.getElementById("phase5PolicyDevice")?.checked),
      },
    };
    const result = await api(`/api/v1/tenants/${tenantId}/risk-compliance/policies`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const out = document.getElementById("phase5PolicyOutput");
    if (out) {
      out.textContent = JSON.stringify(result, null, 2);
    }
    await loadPhase5ComplianceEvents();
    showBanner("Phase 5 risk policy saved.");
  });

  document.getElementById("phase5RiskEvalForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      endpoint: `/api/v1/tenants/${tenantId}/sales/checkout`,
      action: document.getElementById("phase5RiskAction")?.value || "READ",
      vpnDetected: Boolean(document.getElementById("phase5RiskVpn")?.checked),
      restrictedLocation: Boolean(document.getElementById("phase5RiskRestricted")?.checked),
      untrustedDevice: Boolean(document.getElementById("phase5RiskDevice")?.checked),
    };
    const response = await fetch(`/api/v1/tenants/${tenantId}/risk-compliance/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    const out = document.getElementById("phase5RiskOutput");
    if (out) {
      out.textContent = JSON.stringify(result, null, 2);
    }
    await loadPhase5ComplianceEvents();
    showBanner(`Risk evaluate result: ${result.mode || response.status}`, !response.ok);
  });
}

async function refreshAll() {
  const jobs = [
    loadBrandAndContext(),
    loadOverview(),
    loadManagement(),
    loadTemplates(),
    loadPlugins(),
    loadAlerts(),
    loadRewardPanel(),
    loadOfflineEnhanced(),
    loadExtensionTemplates(),
    loadPhase5ComplianceEvents(),
  ];
  if (canAccessAuditUi()) {
    jobs.push(loadAuditView());
  }
  await Promise.all(jobs);
}

async function init() {
  try {
    configureAuditSection();
    await bindForms();
    await refreshAll();
  } catch (error) {
    console.error(error);
    showBanner(error.message || "Initialization failed", true);
  }
}

void init();
