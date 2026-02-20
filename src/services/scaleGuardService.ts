import type { MemoryStore } from "../store/memoryStore";

type ReadSource = "PRIMARY" | "REPLICA" | "CACHE";

interface ScaleReadInput<T> {
  tenantId: string;
  branchId: string;
  cacheKey: string;
  ttlMs: number;
  preferReplica?: boolean;
  load: () => T;
}

export class ScaleGuardService {
  constructor(private readonly store: MemoryStore) {}

  private isScaleCacheEnabled(tenantId: string): boolean {
    return this.store.getFeatureFlag(tenantId, "scale_reads");
  }

  private isPhase7ScaleEnabled(tenantId: string): boolean {
    return this.store.getFeatureFlag(tenantId, "phase7_scale_guard");
  }

  private resolveReadSource(tenantId: string, preferReplica: boolean): "PRIMARY" | "REPLICA" {
    if ((this.isScaleCacheEnabled(tenantId) || this.isPhase7ScaleEnabled(tenantId)) && preferReplica) {
      return "REPLICA";
    }
    return "PRIMARY";
  }

  readWithCache<T>(input: ScaleReadInput<T>): { value: T; readSource: ReadSource; cacheHit: boolean } {
    const startedAt = Date.now();
    const cacheEnabled = this.isScaleCacheEnabled(input.tenantId);

    if (cacheEnabled) {
      const cached = this.store.getScaleCache(input.cacheKey, input.tenantId, input.branchId);
      if (cached) {
        this.store.addStructuredMetric({
          metricName: "scale_read_latency_ms",
          metricUnit: "ms",
          metricValue: Date.now() - startedAt,
          tenantId: input.tenantId,
          branchId: input.branchId,
          tags: {
            source: "CACHE",
            cacheHit: "true",
          },
          source: "SERVICE",
        });
        return {
          value: cached.value as T,
          readSource: "CACHE",
          cacheHit: true,
        };
      }
    }

    const readSource = this.resolveReadSource(input.tenantId, Boolean(input.preferReplica));
    const value = input.load();
    if (cacheEnabled) {
      this.store.setScaleCache(input.cacheKey, value, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        readSource,
        ttlMs: input.ttlMs,
      });
    }

    this.store.addStructuredMetric({
      metricName: "scale_read_latency_ms",
      metricUnit: "ms",
      metricValue: Date.now() - startedAt,
      tenantId: input.tenantId,
      branchId: input.branchId,
      tags: {
        source: readSource,
        cacheHit: "false",
      },
      source: "SERVICE",
    });

    return {
      value,
      readSource,
      cacheHit: false,
    };
  }

  readWithTenantHint<T>(
    input: ScaleReadInput<T> & { hint: "OBSERVABILITY" | "PREDICTIVE" | "EXPORT" | "ANALYTICS" },
  ): { value: T; readSource: ReadSource; cacheHit: boolean } {
    const startedAt = Date.now();
    const cacheEnabled = this.isScaleCacheEnabled(input.tenantId) || this.isPhase7ScaleEnabled(input.tenantId);

    if (cacheEnabled) {
      const cached = this.store.getScaleCache(input.cacheKey, input.tenantId, input.branchId);
      if (cached) {
        this.store.addStructuredMetric({
          metricName: "scale_read_latency_ms",
          metricUnit: "ms",
          metricValue: Date.now() - startedAt,
          tenantId: input.tenantId,
          branchId: input.branchId,
          tags: {
            source: "CACHE",
            cacheHit: "true",
            hint: input.hint,
          },
          source: "SERVICE",
        });
        return {
          value: cached.value as T,
          readSource: "CACHE",
          cacheHit: true,
        };
      }
    }

    const readSource = this.resolveReadSource(input.tenantId, Boolean(input.preferReplica));
    const value = input.load();
    if (cacheEnabled) {
      this.store.setScaleCache(input.cacheKey, value, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        readSource,
        ttlMs: input.ttlMs,
      });
    }
    this.store.addStructuredMetric({
      metricName: "scale_read_latency_ms",
      metricUnit: "ms",
      metricValue: Date.now() - startedAt,
      tenantId: input.tenantId,
      branchId: input.branchId,
      tags: {
        source: readSource,
        cacheHit: "false",
        hint: input.hint,
      },
      source: "SERVICE",
    });
    return {
      value,
      readSource,
      cacheHit: false,
    };
  }

  evictByPrefix(tenantId: string, prefix: string): number {
    return this.store.evictScaleCacheByPrefix(prefix, tenantId);
  }

  cacheStats(tenantId: string, branchId?: string): {
    entries: number;
    totalHits: number;
    expiredEntries: number;
  } {
    const now = Date.now();
    const scoped = Array.from(this.store.scaleCacheRecords.values()).filter(
      (item) => item.tenantId === tenantId && (branchId ? item.branchId === branchId : true),
    );
    return {
      entries: scoped.length,
      totalHits: scoped.reduce((acc, item) => acc + item.hits, 0),
      expiredEntries: scoped.filter((item) => item.expiresAt < now).length,
    };
  }

  advisory(
    tenantId: string,
    branchId: string,
    mode: "phase8" | "phase7" = "phase8",
  ): {
    tenantId: string;
    branchId: string;
    throughputClass: "LOW" | "MEDIUM" | "HIGH";
    avgReadLatencyMs: number;
    readSamples: number;
    cache: {
      entries: number;
      totalHits: number;
      expiredEntries: number;
      hitRatePct: number;
    };
    hints: string[];
    mode: "phase8" | "phase7";
  } {
    const stats = this.cacheStats(tenantId, branchId);
    const metrics = this.store.structuredMetrics
      .filter((item) => item.tenantId === tenantId && item.branchId === branchId)
      .filter((item) => item.metricName === "scale_read_latency_ms");
    const readSamples = metrics.length;
    const avgReadLatencyMs =
      readSamples === 0 ? 0 : Math.round((metrics.reduce((acc, item) => acc + item.metricValue, 0) / readSamples) * 100) / 100;
    const requestsLastHour = metrics.filter((item) => Date.parse(item.createdAt) >= Date.now() - 60 * 60 * 1000).length;
    const throughputClass =
      requestsLastHour >= 120 ? "HIGH" : requestsLastHour >= 40 ? "MEDIUM" : "LOW";
    const hitRatePct = stats.entries === 0 ? 0 : Math.round((stats.totalHits / Math.max(1, stats.totalHits + stats.entries)) * 10000) / 100;
    const hints: string[] = [];

    if (throughputClass === "HIGH" && hitRatePct < 30) {
      hints.push("Increase cache TTL or pre-warm high-volume predictive datasets.");
    }
    if (avgReadLatencyMs > 800) {
      hints.push("Latency is elevated; prefer replica reads and reduce payload size.");
    }
    if (stats.expiredEntries > stats.entries * 0.5 && stats.entries > 0) {
      hints.push("High expiry churn detected; align cache keys with stable query windows.");
    }
    if (hints.length === 0) {
      hints.push("Current throughput and cache behavior are within advisory thresholds.");
    }

    return {
      tenantId,
      branchId,
      throughputClass,
      avgReadLatencyMs,
      readSamples,
      cache: {
        ...stats,
        hitRatePct,
      },
      hints,
      mode,
    };
  }
}
