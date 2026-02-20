import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

let server: Server;
const baseUrl = "http://127.0.0.1:4301";

test.beforeAll(async () => {
  const app = createApp(createStore());
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(4301, () => resolve(instance));
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

test("renders notifications center shell", async ({ page }) => {
  await page.goto(`${baseUrl}/web/notifications.html`);
  await expect(page.getByRole("heading", { name: "Notifications Center" })).toBeVisible();
  await expect(page.locator("text=Trigger Notification")).toBeVisible();
  await expect(page.locator("text=Notification Feed")).toBeVisible();
});

test("submits a manual notification trigger and shows it in feed", async ({ page }) => {
  await page.goto(`${baseUrl}/web/notifications.html?tenantId=tenant-a&branchId=branch-a-1&role=MANAGER&userId=u-mg-a`);
  await page.fill("#titleInput", "Playwright Notice");
  await page.fill("#bodyInput", "Notification from e2e flow.");
  await page.click("button[type='submit']");
  await expect(page.locator("#feedBody")).toContainText("Playwright Notice");
});
