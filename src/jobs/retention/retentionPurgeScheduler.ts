import type { MemoryStore } from "../../store/memoryStore";
import { RetentionPurgeJobService } from "./retentionPurgeJobService";

export class RetentionPurgeScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly service: RetentionPurgeJobService;

  constructor(private readonly store: MemoryStore) {
    this.service = new RetentionPurgeJobService(store);
  }

  start(): void {
    if (this.timer) {
      return;
    }
    const intervalMsRaw = Number(process.env.RETENTION_PURGE_INTERVAL_MS ?? 60 * 60 * 1000);
    const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw > 0 ? intervalMsRaw : 60 * 60 * 1000;
    this.timer = setInterval(() => {
      this.service.runOnce();
    }, intervalMs);
    this.timer.unref();
  }
}

