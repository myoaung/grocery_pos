const query = new URLSearchParams(window.location.search);
const tenantId = query.get("tenantId") || "tenant-a";
const branchId = query.get("branchId") || "branch-a-1";
const role = query.get("role") || "MANAGER";
const userId = query.get("userId") || "u-mg-a";

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

function showModeBanner(feedItems) {
  const banner = document.getElementById("modeBanner");
  if (!banner) return;
  const blocking = feedItems.find((item) => item.severity === "BLOCK" && !item.readBy.includes(userId));
  const readOnly = feedItems.find((item) => item.severity === "READ_ONLY" && !item.readBy.includes(userId));
  if (blocking) {
    banner.className = "banner";
    banner.textContent = `BLOCK: ${blocking.payload.title} - ${blocking.payload.body}`;
    return;
  }
  if (readOnly) {
    banner.className = "banner";
    banner.textContent = `READ_ONLY: ${readOnly.payload.title} - ${readOnly.payload.body}`;
    return;
  }
  banner.className = "banner hidden";
  banner.textContent = "";
}

function renderToasts(feedItems) {
  const mount = document.getElementById("toastMount");
  if (!mount) return;
  mount.innerHTML = "";
  feedItems
    .slice(0, 4)
    .forEach((item) => {
      const div = document.createElement("div");
      div.className = `toast ${item.severity}`;
      div.textContent = `${item.payload.title}: ${item.payload.body}`;
      mount.appendChild(div);
    });
}

function renderFeed(feedItems) {
  const body = document.getElementById("feedBody");
  if (!body) return;
  body.innerHTML = "";

  feedItems.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(item.createdAt).toLocaleString()}</td>
      <td>${item.eventType}</td>
      <td><span class="badge ${item.severity}">${item.severity}</span></td>
      <td>${item.status}</td>
      <td>${item.payload.title}</td>
      <td>${item.readBy.includes(userId) ? "YES" : `<button data-read="${item.notificationId}" class="btn ghost">Mark Read</button>`}</td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll("[data-read]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-read");
      if (!id) return;
      await api(`/api/v1/tenants/${tenantId}/notifications/${id}/read`, { method: "PATCH" });
      await refreshFeed();
    });
  });
}

async function refreshFeed() {
  const feed = await api(`/api/v1/tenants/${tenantId}/notifications/feed?includeRead=true`);
  renderToasts(feed.items);
  renderFeed(feed.items);
  showModeBanner(feed.items);
}

async function bindActions() {
  document.getElementById("triggerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      eventType: document.getElementById("eventTypeInput")?.value || "SYSTEM_EVENT",
      severity: document.getElementById("severityInput")?.value || "INFO",
      title: document.getElementById("titleInput")?.value || "Notice",
      body: document.getElementById("bodyInput")?.value || "Notification body",
      forceQueue: Boolean(document.getElementById("forceQueueInput")?.checked),
    };
    const out = await api(`/api/v1/tenants/${tenantId}/notifications/trigger`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const target = document.getElementById("triggerOut");
    if (target) {
      target.textContent = JSON.stringify(out, null, 2);
    }
    await refreshFeed();
  });

  document.getElementById("goOfflineBtn")?.addEventListener("click", async () => {
    const out = await api(`/api/v1/tenants/${tenantId}/notifications/connectivity`, {
      method: "PATCH",
      body: JSON.stringify({ branchId, online: false }),
    });
    setText("retryOut", JSON.stringify(out, null, 2));
  });

  document.getElementById("goOnlineBtn")?.addEventListener("click", async () => {
    const out = await api(`/api/v1/tenants/${tenantId}/notifications/connectivity`, {
      method: "PATCH",
      body: JSON.stringify({ branchId, online: true }),
    });
    setText("retryOut", JSON.stringify(out, null, 2));
  });

  document.getElementById("retryBtn")?.addEventListener("click", async () => {
    const out = await api(`/api/v1/tenants/${tenantId}/notifications/retry`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setText("retryOut", JSON.stringify(out, null, 2));
    await refreshFeed();
  });

  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
    await refreshFeed();
  });
}

async function init() {
  setText("ctxText", `${tenantId} / ${branchId} / ${role}`);
  await bindActions();
  await refreshFeed();
}

void init();
