import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4308";

const ownerHeaders = {
  "x-user-id": "u-to-a",
  "x-role": "TENANT_OWNER",
  "x-tenant-id": "tenant-a",
  "x-branch-id": "branch-a-1",
};

const managerHeaders = {
  "x-user-id": "u-mg-a",
  "x-role": "MANAGER",
  "x-tenant-id": "tenant-a",
  "x-branch-id": "branch-a-1",
};

async function enableFlag(request: any, key: string) {
  const response = await request.patch(`${baseUrl}/api/v1/tenants/tenant-a/feature-flags/${key}`, {
    headers: {
      ...ownerHeaders,
      "content-type": "application/json",
    },
    data: {
      enabled: true,
    },
  });
  expect(response.status()).toBe(200);
}

test.beforeAll(async () => {
  const app = createApp(createStore());
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(4308, () => resolve(instance));
  });
});

test.afterAll(async () => {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test("Phase 8 E2E: predictive actions are visible and actionable in ops dashboard", async ({ page, request }) => {
  await enableFlag(request, "phase7_observability");
  await enableFlag(request, "phase7_predictive");
  await enableFlag(request, "phase7_scale_guard");
  await enableFlag(request, "scale_reads");
  await enableFlag(request, "phase8_predictive_actions");
  await enableFlag(request, "phase8_ops_enhancements");

  const queued = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/sync/queue`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "REPORT",
      idempotencyKey: "8eaa5f5f-84cc-4cc6-bf56-297458dc9a98",
      payload: { templateId: "REP-X-OPS-001", filters: {} },
    },
  });
  expect(queued.status()).toBe(201);

  await page.goto(
    `${baseUrl}/web/ops-dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a&locale=en`,
  );
  await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();

  await page.selectOption("#trendMetricInput", "queue_pending");
  await page.click("#trendForm button[type='submit']");
  await expect(page.locator("#actionList li").first()).toBeVisible();

  await page.locator("#actionList button[data-decision='ACKNOWLEDGE']").first().click();
  await expect(page.locator("#banner")).toContainText("Predictive action updated.");
});

test("Phase 8 E2E: compliance export includes legal-hold fields for audit retention evidence", async ({ request }) => {
  await enableFlag(request, "phase7_compliance_exports");

  const hold = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/compliance/legal-holds`, {
    headers: {
      ...ownerHeaders,
      "content-type": "application/json",
    },
    data: {
      scope: "TENANT",
      reason: "phase8-e2e-legal-hold",
    },
  });
  expect(hold.status()).toBe(201);

  const jsonExport = await request.get(`${baseUrl}/api/v1/tenants/tenant-a/compliance/exports?format=json&page=1&pageSize=20`, {
    headers: managerHeaders,
  });
  expect(jsonExport.status()).toBe(200);
  const jsonPayload = await jsonExport.json();
  expect(Array.isArray(jsonPayload.item.rows)).toBe(true);

  const first = jsonPayload.item.rows[0];
  if (first) {
    expect(first.legal_hold_active).toBeDefined();
    expect(first.retention_days).toBeDefined();
    expect(first.retention_expires_at).toBeDefined();
    expect(first.immutable_record).toBe(true);
  }

  const csvExport = await request.get(`${baseUrl}/api/v1/tenants/tenant-a/compliance/exports?format=csv&page=1&pageSize=20`, {
    headers: managerHeaders,
  });
  expect(csvExport.status()).toBe(200);
  expect(csvExport.headers()["content-type"] || "").toContain("text/csv");
  const csvBody = await csvExport.text();
  expect(csvBody).toContain("legal_hold_active");
  expect(csvBody).toContain("immutable_record");
});
