import type { MemoryStore } from "../store/memoryStore";
import type { AuditLog, RequestContext } from "../types";
import { ServiceError } from "../utils/errors";

type AuditAppendInput = Omit<
  AuditLog,
  | "auditLogId"
  | "createdAt"
  | "sequence"
  | "previousHash"
  | "entryHash"
  | "externalAnchorRef"
  | "externalAnchorTimestamp"
  | "externalAnchorCounter"
  | "severity"
> & {
  severity?: AuditLog["severity"];
};

export class AuditService {
  constructor(private readonly store: MemoryStore) {}

  private readonly severityRank: Record<AuditLog["severity"], number> = {
    INFO: 1,
    WARN: 2,
    CRITICAL: 3,
  };

  private logicalHash(payload: string): string {
    let checksum = 0;
    for (let index = 0; index < payload.length; index += 1) {
      checksum = (checksum * 31 + payload.charCodeAt(index)) % 2147483647;
    }
    return checksum.toString(16).padStart(8, "0");
  }

  append(input: AuditAppendInput): AuditLog {
    return this.store.addAudit(input);
  }

  listForContext(ctx: RequestContext): ReadonlyArray<Readonly<AuditLog>> {
    return this.store.auditLogs.filter(
      (item) =>
        ctx.role === "APPLICATION_OWNER" ||
        (item.tenantId === ctx.tenantId && item.branchId === ctx.branchId),
    );
  }

  // Service-level immutability guard. Audit writes are append-only.
  updateEntry(): never {
    throw new ServiceError("AUDIT_IMMUTABLE", "Audit records are append-only and cannot be updated", 409);
  }

  // Service-level immutability guard. Audit writes are append-only.
  deleteEntry(): never {
    throw new ServiceError("AUDIT_IMMUTABLE", "Audit records are append-only and cannot be deleted", 409);
  }

  private classifyExpectedSeverity(entry: Pick<AuditLog, "decision" | "reason" | "actionType">): AuditLog["severity"] {
    const text = `${entry.reason}|${entry.actionType}`.toUpperCase();
    if (entry.decision === "DENY") {
      if (text.includes("BLOCK") || text.includes("IMMUTABLE")) {
        return "CRITICAL";
      }
      return "WARN";
    }
    if (text.includes("WARN") || text.includes("READ_ONLY")) {
      return "WARN";
    }
    return "INFO";
  }

  detectSeverityDowngrades(): Array<{
    sequence: number;
    expected: AuditLog["severity"];
    actual: AuditLog["severity"];
    reason: string;
    actionType: string;
  }> {
    const issues: Array<{
      sequence: number;
      expected: AuditLog["severity"];
      actual: AuditLog["severity"];
      reason: string;
      actionType: string;
    }> = [];

    for (const entry of this.store.auditLogs) {
      const expected = this.classifyExpectedSeverity(entry);
      if (this.severityRank[entry.severity] < this.severityRank[expected]) {
        issues.push({
          sequence: entry.sequence,
          expected,
          actual: entry.severity,
          reason: entry.reason,
          actionType: entry.actionType,
        });
      }
    }

    return issues;
  }

  verifyChainIntegrity(): { valid: boolean; brokenAtSequence: number | null } {
    const logs = this.store.auditLogs;
    for (let index = 0; index < logs.length; index += 1) {
      const entry = logs[index];
      const prev = index > 0 ? logs[index - 1] : undefined;
      const expectedPreviousHash = prev ? prev.entryHash : null;
      if (entry.previousHash !== expectedPreviousHash) {
        return { valid: false, brokenAtSequence: entry.sequence };
      }

      const expectedHash = this.logicalHash(
        JSON.stringify({
          sequence: entry.sequence,
          previousHash: entry.previousHash,
          tenantId: entry.tenantId,
          branchId: entry.branchId,
          actorUserId: entry.actorUserId,
          roleAtTime: entry.roleAtTime,
          endpoint: entry.endpoint,
          method: entry.method,
          decision: entry.decision,
          reason: entry.reason,
          actionType: entry.actionType,
          externalAnchorRef: entry.externalAnchorRef,
          externalAnchorTimestamp: entry.externalAnchorTimestamp,
          externalAnchorCounter: entry.externalAnchorCounter,
          severity: entry.severity,
          createdAt: entry.createdAt,
        }),
      );

      if (entry.entryHash !== expectedHash) {
        return { valid: false, brokenAtSequence: entry.sequence };
      }
    }

    return { valid: true, brokenAtSequence: null };
  }

  startupIntegrityCheck(): void {
    const chain = this.verifyChainIntegrity();
    if (!chain.valid) {
      throw new ServiceError(
        "AUDIT_CHAIN_BROKEN",
        `Audit chain integrity failed at sequence ${chain.brokenAtSequence ?? "unknown"}`,
        500,
      );
    }

    const downgrades = this.detectSeverityDowngrades();
    if (downgrades.length > 0) {
      throw new ServiceError("AUDIT_SEVERITY_DOWNGRADE", "Audit severity downgrade detected at startup", 500);
    }
  }

  integrityReport() {
    const chain = this.verifyChainIntegrity();
    const downgrades = this.detectSeverityDowngrades();
    const head = this.store.auditLogs.length > 0 ? this.store.auditLogs[this.store.auditLogs.length - 1] : null;
    return {
      chainValid: chain.valid,
      brokenAtSequence: chain.brokenAtSequence,
      severityDowngradeCount: downgrades.length,
      severityDowngrades: downgrades,
      totalEntries: this.store.auditLogs.length,
      anchorHead: head
        ? {
            sequence: head.sequence,
            externalAnchorRef: head.externalAnchorRef,
            entryHash: head.entryHash,
            createdAt: head.createdAt,
          }
        : null,
    };
  }
}
