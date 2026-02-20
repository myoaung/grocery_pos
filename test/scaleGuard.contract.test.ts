import { describe, expect, it } from "vitest";
import { ScaleGuardService } from "../src/services/scaleGuardService";
import { createStore } from "../src/store/memoryStore";

describe("ScaleGuard contract", () => {
  it("returns primary path when scale_reads flag is off", () => {
    const store = createStore();
    store.setFeatureFlag("tenant-a", "scale_reads", false);
    const scale = new ScaleGuardService(store);

    const result = scale.readWithCache({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      cacheKey: "analytics:contract:primary",
      ttlMs: 5000,
      preferReplica: true,
      load: () => ({ value: 1 }),
    });

    expect(result.readSource).toBe("PRIMARY");
    expect(result.cacheHit).toBe(false);
  });

  it("returns cache hit on repeated reads when scale_reads is on", () => {
    const store = createStore();
    store.setFeatureFlag("tenant-a", "scale_reads", true);
    const scale = new ScaleGuardService(store);

    const first = scale.readWithCache({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      cacheKey: "analytics:contract:cache",
      ttlMs: 5000,
      preferReplica: true,
      load: () => ({ value: 2 }),
    });
    const second = scale.readWithCache({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      cacheKey: "analytics:contract:cache",
      ttlMs: 5000,
      preferReplica: true,
      load: () => ({ value: 3 }),
    });

    expect(first.cacheHit).toBe(false);
    expect(["REPLICA", "PRIMARY"]).toContain(first.readSource);
    expect(second.cacheHit).toBe(true);
    expect(second.readSource).toBe("CACHE");
    expect((second.value as any).value).toBe(2);
  });

  it("prevents cross-tenant cache reads and supports prefix eviction", () => {
    const store = createStore();
    store.setFeatureFlag("tenant-a", "scale_reads", true);
    store.setFeatureFlag("tenant-b", "scale_reads", true);
    const scale = new ScaleGuardService(store);

    scale.readWithCache({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      cacheKey: "analytics:contract:tenant-a",
      ttlMs: 5000,
      preferReplica: true,
      load: () => ({ tenant: "a" }),
    });

    const crossTenant = scale.readWithCache({
      tenantId: "tenant-b",
      branchId: "branch-b-1",
      cacheKey: "analytics:contract:tenant-a",
      ttlMs: 5000,
      preferReplica: true,
      load: () => ({ tenant: "b" }),
    });
    expect(crossTenant.cacheHit).toBe(false);
    expect((crossTenant.value as any).tenant).toBe("b");

    // Add a tenant-a entry after cross-tenant overwrite so prefix eviction can be validated deterministically.
    scale.readWithCache({
      tenantId: "tenant-a",
      branchId: "branch-a-1",
      cacheKey: "analytics:contract:tenant-a:evict",
      ttlMs: 5000,
      preferReplica: true,
      load: () => ({ tenant: "a" }),
    });

    const evicted = scale.evictByPrefix("tenant-a", "analytics:");
    expect(evicted).toBeGreaterThanOrEqual(1);
  });
});
