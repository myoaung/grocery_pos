import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4307";

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
    const instance = app.listen(4307, () => resolve(instance));
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

test("Phase 7 E2E: Observability dashboard shows aggregated metrics", async ({ page, request }) => {
  await enableFlag(request, "phase7_observability");
  await enableFlag(request, "phase7_scale_guard");

  await page.goto(`${baseUrl}/web/ops-dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
  await expect(page.locator("#cardMetrics")).not.toHaveText("");
  await expect(page.locator("#slaOutput")).toContainText("offlineRetrySuccessRatePct");
});

test("Phase 7 E2E: Predictive SLA alerts trigger on simulated violations", async ({ page, request }) => {
  await enableFlag(request, "phase7_predictive");
  await enableFlag(request, "phase7_scale_guard");

  await request.post(`${baseUrl}/api/v1/tenants/tenant-a/sync/queue`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "REPORT",
      idempotencyKey: "ba6855b8-f817-4cea-a35a-3afd7da3e381",
      payload: { templateId: "REP-X-OPS-001", filters: {} },
    },
  });

  await page.goto(`${baseUrl}/web/ops-dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await page.fill("#slaHorizonInput", "7");
  await page.click("#slaForm button[type='submit']");
  await expect(page.locator("#predictiveSlaOutput")).toContainText("riskLevel");
});

test("Phase 7 E2E: Webhook events delivered with retry and idempotency controls", async ({ request }) => {
  await enableFlag(request, "phase7_integration_control");
  await enableFlag(request, "webhook_outbound");

  const client = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/clients`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      name: "Phase7 E2E Client",
      allowedEventTypes: ["P7_E2E"],
    },
  });
  expect(client.status()).toBe(201);
  const clientPayload = await client.json();
  const clientId = clientPayload.item.clientId;

  const endpoint = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/endpoints`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      name: "Phase7 E2E Endpoint",
      url: "https://example.org/webhooks/phase7-e2e",
      eventTypes: ["P7_E2E"],
      integrationClientId: clientId,
    },
  });
  expect(endpoint.status()).toBe(201);

  const idempotencyKey = "f03f7ac3-8f73-4f5e-90f1-090f4ca2fa66";
  const dispatchA = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/dispatch`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "P7_E2E",
      idempotencyKey,
      payload: { run: "a" },
    },
  });
  expect(dispatchA.status()).toBe(202);

  const dispatchB = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/dispatch`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "P7_E2E",
      idempotencyKey,
      payload: { run: "a" },
    },
  });
  expect(dispatchB.status()).toBe(202);

  const deliveries = await request.get(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/deliveries`, {
    headers: managerHeaders,
  });
  expect(deliveries.status()).toBe(200);
  const deliveriesPayload = await deliveries.json();
  expect(deliveriesPayload.items.length).toBe(1);
});
