import request from "supertest";
import { describe, expect, it } from "vitest";
import { PERFORMANCE_BUDGET } from "../src/config/performanceBudget";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";

function h(userId: string, role: string, tenantId = "tenant-a", branchId = "branch-a-1") {
  return {
    "x-user-id": userId,
    "x-role": role,
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
  };
}

describe("Phase 5.1 - Discount governance hardening", () => {
  it("exposes discount policy-as-data contract via API", async () => {
    const app = createApp(createStore());

    const policy = await request(app)
      .get("/api/v1/tenants/tenant-a/discounts/advanced/policy")
      .set(h("u-mg-a", "MANAGER"));

    expect(policy.status).toBe(200);
    expect(Array.isArray(policy.body.item.order)).toBe(true);
    expect(policy.body.item.caps.baseAutomaticPct).toBe(12);
    expect(policy.body.item.reasonCodes.cashierOverrideForbidden.code).toBe("DISC_CASHIER_OVERRIDE_FORBIDDEN");
  });

  it("keeps base automatic cap exact at 12% without cap-enforced rejection at boundary", async () => {
    const app = createApp(createStore());

    const evaluation = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        lines: [
          { productId: "prod-a-001", quantity: 60 },
          { productId: "prod-a-002", quantity: 60 },
        ],
        couponCode: "VIP3",
      });

    expect(evaluation.status).toBe(200);
    expect(evaluation.body.item.resolutionPolicy.applied.baseAutomaticPct).toBe(12);
    expect(
      evaluation.body.item.rejectionReasons.some((reason: any) => reason.code === "DISC_BASE_CAP_ENFORCED"),
    ).toBe(false);
  });

  it("accepts exact promo cap and emits no promo cap rejection at boundary", async () => {
    const app = createApp(createStore());

    const evaluation = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
        manualOverridePct: 8,
      });

    expect(evaluation.status).toBe(200);
    expect(evaluation.body.item.resolutionPolicy.applied.promoPct).toBe(8);
    expect(
      evaluation.body.item.rejectionReasons.some((reason: any) => reason.code === "DISC_PROMO_CAP_ENFORCED"),
    ).toBe(false);
  });

  it("returns machine + UI readable reason codes for forbidden cashier manual override", async () => {
    const app = createApp(createStore());

    const rejected = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-ca-a", "CASHIER"))
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
        manualOverridePct: 1,
      });

    expect(rejected.status).toBe(403);
    expect(rejected.body.error).toBe("FORBIDDEN_DISCOUNT_OVERRIDE");
    expect(rejected.body.reasonCode).toBe("DISC_CASHIER_OVERRIDE_FORBIDDEN");
    expect(typeof rejected.body.reasonMessage).toBe("string");
  });

  it("versions policy data and exposes read-only preview with cache headers", async () => {
    const app = createApp(createStore());

    const preview = await request(app)
      .get("/api/v1/tenants/tenant-a/discounts/advanced/policy/preview")
      .set(h("u-mg-a", "MANAGER"));

    expect(preview.status).toBe(200);
    expect(preview.body.item.preview).toBe(true);
    expect(typeof preview.body.item.policyVersion).toBe("string");
    expect(typeof preview.body.item.effectiveFrom).toBe("string");
    expect(preview.headers["cache-control"]).toContain("max-age");
    expect(typeof preview.headers.etag).toBe("string");

    const notModified = await request(app)
      .get("/api/v1/tenants/tenant-a/discounts/advanced/policy/preview")
      .set(h("u-mg-a", "MANAGER"))
      .set("if-none-match", preview.headers.etag as string);
    expect(notModified.status).toBe(304);

    const readonlyContract = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/policy/preview")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(readonlyContract.status).toBe(404);
  });

  it("keeps reasonCode enum stable across localized reasonMessage responses", async () => {
    const app = createApp(createStore());

    const enUs = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-ca-a", "CASHIER"))
      .set("x-locale", "en-US")
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
        manualOverridePct: 1,
      });
    expect(enUs.status).toBe(403);

    const myMm = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-ca-a", "CASHIER"))
      .set("x-locale", "my-MM")
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 1 }],
        manualOverridePct: 1,
      });
    expect(myMm.status).toBe(403);
    expect(enUs.body.reasonCode).toBe("DISC_CASHIER_OVERRIDE_FORBIDDEN");
    expect(myMm.body.reasonCode).toBe("DISC_CASHIER_OVERRIDE_FORBIDDEN");
    expect(typeof enUs.body.reasonMessage).toBe("string");
    expect(typeof myMm.body.reasonMessage).toBe("string");
  });
});

describe("Phase 5.1 - Reporting performance and scale hardening", () => {
  it("keeps multi-store aggregation under configured hard limit at mocked scale", async () => {
    const store = createStore();
    const app = createApp(store);

    for (let index = 0; index < 2500; index += 1) {
      store.sales.push({
        saleId: `p51-load-${index}`,
        tenantId: "tenant-a",
        branchId: index % 2 === 0 ? "branch-a-1" : "branch-a-2",
        cashierUserId: "u-mg-a",
        mode: "RETAIL",
        status: "CONFIRMED",
        lines: [
          {
            productId: "prod-a-001",
            quantity: 1,
            unitPrice: 700,
            discountAmount: 0,
            taxableAmount: 700,
            taxAmount: 35,
            lineTotalBeforeDiscount: 700,
            netLineTotal: 735,
            costSnapshotAtSale: 500,
          },
        ],
        subtotal: 700,
        discountTotal: 0,
        taxTotal: 35,
        netTotal: 735,
        createdAt: store.nowIso(),
      });
    }

    const started = Date.now();
    const report = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=200")
      .set(h("u-mg-a", "MANAGER"));
    const elapsed = Date.now() - started;

    expect(report.status).toBe(200);
    expect(elapsed).toBeLessThanOrEqual(PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs);
    expect(report.body.pagination.pageSize).toBe(200);
  });
});

describe("Phase 5.1 - Audit severity hardening", () => {
  it("classifies audit entries with INFO/WARN/CRITICAL severities", async () => {
    const app = createApp(createStore());

    const allow = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "Audit Severity Allow", phone: "0999911111" });
    expect(allow.status).toBe(201);

    const deny = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/override")
      .set(h("u-ca-a", "CASHIER"))
      .send({ reason: "not allowed" });
    expect(deny.status).toBe(403);

    const logs = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(logs.status).toBe(200);
    expect(logs.body.items.every((item: any) => ["INFO", "WARN", "CRITICAL"].includes(item.severity))).toBe(true);
    expect(logs.body.items.some((item: any) => item.severity === "INFO")).toBe(true);
    expect(logs.body.items.some((item: any) => item.severity === "WARN" || item.severity === "CRITICAL")).toBe(true);
  });
});
