import type { MemoryStore } from "../../store/memoryStore";
import { SYSTEM_JOB_ACTOR } from "../../config/coreContracts";

function cutoffIso(days: number): string {
  const ms = Math.max(1, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export interface RetentionPurgeRunResult {
  tenantId: string;
  auditPurged: number;
  securityEventPurged: number;
  complianceEventPurged: number;
  metricPurged: number;
  webhookDeliveryPurged: number;
  aggregationSnapshotPurged: number;
  reportingSnapshotPurged: number;
  durationMs: number;
  status: "SUCCEEDED" | "FAILED";
  errorCode?: string;
}

export class RetentionPurgeJobService {
  constructor(private readonly store: MemoryStore) {}

  runOnce(): RetentionPurgeRunResult[] {
    const results: RetentionPurgeRunResult[] = [];
    for (const tenant of this.store.tenants) {
      const startedAt = Date.now();
      const policy = this.store.getRetentionPolicy(tenant.tenantId);
      try {
        const securityCutoff = cutoffIso(policy.securityEventDays);
        const complianceCutoff = cutoffIso(policy.complianceEventDays);
        const metricCutoff = cutoffIso(policy.metricDays);
        const durationMs = Date.now() - startedAt;
        const result: RetentionPurgeRunResult = {
          tenantId: tenant.tenantId,
          auditPurged: 0,
          securityEventPurged: this.store.purgeSecurityEventsOlderThan(tenant.tenantId, securityCutoff),
          complianceEventPurged: this.store.purgeComplianceEventsOlderThan(tenant.tenantId, complianceCutoff),
          metricPurged: this.store.purgeStructuredMetricsOlderThan(tenant.tenantId, metricCutoff),
          webhookDeliveryPurged: this.store.purgeWebhookDeliveriesOlderThan(tenant.tenantId, metricCutoff),
          aggregationSnapshotPurged: this.store.purgeAggregationSnapshotsOlderThan(tenant.tenantId, metricCutoff),
          reportingSnapshotPurged: this.store.purgeReportingSnapshotsOlderThan(tenant.tenantId, metricCutoff),
          durationMs,
          status: "SUCCEEDED",
        };
        this.store.addStructuredMetric({
          metricName: "retention_purge_duration_ms",
          metricUnit: "ms",
          metricValue: durationMs,
          tenantId: tenant.tenantId,
          branchId: "system",
          tags: {
            status: result.status,
            actor: SYSTEM_JOB_ACTOR.userId,
          },
          source: "SYSTEM",
        });
        this.store.addStructuredMetric({
          metricName: "job_duration_ms",
          metricUnit: "ms",
          metricValue: durationMs,
          tenantId: tenant.tenantId,
          branchId: "system",
          tags: {
            jobType: "retention_purge",
            status: result.status,
          },
          source: "SYSTEM",
        });
        this.store.addStructuredMetric({
          metricName: "job_failure_count",
          metricUnit: "count",
          metricValue: 0,
          tenantId: tenant.tenantId,
          branchId: "system",
          tags: {
            jobType: "retention_purge",
            status: result.status,
          },
          source: "SYSTEM",
        });
        this.store.addAudit({
          tenantId: tenant.tenantId,
          branchId: "system",
          actorUserId: SYSTEM_JOB_ACTOR.userId,
          roleAtTime: SYSTEM_JOB_ACTOR.role,
          endpoint: "/jobs/retention/purge",
          method: "SYSTEM",
          decision: "ALLOW",
          reason: `RETENTION_PURGE_SUCCEEDED:${result.securityEventPurged}/${result.complianceEventPurged}/${result.metricPurged}`,
          actionType: "RETENTION_PURGE_JOB",
        });
        results.push(result);
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : "unknown";
        this.store.addStructuredMetric({
          metricName: "job_duration_ms",
          metricUnit: "ms",
          metricValue: durationMs,
          tenantId: tenant.tenantId,
          branchId: "system",
          tags: {
            jobType: "retention_purge",
            status: "FAILED",
          },
          source: "SYSTEM",
        });
        this.store.addStructuredMetric({
          metricName: "job_failure_count",
          metricUnit: "count",
          metricValue: 1,
          tenantId: tenant.tenantId,
          branchId: "system",
          tags: {
            jobType: "retention_purge",
            status: "FAILED",
          },
          source: "SYSTEM",
        });
        this.store.addAudit({
          tenantId: tenant.tenantId,
          branchId: "system",
          actorUserId: SYSTEM_JOB_ACTOR.userId,
          roleAtTime: SYSTEM_JOB_ACTOR.role,
          endpoint: "/jobs/retention/purge",
          method: "SYSTEM",
          decision: "DENY",
          reason: `RETENTION_PURGE_FAILED:${message}`,
          actionType: "RETENTION_PURGE_JOB",
        });
        results.push({
          tenantId: tenant.tenantId,
          auditPurged: 0,
          securityEventPurged: 0,
          complianceEventPurged: 0,
          metricPurged: 0,
          webhookDeliveryPurged: 0,
          aggregationSnapshotPurged: 0,
          reportingSnapshotPurged: 0,
          durationMs,
          status: "FAILED",
          errorCode: "RETENTION_PURGE_FAILED",
        });
      }
    }
    return results;
  }
}

