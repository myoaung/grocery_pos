import { execSync } from "node:child_process";
import { assertSupabaseEnv, loadEnvFiles } from "./supabase-env-guard";

const SUPABASE_POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.063";

type GateMode = "ci" | "apply" | "drift";

function resolveMode(): GateMode {
  if (process.argv.includes("--apply")) {
    return "apply";
  }
  if (process.argv.includes("--drift")) {
    return "drift";
  }
  return "ci";
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function redactSensitive(input: string, secrets: string[]): string {
  let result = input;
  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    result = result.split(secret).join("[REDACTED]");
  }
  result = result.replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URL]");
  return result;
}

function runCommand(command: string, description: string, secrets: string[] = []): string {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
  } catch (error) {
    const stdout = error instanceof Error && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const combined = [stdout, stderr].filter(Boolean).join("\n");
    const safeDetails = redactSensitive(combined, secrets).trim();
    throw new Error(`${description} failed.${safeDetails ? `\n${safeDetails}` : ""}`);
  }
}

function assertCliAvailable(): void {
  const versionOutput = runCommand("supabase --version", "Supabase CLI availability check").trim();
  if (versionOutput) {
    process.stdout.write(`Supabase CLI detected (${versionOutput}).\n`);
  }
}

function resolveDbUrl(): { dbUrlWithPassword: string; secrets: string[] } {
  const dbUrlRaw = process.env.SUPABASE_DB_URL?.trim() ?? "";
  const dbPasswordRaw = process.env.SUPABASE_DB_PASSWORD?.trim() ?? "";
  const parsed = new URL(dbUrlRaw);
  if (!parsed.password) {
    parsed.password = dbPasswordRaw;
  }
  const dbUrlWithPassword = parsed.toString();
  return {
    dbUrlWithPassword,
    secrets: [dbPasswordRaw, encodeURIComponent(dbPasswordRaw), dbUrlWithPassword],
  };
}

function parseMigrationRows(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /[|│]/.test(line) && /\d{8,}/.test(line));
}

function assertNoMigrationDrift(output: string): void {
  const rows = parseMigrationRows(output);
  const driftRows: string[] = [];

  for (const row of rows) {
    const normalized = row.replace(/│/g, "|");
    const columns = normalized.split("|").map((item) => item.trim());
    if (columns.length < 2) {
      continue;
    }
    const localVersion = columns[0] ?? "";
    const remoteVersion = columns[1] ?? "";
    if (!localVersion || !remoteVersion) {
      driftRows.push(row);
    }
  }

  if (driftRows.length > 0) {
    throw new Error(`Migration drift detected (local/remote mismatch rows):\n- ${driftRows.join("\n- ")}`);
  }
}

function runLocalWindowsPreflight(): void {
  if (process.platform !== "win32" || process.env.CI) {
    return;
  }

  if (!process.env.SHADOW_DB_PORT) {
    process.env.SHADOW_DB_PORT = "0";
  }
  process.stdout.write("Windows local mode: SHADOW_DB_PORT=0 (auto) to avoid Docker shadow DB port conflicts.\n");

  runCommand("docker info", "Docker Desktop preflight");
  runCommand(`docker pull ${SUPABASE_POSTGRES_IMAGE}`, "Supabase Postgres image pull");
  process.stdout.write(`Docker preflight passed. Image ensured: ${SUPABASE_POSTGRES_IMAGE}\n`);
}

function applyMigrations(dbUrlWithPassword: string, secrets: string[]): void {
  process.stdout.write("Applying Supabase migrations...\n");
  runCommand(`supabase migration up --db-url ${quote(dbUrlWithPassword)} --include-all`, "Supabase migration apply", secrets);
}

function checkMigrationHistoryDrift(dbUrlWithPassword: string, secrets: string[]): void {
  process.stdout.write("Checking migration history drift...\n");
  const output = runCommand(`supabase migration list --db-url ${quote(dbUrlWithPassword)}`, "Supabase migration list check", secrets);
  assertNoMigrationDrift(output);
}

function shouldSkipSchemaDrift(): boolean {
  if (process.platform === "win32" && !process.env.CI) {
    process.stdout.write("Skipping schema drift check on local Windows to avoid shadow DB Docker port conflicts.\n");
    return true;
  }
  if (process.env.SKIP_SCHEMA_DRIFT === "1") {
    process.stdout.write("Skipping schema drift check because SKIP_SCHEMA_DRIFT=1.\n");
    return true;
  }
  return false;
}

function checkSchemaDrift(dbUrlWithPassword: string, secrets: string[]): void {
  if (shouldSkipSchemaDrift()) {
    return;
  }
  process.stdout.write("Checking schema drift...\n");
  const output = runCommand(
    `supabase db diff --db-url ${quote(dbUrlWithPassword)} --schema public`,
    "Supabase schema diff check",
    secrets,
  );
  const normalized = output.trim();
  if (normalized.length > 0 && !/No schema changes found/i.test(normalized)) {
    throw new Error("Migration drift detected: schema changes exist that are not represented by migrations.");
  }
}

function main() {
  try {
    const mode = resolveMode();
    loadEnvFiles();
    assertSupabaseEnv();
    runLocalWindowsPreflight();
    assertCliAvailable();

    const { dbUrlWithPassword, secrets } = resolveDbUrl();

    if (mode === "apply" || mode === "ci") {
      applyMigrations(dbUrlWithPassword, secrets);
    }
    if (mode === "drift" || mode === "ci") {
      checkMigrationHistoryDrift(dbUrlWithPassword, secrets);
      checkSchemaDrift(dbUrlWithPassword, secrets);
    }

    process.stdout.write(`Supabase migration gate passed (mode=${mode}).\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
