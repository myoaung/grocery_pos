import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4300";

test.beforeAll(async () => {
  const app = createApp(createStore());
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(4300, () => resolve(instance));
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

test("renders phase2 dashboard shell", async ({ page }) => {
  await page.goto(`${baseUrl}/web/dashboard.html`);
  await expect(page.locator("text=Phase 2 Control Plane")).toBeVisible();
  await expect(page.locator("text=Advanced Reporting")).toBeVisible();
  await expect(page.locator("text=Marketplace / Payment Plugins")).toBeVisible();
  await expect(page.locator("text=Offline Automation & Alerts")).toBeVisible();
});

test("loads dashboard data with manager context", async ({ page }) => {
  await page.goto(`${baseUrl}/web/dashboard.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await expect(page.locator("#kpiSales")).toBeVisible();
  await expect(page.locator("#branchList")).toContainText("A1");
  await expect(page.locator("#templateList")).toContainText("REP-A-001");
  await expect(page.locator("#pluginCatalog")).toContainText("mock-gateway-v1");
});
