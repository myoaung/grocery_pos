import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4302";

test.beforeAll(async () => {
  const app = createApp(createStore());
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(4302, () => resolve(instance));
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

test("renders phase4 extension sections in dashboard", async ({ page }) => {
  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await expect(page.getByRole("heading", { name: "Phase 4 Extensions" })).toBeVisible();
  await expect(page.locator("text=Loyalty & Rewards Engine")).toBeVisible();
  await expect(page.locator("text=Offline Enhancements")).toBeVisible();
  await expect(page.locator("text=Run Reporting Extension")).toBeVisible();
});

test("renders POS phase4 loyalty and reporting controls", async ({ page }) => {
  await page.goto(`${baseUrl}/web/`);
  await expect(page.locator("text=Loyalty Wallet")).toBeVisible();
  await expect(page.locator("#loyaltyPointsState")).toBeVisible();
  await expect(page.locator("text=Reporting Extensions")).toBeVisible();
  await page.click("#runExtReportBtn");
  await expect(page.locator("#extReportOutput")).toContainText("snapshotId");
});
