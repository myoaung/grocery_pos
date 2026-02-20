import { execSync } from "node:child_process";
import request from "supertest";
import { createApp } from "../src/app";
import { PERFORMANCE_BUDGET } from "../src/config/performanceBudget";
import { createStore } from "../src/store/memoryStore";

const headers = {
  "x-user-id": "u-mg-a",
  "x-role": "MANAGER",
  "x-tenant-id": "tenant-a",
  "x-branch-id": "branch-a-1",
};

async function run() {
  try {
    execSync("npx vitest run test/phase7.modules.test.ts test/phase7.performance.test.ts test/phase7.chaos.test.ts", {
      stdio: "pipe",
    });
  } catch {
    throw new Error("CI gate failed: Phase 7 mandatory test suites did not pass");
  }

  const app = createApp(createStore());

  const startedAt = Date.now();
  const report = await request(app)
    .get("/api/v1/tenants/tenant-a/reports/multi-store/summary?page=1&pageSize=50")
    .set(headers);
  const measuredLatency = Date.now() - startedAt;
  if (report.status !== 200) {
    throw new Error(`CI gate failed: reporting endpoint returned ${report.status}`);
  }

  const headerLatencyRaw = Number(report.headers["x-report-latency-ms"]);
  const effectiveLatency = Number.isFinite(headerLatencyRaw) ? headerLatencyRaw : measuredLatency;
  if (effectiveLatency > PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs) {
    throw new Error(
      `CI gate failed: report latency ${effectiveLatency}ms exceeds hard limit ${PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs}ms`,
    );
  }

  const integrity = await request(app).get("/api/v1/audit/integrity").set(headers);
  if (integrity.status !== 200) {
    throw new Error(`CI gate failed: audit integrity endpoint returned ${integrity.status}`);
  }
  if (!integrity.body.item?.chainValid) {
    throw new Error("CI gate failed: audit chain integrity is invalid");
  }
  if ((integrity.body.item?.severityDowngradeCount ?? 0) > 0) {
    throw new Error("CI gate failed: audit severity downgrade detected");
  }

  process.stdout.write(
    `CI gate passed. reportLatencyMs=${effectiveLatency}; hardLimitMs=${PERFORMANCE_BUDGET.reporting.multiStore.hardLimitMs}; auditChainValid=true; severityDowngradeCount=0\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
