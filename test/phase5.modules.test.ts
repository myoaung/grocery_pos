import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createStore } from "../src/store/memoryStore";
import { phase5MockDataset } from "./fixtures/phase5.mock-data";

function h(userId: string, role: string, tenantId = "tenant-a", branchId = "branch-a-1") {
  return {
    "x-user-id": userId,
    "x-role": role,
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
  };
}

describe("Phase 5 - Advanced Discounts", () => {
  it("FR-P5-816: calculates stacked discounts correctly", async () => {
    const app = createApp(createStore());

    const result = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        lines: [
          { productId: "prod-a-001", quantity: 12 },
          { productId: "prod-a-002", quantity: 8 },
        ],
        couponCode: phase5MockDataset.discounts.couponCode,
      });

    expect(result.status).toBe(201);
    expect(result.body.item.subtotal).toBeGreaterThan(0);
    expect(result.body.item.stackedDiscountPct).toBeGreaterThan(0);
    expect(result.body.item.finalTotal).toBeLessThan(result.body.item.subtotal);
    expect(result.body.item.rules.some((rule: any) => rule.ruleKey === "VOLUME_STACK")).toBe(true);
  });

  it("FR-P5-817: integrates loyalty points with discount rules", async () => {
    const app = createApp(createStore());

    const accrue = await request(app)
      .post("/api/v1/tenants/tenant-a/rewards/accrue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        customerId: phase5MockDataset.loyalty.customerId,
        points: 500,
        reason: "phase5 loyalty synergy",
      });
    expect(accrue.status).toBe(201);

    const evaluation = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        customerId: phase5MockDataset.loyalty.customerId,
        lines: [{ productId: phase5MockDataset.discounts.productId, quantity: phase5MockDataset.discounts.quantity }],
        applyLoyaltySynergy: true,
      });

    expect(evaluation.status).toBe(200);
    expect(evaluation.body.item.loyalty.startingPoints).toBeGreaterThanOrEqual(500);
    expect(evaluation.body.item.loyalty.synergyPct).toBeGreaterThan(0);
    expect(evaluation.body.item.rules.some((rule: any) => rule.ruleKey === "LOYALTY_SYNERGY")).toBe(true);
  });

  it("FR-P5-818: blocks cashier manual override while keeping baseline discount operations", async () => {
    const app = createApp(createStore());

    const denied = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-ca-a", "CASHIER"))
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 3 }],
        manualOverridePct: 2,
      });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("FORBIDDEN_DISCOUNT_OVERRIDE");

    const allowedWithoutOverride = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/evaluate")
      .set(h("u-ca-a", "CASHIER"))
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 3 }],
      });
    expect(allowedWithoutOverride.status).toBe(200);
  });

  it("FR-P5-828: keeps discount history and audit records tenant/branch scoped", async () => {
    const app = createApp(createStore());

    const apply = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/apply")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        customerId: "cust-a-1",
        lines: [{ productId: "prod-a-001", quantity: 5 }],
        applyLoyaltySynergy: true,
      });
    expect(apply.status).toBe(201);

    const history = await request(app)
      .get("/api/v1/tenants/tenant-a/discounts/advanced/history")
      .set(h("u-mg-a", "MANAGER"));
    expect(history.status).toBe(200);
    expect(history.body.items.length).toBeGreaterThanOrEqual(1);
    expect(history.body.items.every((item: any) => item.tenantId === "tenant-a" && item.branchId === "branch-a-1")).toBe(true);

    const audit = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(audit.status).toBe(200);
    expect(audit.body.items.some((item: any) => item.actionType === "DISCOUNT_ADVANCED_APPLY")).toBe(true);
  });
});

describe("Phase 5 - Multi-Store Reporting", () => {
  it("FR-P5-819: aggregates branch sales across tenant scope", async () => {
    const store = createStore();
    const app = createApp(store);

    const sale = await request(app)
      .post("/api/v1/tenants/tenant-a/sales/checkout")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 2 }],
      });
    expect(sale.status).toBe(201);

    store.sales.push({
      saleId: "phase5-sale-a2",
      tenantId: "tenant-a",
      branchId: "branch-a-2",
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

    const summary = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=1")
      .set(h("u-mg-a", "MANAGER"));
    expect(summary.status).toBe(200);
    expect(summary.body.aggregationMode).toBe("LIVE_WITH_SNAPSHOT");
    expect(summary.body.pagination.pageSize).toBe(1);
    expect(summary.body.pagination.limitMax).toBe(200);
    expect(summary.body.pagination.totalRows).toBeGreaterThanOrEqual(2);
    expect(summary.body.rows.length).toBe(1);

    const summaryPage2 = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=2&pageSize=1")
      .set(h("u-mg-a", "MANAGER"));
    expect(summaryPage2.status).toBe(200);

    const branchIdsPaged = new Set(
      [...summary.body.rows, ...summaryPage2.body.rows].map((row: any) => row.branch_id),
    );
    expect(branchIdsPaged.has("branch-a-1")).toBe(true);
    expect(branchIdsPaged.has("branch-a-2")).toBe(true);

    const invalidLimit = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?pageSize=999")
      .set(h("u-mg-a", "MANAGER"));
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.body.error).toBe("INVALID_PAGINATION");
  });

  it("FR-P5-820: enforces multi-store reporting RBAC by role", async () => {
    const app = createApp(createStore());

    const inventoryStaffAllowed = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/inventory-risk")
      .set(h("u-is-a", "INVENTORY_STAFF"));
    expect(inventoryStaffAllowed.status).toBe(200);

    const cashierDenied = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary")
      .set(h("u-ca-a", "CASHIER"));
    expect(cashierDenied.status).toBe(403);
  });

  it("FR-P5-829: writes report audit entries with filter/payload references", async () => {
    const app = createApp(createStore());

    const report = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/discount-compliance?branchId=branch-a-1&role=MANAGER")
      .set(h("u-mg-a", "MANAGER"));
    expect(report.status).toBe(200);

    const audit = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(audit.status).toBe(200);
    expect(
      audit.body.items.some(
        (item: any) =>
          item.actionType === "REPORT_EXTENDED_READ" &&
          String(item.reason).includes("REP-X-MSR-003") &&
          String(item.reason).includes("branchId") &&
          String(item.reason).includes("role"),
      ),
    ).toBe(true);
  });

  it("FR-P5-830: exports multi-store reports in CSV and PDF", async () => {
    const app = createApp(createStore());

    const csv = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary/export?format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(csv.status).toBe(200);
    expect(String(csv.headers["content-type"]).includes("text/csv")).toBe(true);

    const pdf = await request(app)
      .get("/api/v1/tenants/tenant-a/reports/multi-store/summary/export?format=pdf")
      .set(h("u-mg-a", "MANAGER"));
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers["content-type"]).includes("application/pdf")).toBe(true);
  });
});

describe("Phase 5 - Risk and Compliance", () => {
  it("FR-P5-821: upserts risk policies with tenant/branch enforcement", async () => {
    const app = createApp(createStore());

    const created = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/policies")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        policyName: phase5MockDataset.riskCompliance.warnPolicy.policyName,
        scope: phase5MockDataset.riskCompliance.warnPolicy.scope,
        mode: phase5MockDataset.riskCompliance.warnPolicy.mode,
        conditions: phase5MockDataset.riskCompliance.warnPolicy.conditions,
      });
    expect(created.status).toBe(201);
    expect(created.body.item.tenantId).toBe("tenant-a");

    const crossTenantDenied = await request(app)
      .post("/api/v1/tenants/tenant-b/risk-compliance/policies")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        policyName: "cross-tenant",
        scope: "TENANT",
        mode: "WARN",
        conditions: { vpnDetected: true },
      });
    expect(crossTenantDenied.status).toBe(403);
  });

  it("FR-P5-822: allows operations in WARN mode with explicit alert semantics", async () => {
    const app = createApp(createStore());

    await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/policies")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        policyName: "warn untrusted-device",
        scope: "BRANCH",
        mode: "WARN",
        conditions: { untrustedDevice: true },
      });

    const evalWarn = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/sales/checkout",
        action: "WRITE",
        untrustedDevice: true,
      });

    expect(evalWarn.status).toBe(200);
    expect(evalWarn.body.mode).toBe("WARN");
    expect(evalWarn.body.allowed).toBe(true);
  });

  it("FR-P5-823: enforces READ_ONLY write locks", async () => {
    const app = createApp(createStore());

    await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/policies")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        policyName: "readonly vpn",
        scope: "BRANCH",
        mode: "READ_ONLY",
        conditions: { vpnDetected: true },
      });

    const evalReadOnly = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/customers",
        action: "WRITE",
        vpnDetected: true,
      });

    expect(evalReadOnly.status).toBe(409);
    expect(evalReadOnly.body.mode).toBe("READ_ONLY");
    expect(evalReadOnly.body.allowed).toBe(false);
  });

  it("FR-P5-824: enforces BLOCK restrictions with 403 responses", async () => {
    const app = createApp(createStore());

    await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/policies")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        policyName: "block vpn+device",
        scope: "TENANT",
        mode: "BLOCK",
        conditions: { vpnDetected: true, untrustedDevice: true },
      });

    const evalBlock = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/products",
        action: "READ",
        vpnDetected: true,
        untrustedDevice: true,
      });

    expect(evalBlock.status).toBe(403);
    expect(evalBlock.body.mode).toBe("BLOCK");
    expect(evalBlock.body.allowed).toBe(false);
  });

  it("FR-P5-825: records compliance events and restricts event feed access", async () => {
    const app = createApp(createStore());

    const evalWarn = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/sales/checkout",
        action: "READ",
        restrictedLocation: true,
      });
    expect([200, 403, 409]).toContain(evalWarn.status);

    const events = await request(app)
      .get("/api/v1/tenants/tenant-a/risk-compliance/events")
      .set(h("u-mg-a", "MANAGER"));
    expect(events.status).toBe(200);
    expect(events.body.items.length).toBeGreaterThanOrEqual(1);
    expect(events.body.items.every((item: any) => item.tenantId === "tenant-a" && item.branchId === "branch-a-1")).toBe(true);

    const cashierDenied = await request(app)
      .get("/api/v1/tenants/tenant-a/risk-compliance/events")
      .set(h("u-ca-a", "CASHIER"));
    expect(cashierDenied.status).toBe(403);
  });
});

describe("Phase 5 - Audit Trail Hardening", () => {
  it("keeps audit logs append-only and immutable against overwrite/delete attempts", async () => {
    const store = createStore();
    const app = createApp(store);

    const created = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "Audit Hardening", phone: "099001001" });
    expect(created.status).toBe(201);

    const before = store.auditLogs;
    expect(before.length).toBeGreaterThan(0);
    const target = before[before.length - 1] as any;
    const originalReason = target.reason;

    expect(() => {
      target.reason = "MUTATED_REASON";
    }).toThrow(TypeError);

    expect(() => {
      delete target.reason;
    }).toThrow(TypeError);

    const mutableView = store.auditLogs as any[];
    const lenBeforeDeleteAttempt = store.auditLogs.length;
    mutableView.pop();
    expect(store.auditLogs.length).toBe(lenBeforeDeleteAttempt);
    expect((store.auditLogs[store.auditLogs.length - 1] as any).reason).toBe(originalReason);
  });
});
