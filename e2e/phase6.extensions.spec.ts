import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4304";

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
    const instance = app.listen(4304, () => resolve(instance));
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

test("Phase 6 E2E: analytics trends and exports are available behind flags", async ({ request, page }) => {
  await enableFlag(request, "analytics_expansion");
  await enableFlag(request, "scale_reads");

  const trend = await request.get(`${baseUrl}/api/v1/tenants/tenant-a/analytics/trends?metric=net_sales&days=10`, {
    headers: managerHeaders,
  });
  expect(trend.status()).toBe(200);
  const trendPayload = await trend.json();
  expect(Array.isArray(trendPayload.item.rows)).toBeTruthy();
  expect(trendPayload.item.rows.length).toBe(10);

  const exportedCsv = await request.get(
    `${baseUrl}/api/v1/tenants/tenant-a/analytics/datasets/export?metric=queue_pending&days=5&format=csv`,
    {
      headers: managerHeaders,
    },
  );
  expect(exportedCsv.status()).toBe(200);
  expect(exportedCsv.headers()["content-type"]).toContain("text/csv");

  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await expect(page.locator("#tenantName")).toContainText("Tenant A");
});

test("Phase 6 E2E: outbound webhook dispatch remains idempotent and verifiable", async ({ request }) => {
  await enableFlag(request, "webhook_outbound");

  const endpoint = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/endpoints`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      name: "Primary Ops Sink",
      url: "https://example.org/webhook/ops",
      eventTypes: ["TREND_READY"],
    },
  });
  expect(endpoint.status()).toBe(201);

  const idempotencyKey = "55bc44f7-2e22-4866-847e-47f43b8bf604";
  const dispatchA = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/dispatch`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "TREND_READY",
      idempotencyKey,
      payload: { ref: "trend-1" },
    },
  });
  expect(dispatchA.status()).toBe(202);

  const dispatchB = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/dispatch`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "TREND_READY",
      idempotencyKey,
      payload: { ref: "trend-1" },
    },
  });
  expect(dispatchB.status()).toBe(202);

  const deliveries = await request.get(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/deliveries`, {
    headers: managerHeaders,
  });
  expect(deliveries.status()).toBe(200);
  const deliveriesPayload = await deliveries.json();
  expect(deliveriesPayload.items.length).toBe(1);

  const verify = await request.get(
    `${baseUrl}/api/v1/tenants/tenant-a/webhooks/deliveries/${deliveriesPayload.items[0].deliveryId}/verify`,
    {
      headers: managerHeaders,
    },
  );
  expect(verify.status()).toBe(200);
  const verifyPayload = await verify.json();
  expect(verifyPayload.item.signatureValid).toBe(true);
});

test("Phase 6 E2E: background aggregation jobs complete and snapshots are queryable", async ({ request }) => {
  await enableFlag(request, "background_aggregation");

  const queued = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/aggregation/jobs`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      window: "24h",
    },
  });
  expect(queued.status()).toBe(202);
  const queuedPayload = await queued.json();

  await new Promise((resolve) => setTimeout(resolve, 40));
  const status = await request.get(
    `${baseUrl}/api/v1/tenants/tenant-a/aggregation/jobs/${queuedPayload.item.jobId}`,
    {
      headers: managerHeaders,
    },
  );
  expect(status.status()).toBe(200);
  const statusPayload = await status.json();
  expect(["RUNNING", "SUCCEEDED"]).toContain(statusPayload.item.status);

  await new Promise((resolve) => setTimeout(resolve, 50));
  const snapshots = await request.get(`${baseUrl}/api/v1/tenants/tenant-a/aggregation/snapshots`, {
    headers: managerHeaders,
  });
  expect(snapshots.status()).toBe(200);
  const snapshotsPayload = await snapshots.json();
  expect(snapshotsPayload.items.length).toBeGreaterThan(0);
});

test("Phase 6.1 E2E negative: webhook failure path triggers retry and breaker/rate-limit guard", async ({ request }) => {
  await enableFlag(request, "webhook_outbound");

  const endpoint = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/endpoints`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      name: "Negative Fail Sink",
      url: "https://fail.example.org/webhook/negative",
      eventTypes: ["NEGATIVE_FAIL"],
    },
  });
  expect(endpoint.status()).toBe(201);

  const ids = [
    "c03ed42a-2ffb-4f79-8079-2dbb96e404a1",
    "c03ed42a-2ffb-4f79-8079-2dbb96e404a2",
    "c03ed42a-2ffb-4f79-8079-2dbb96e404a3",
  ];
  for (const id of ids) {
    const failed = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/dispatch`, {
      headers: {
        ...managerHeaders,
        "content-type": "application/json",
      },
      data: {
        eventType: "NEGATIVE_FAIL",
        idempotencyKey: id,
        payload: { type: "negative" },
        simulateFailure: true,
      },
    });
    expect(failed.status()).toBe(202);
    const failedPayload = await failed.json();
    expect(["RETRYING", "FAILED"]).toContain(failedPayload.item.deliveries[0].status);
  }

  const blocked = await request.post(`${baseUrl}/api/v1/tenants/tenant-a/webhooks/dispatch`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "NEGATIVE_FAIL",
      idempotencyKey: "c03ed42a-2ffb-4f79-8079-2dbb96e404af",
      payload: { type: "negative" },
    },
  });
  expect([429, 503]).toContain(blocked.status());
  const blockedPayload = await blocked.json();
  expect(["WEBHOOK_RATE_LIMITED", "WEBHOOK_CIRCUIT_OPEN"]).toContain(blockedPayload.error);
});
