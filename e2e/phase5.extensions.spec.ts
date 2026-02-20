import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4303";

const managerHeaders = {
  "x-user-id": "u-mg-a",
  "x-role": "MANAGER",
  "x-tenant-id": "tenant-a",
  "x-branch-id": "branch-a-1",
};

test.beforeAll(async () => {
  const app = createApp(createStore());
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(4303, () => resolve(instance));
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

test("FR-P5-826: POS applies advanced discounts with loyalty synergy", async ({ page, request }) => {
  await request.post(`${baseUrl}/api/v1/tenants/tenant-a/rewards/accrue`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      customerId: "cust-a-1",
      points: 500,
      reason: "phase5 e2e accrual",
    },
  });

  await page.goto(`${baseUrl}/web/?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await page.fill("#discountProductId", "prod-a-001");
  await page.fill("#discountQty", "6");
  await page.fill("#discountCustomerId", "cust-a-1");
  await page.click("#discountPreviewBtn");

  await expect(page.locator("#phase5DiscountOutput")).toContainText("stackedDiscountPct");
  await expect(page.locator("#phase5DiscountOutput")).toContainText("LOYALTY_SYNERGY");
  await expect(page.locator("#phase5DiscountRulesTable")).toContainText("LOYALTY_SYNERGY");
  await expect(page.locator("#phase5DiscountSummary")).toContainText("Stacked");
});

test("FR-P5-827: Dashboard shows multi-store aggregated reporting module", async ({ page }) => {
  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await expect(page.getByRole("heading", { name: "Phase 5 Modules" })).toBeVisible();

  await page.click("#phase5ReportForm button[type='submit']");
  await expect(page.locator("#phase5ReportOutput")).toContainText("branch_id");
  await expect(page.locator("#phase5ReportOutput")).toContainText("net_sales");
});

test("FR-P5-828: Risk compliance lock evaluation shows BLOCK mode and logs audit evidence", async ({ page, request }) => {
  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);

  await page.selectOption("#phase5PolicyMode", "BLOCK");
  await page.check("#phase5PolicyVpn");
  await page.uncheck("#phase5PolicyRestricted");
  await page.check("#phase5PolicyDevice");
  await page.click("#phase5RiskPolicyForm button[type='submit']");

  await page.selectOption("#phase5RiskAction", "READ");
  await page.check("#phase5RiskVpn");
  await page.uncheck("#phase5RiskRestricted");
  await page.check("#phase5RiskDevice");
  await page.click("#phase5RiskEvalForm button[type='submit']");

  await expect(page.locator("#phase5RiskOutput")).toContainText('"mode": "BLOCK"');
  await expect(page.locator("#phase5RiskOutput")).toContainText('"allowed": false');

  const audit = await request.get(`${baseUrl}/api/v1/audit/logs`, {
    headers: managerHeaders,
  });
  expect(audit.status()).toBe(200);
  const payload = await audit.json();
  expect(
    payload.items.some(
      (item: any) => item.actionType === "RISK_COMPLIANCE_EVALUATE" && String(item.reason).includes("BLOCK"),
    ),
  ).toBe(true);
});

test("Phase 5.1: dashboard exposes read-only admin audit view", async ({ page }) => {
  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await page.click("#auditRefreshBtn");
  await expect(page.getByRole("heading", { name: "Admin Audit View (Read-Only)" })).toBeVisible();
  await expect(page.locator("#auditList")).toBeVisible();
});

test("Phase 6.1: admin audit viewer is hidden for non-admin roles", async ({ page }) => {
  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=CASHIER&userId=u-ca-a`);
  await expect(page.locator("#audit")).toBeHidden();
});

test("Phase 6.1 UI snapshot: cashier receives minimal explanation code on discount rejection", async ({ page }) => {
  await page.goto(`${baseUrl}/web/?tenantId=tenant-a&branchId=branch-a-1&role=CASHIER&userId=u-ca-a`);
  await page.fill("#discountProductId", "prod-a-001");
  await page.fill("#discountQty", "1");
  await page.fill("#discountManualPct", "1");
  await page.click("#discountApplyBtn");

  await expect(page.locator("#explanationPanel")).toBeVisible();
  await expect(page.locator("#explanationCode")).toContainText("LOCK-DISCOUNT-001");
  await expect(page.locator("#explanationMessage")).toContainText("Manual discount not allowed.");
});

test("Phase 6.1 UI snapshot: dashboard severity filter renders CRITICAL audit rows", async ({ page, request }) => {
  await request.post(`${baseUrl}/api/v1/tenants/tenant-a/customers`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
      "x-risk-mode": "BLOCK",
    },
    data: {
      name: "Severity Snapshot Seed",
      phone: "0977777777",
    },
  });

  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await page.selectOption("#auditSeverityFilter", "CRITICAL");
  await page.click("#auditRefreshBtn");
  await expect(page.locator("#auditList .severity-pill.critical").first()).toBeVisible();
  const snapshotText = (await page.locator("#auditList li").first().innerText()).trim();
  expect(snapshotText).toContain("CRITICAL");
});

test("Phase 6.1 mobile: offline status and discount transparency remain visible", async ({ page, request }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await request.post(`${baseUrl}/api/v1/tenants/tenant-a/sync/queue`, {
    headers: {
      ...managerHeaders,
      "content-type": "application/json",
    },
    data: {
      eventType: "REPORT",
      idempotencyKey: "12121212-1212-4121-8121-121212121212",
      payload: { templateId: "REP-X-LOY-001", filters: {} },
    },
  });

  await page.goto(`${baseUrl}/web/?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await expect(page.locator("#offlinePendingState")).toHaveText(/[1-9][0-9]*/);
  await page.fill("#discountProductId", "prod-a-001");
  await page.fill("#discountQty", "5");
  await page.click("#discountPreviewBtn");
  await expect(page.locator("#phase5DiscountSummary")).toContainText("Stacked");
  await expect(page.locator("#phase5DiscountRulesTable")).toBeVisible();
});
