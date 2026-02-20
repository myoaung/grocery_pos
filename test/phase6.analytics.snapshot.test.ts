import request from "supertest";
import { describe, expect, it } from "vitest";
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

async function enableFlags(app: any, keys: string[]) {
  for (const key of keys) {
    const updated = await request(app)
      .patch(`/api/v1/tenants/tenant-a/feature-flags/${key}`)
      .set(h("u-to-a", "TENANT_OWNER"))
      .send({ enabled: true });
    expect(updated.status).toBe(200);
  }
}

describe("Phase 6 analytics export snapshots", () => {
  it("keeps JSON export schema snapshot stable", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion", "scale_reads"]);

    const exported = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/datasets/export?metric=queue_pending&days=2&format=json")
      .set(h("u-mg-a", "MANAGER"));
    expect(exported.status).toBe(200);

    const normalized = exported.body.item.rows.map((row: any) => ({
      ...row,
      bucket: "<date>",
    }));
    expect(normalized).toMatchInlineSnapshot(`
      [
        {
          "branch_id": null,
          "bucket": "<date>",
          "metric": "queue_pending",
          "tenant_id": "tenant-a",
          "value": 0,
        },
        {
          "branch_id": null,
          "bucket": "<date>",
          "metric": "queue_pending",
          "tenant_id": "tenant-a",
          "value": 0,
        },
      ]
    `);
  });

  it("keeps CSV header snapshot stable", async () => {
    const app = createApp(createStore());
    await enableFlags(app, ["analytics_expansion", "scale_reads"]);

    const exported = await request(app)
      .get("/api/v1/tenants/tenant-a/analytics/datasets/export?metric=queue_pending&days=2&format=csv")
      .set(h("u-mg-a", "MANAGER"));
    expect(exported.status).toBe(200);
    const [header] = String(exported.text).trim().split("\n");
    expect(header).toMatchInlineSnapshot(`"tenant_id,branch_id,bucket,metric,value"`);
  });
});

