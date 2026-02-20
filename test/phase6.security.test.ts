import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CORE_FEATURE_FLAGS, CORE_ROLES, assertCoreTypeContractsLocked } from "../src/config/coreContracts";
import { AuditService } from "../src/services/auditService";
import { createStore } from "../src/store/memoryStore";

function h(userId: string, role: string, tenantId = "tenant-a", branchId = "branch-a-1") {
  return {
    "x-user-id": userId,
    "x-role": role,
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
  };
}

async function enableFlags(app: any, keys: string[]) {
  for (const key of keys) {
    const updated = await request(app)
      .patch(`/api/v1/tenants/tenant-a/feature-flags/${key}`)
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: true });
    expect(updated.status).toBe(200);
  }
}

describe("Phase 6 - Security hardening", () => {
  it("FR-P6-901: enforces append-only immutable audit chain with actor and timestamp metadata", async () => {
    const store = createStore();
    const app = createApp(store);
    const audits = new AuditService(store);

    const created = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set(h("u-mg-a", "MANAGER"))
      .send({ name: "Phase6 Audit", phone: "0912312312" });
    expect(created.status).toBe(201);

    const logs = await request(app).get("/api/v1/audit/logs").set(h("u-mg-a", "MANAGER"));
    expect(logs.status).toBe(200);
    expect(logs.body.items.length).toBeGreaterThan(0);

    const chain = logs.body.items as Array<any>;
    for (let index = 0; index < chain.length; index += 1) {
      const entry = chain[index];
      expect(entry.sequence).toBe(index + 1);
      expect(typeof entry.entryHash).toBe("string");
      expect(entry.entryHash.length).toBeGreaterThanOrEqual(8);
      expect(typeof entry.externalAnchorRef).toBe("string");
      expect(typeof entry.externalAnchorTimestamp).toBe("string");
      expect(typeof entry.externalAnchorCounter).toBe("number");
      expect(typeof entry.actorUserId).toBe("string");
      expect(typeof entry.createdAt).toBe("string");
      if (index === 0) {
        expect(entry.previousHash).toBeNull();
      } else {
        expect(entry.previousHash).toBe(chain[index - 1].entryHash);
      }
    }

    expect(audits.verifyChainIntegrity().valid).toBe(true);
    expect(() => audits.updateEntry()).toThrowError(/append-only/i);
    expect(() => audits.deleteEntry()).toThrowError(/append-only/i);
  });

  it("FR-P6-904: classifies security events and exposes read-only endpoint", async () => {
    const app = createApp(createStore());

    const warnEval = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        endpoint: "/api/v1/tenants/tenant-a/products",
        action: "READ",
        restrictedLocation: true,
      });
    expect([200, 403, 409]).toContain(warnEval.status);

    const events = await request(app)
      .get("/api/v1/tenants/tenant-a/risk-compliance/security-events")
      .set(h("u-mg-a", "MANAGER"));
    expect(events.status).toBe(200);
    expect(events.body.items.length).toBeGreaterThan(0);
    expect(events.body.items.some((item: any) => ["INFO", "WARN", "CRITICAL"].includes(item.severity))).toBe(true);

    const criticalOnly = await request(app)
      .get("/api/v1/tenants/tenant-a/risk-compliance/security-events?severity=CRITICAL")
      .set(h("u-mg-a", "MANAGER"));
    expect(criticalOnly.status).toBe(200);
    expect(criticalOnly.body.items.every((item: any) => item.severity === "CRITICAL")).toBe(true);

    const cashierDenied = await request(app)
      .get("/api/v1/tenants/tenant-a/risk-compliance/security-events")
      .set(h("u-ca-a", "CASHIER"));
    expect(cashierDenied.status).toBe(403);

    const readOnlyContract = await request(app)
      .post("/api/v1/tenants/tenant-a/risk-compliance/security-events")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(readOnlyContract.status).toBe(404);
  });

  it("FR-P6-907: supports tenant-scoped feature flags for discounts, loyalty, and risk enforcement", async () => {
    const app = createApp(createStore());

    const disableDiscounts = await request(app)
      .patch("/api/v1/tenants/tenant-a/feature-flags/advanced_discounts")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: false });
    expect(disableDiscounts.status).toBe(200);

    const discountBlocked = await request(app)
      .post("/api/v1/tenants/tenant-a/discounts/advanced/evaluate")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        mode: "RETAIL",
        lines: [{ productId: "prod-a-001", quantity: 2 }],
      });
    expect(discountBlocked.status).toBe(409);
    expect(discountBlocked.body.error).toBe("FEATURE_FLAG_DISABLED");

    const disableLoyalty = await request(app)
      .patch("/api/v1/tenants/tenant-a/feature-flags/loyalty_rules")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: false });
    expect(disableLoyalty.status).toBe(200);

    const loyaltyBlocked = await request(app)
      .post("/api/v1/tenants/tenant-a/rewards/accrue")
      .set(h("u-mg-a", "MANAGER"))
      .send({
        customerId: "cust-a-1",
        points: 100,
        reason: "phase6-flag-check",
      });
    expect(loyaltyBlocked.status).toBe(409);
    expect(loyaltyBlocked.body.error).toBe("FEATURE_FLAG_DISABLED");

    const disableRisk = await request(app)
      .patch("/api/v1/tenants/tenant-a/feature-flags/risk_enforcement")
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: false });
    expect(disableRisk.status).toBe(200);

    const blockedHeaderIgnored = await request(app)
      .post("/api/v1/tenants/tenant-a/customers")
      .set({ ...h("u-mg-a", "MANAGER"), "x-risk-mode": "BLOCK" })
      .send({ name: "Risk Flag Off", phone: "0933333333" });
    expect(blockedHeaderIgnored.status).toBe(201);
    expect(blockedHeaderIgnored.headers["x-risk-mode"]).toBe("ALLOW");

    const flags = await request(app)
      .get("/api/v1/tenants/tenant-a/feature-flags")
      .set(h("u-mg-a", "MANAGER"));
    expect(flags.status).toBe(200);
    expect(flags.body.item.flags.advanced_discounts).toBe(false);
    expect(flags.body.item.flags.loyalty_rules).toBe(false);
    expect(flags.body.item.flags.risk_enforcement).toBe(false);
  });

  it("FR-P6-902: validates audit chain integrity at startup and blocks broken chain boot", async () => {
    const store = createStore();
    store.addAudit({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      actorUserId: "u-mg-a",
      roleAtTime: "MANAGER",
      endpoint: "/seed",
      method: "POST",
      decision: "ALLOW",
      reason: "SEED",
      actionType: "SEED",
    });

    const internals = store as any;
    internals.auditLogRecords[0] = {
      ...internals.auditLogRecords[0],
      entryHash: "broken",
    };

    expect(() => createApp(store)).toThrowError(/Audit chain integrity failed/i);
  });

  it("FR-P6-923: external audit export remains read-only and tenant-scoped", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["external_audit_exports", "scale_reads"]);

    const exported = await request(app)
      .get("/api/v1/tenants/tenant-a/exports/audit?format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(exported.status).toBe(200);
    expect(Array.isArray(exported.body.item.rows)).toBe(true);

    const crossTenant = await request(app)
      .get("/api/v1/tenants/tenant-b/exports/audit?format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(crossTenant.status).toBe(403);

    const writeAttempt = await request(app)
      .post("/api/v1/tenants/tenant-a/exports/audit")
      .set(h("u-mg-a", "MANAGER"))
      .send({});
    expect(writeAttempt.status).toBe(404);
  });

  it("FR-P6-930: outbound webhook model enforces no inbound command/control endpoint", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["webhook_outbound"]);

    const inbound = await request(app)
      .post("/api/v1/webhooks/inbound")
      .set(h("u-mg-a", "MANAGER"))
      .send({ command: "RUN" });
    expect(inbound.status).toBe(404);

    const cashierDenied = await request(app)
      .post("/api/v1/tenants/tenant-a/webhooks/dispatch")
      .set(h("u-ca-a", "CASHIER"))
      .send({
        eventType: "OPS_EVENT",
        idempotencyKey: "8e965c4f-e6d2-4f52-abfd-a69f2f7a0b6d",
        payload: { x: 1 },
      });
    expect(cashierDenied.status).toBe(403);
  });

  it("FR-P6-907: core type contracts remain frozen post-Phase 6 lock", () => {
    expect(Object.isFrozen(CORE_ROLES)).toBe(true);
    expect(Object.isFrozen(CORE_FEATURE_FLAGS)).toBe(true);
    expect(() => assertCoreTypeContractsLocked()).not.toThrow();
  });
});
