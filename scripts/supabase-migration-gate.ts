import "dotenv/config";
import { execSync } from "node:child_process";
import { assertSupabaseEnv } from "./supabase-env-guard";

const SUPABASE_POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.063";

type GateMode = "ci" | "apply" | "drift";

function resolveMode(): GateMode {
  if (process.argv.includes("--apply")) return "apply";
  if (process.argv.includes("--drift")) return "drift";
  return "ci";
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function redactSensitive(input: string): string {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? "";
  const encodedDbPassword = encodeURIComponent(dbPassword);
  const dbUrlRaw = process.env.SUPABASE_DB_URL ?? "";
  const dbUrlWithPassword = buildDbUrlWithPassword();

  const candidates = [dbPassword, encodedDbPassword, dbUrlRaw, dbUrlWithPassword].filter(Boolean);
  let output = input;
  for (const token of candidates) {
    output = output.split(token).join("[REDACTED]");
  }
  output = output.replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URL]");
  return output;
}

function runCommand(command: string, description: string): string {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    if (output.trim().length > 0) {
      process.stdout.write(`${redactSensitive(output.trim())}\n`);
    }
    return output;
  } catch (err) {
    const stdout = String((err as { stdout?: unknown })?.stdout ?? "");
    const stderr = String((err as { stderr?: unknown })?.stderr ?? "");
    const details = redactSensitive(`${stdout}\n${stderr}`.trim());
    throw new Error(`${description} failed.${details ? `\n${details}` : ""}`);
  }
}

function assertCliAvailable(): void {
  runCommand("supabase --version", "Supabase CLI availability check");
}

function assertDbUrl(): string {
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required (without password).");
  return dbUrl;
}

function assertDbPassword(): string {
  const dbPass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!dbPass) throw new Error("SUPABASE_DB_PASSWORD is required.");
  return dbPass;
}

function buildDbUrlWithPassword(): string {
  const dbUrl = assertDbUrl();
  const dbPassword = assertDbPassword();
  const parsed = new URL(dbUrl);
  if (!parsed.password) {
    parsed.password = dbPassword;
  }
  return parsed.toString();
}

function ensureDockerForWindowsLocal(): void {
  if (process.platform !== "win32" || process.env.CI) {
    return;
  }

  if (!process.env.SHADOW_DB_PORT) {
    process.env.SHADOW_DB_PORT = "0";
  }
  process.stdout.write("Windows local mode: SHADOW_DB_PORT=0 to avoid shadow DB port conflicts.\n");

  runCommand("docker info", "Docker Desktop preflight");
  runCommand(`docker pull ${SUPABASE_POSTGRES_IMAGE}`, "Supabase shadow DB image pull");
}

function applyMigrations(dbUrlWithPassword: string): void {
  process.stdout.write("Connecting to Supabase... [DB URL hidden]\n");
  process.stdout.write("Applying Supabase migrations...\n");
  runCommand(`supabase migration up --db-url ${quote(dbUrlWithPassword)} --include-all`, "Supabase migration apply");
}

function checkMigrationHistoryDrift(dbUrlWithPassword: string): void {
  process.stdout.write("Checking migration history drift...\n");
  const output = runCommand(`supabase migration list --db-url ${quote(dbUrlWithPassword)}`, "Supabase migration list check");

  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /[|│]/.test(line) && /\d{8,}/.test(line));

  const driftRows: string[] = [];
  for (const row of rows) {
    const normalized = row.replace(/│/g, "|");
    const columns = normalized.split("|").map((item) => item.trim());
    if (columns.length < 2) continue;
    const localVersion = columns[0] ?? "";
    const remoteVersion = columns[1] ?? "";
    if (!localVersion || !remoteVersion) driftRows.push(row);
  }

  if (driftRows.length > 0) {
    throw new Error(`Migration history drift detected:\n- ${driftRows.join("\n- ")}`);
  }
}

function shouldSkipSchemaDrift(): boolean {
  if (process.platform === "win32" && !process.env.CI) {
    process.stdout.write("Skipping schema drift check locally on Windows (Docker port conflicts may occur).\n");
    return true;
  }
  return false;
}

function checkSchemaDrift(dbUrlWithPassword: string): void {
  if (shouldSkipSchemaDrift()) return;

  runCommand(`docker pull ${SUPABASE_POSTGRES_IMAGE}`, "Supabase shadow DB image pull");
  process.stdout.write("Checking schema drift...\n");
  const diffOutput = runCommand(
    `supabase db diff --db-url ${quote(dbUrlWithPassword)} --schema public`,
    "Supabase schema diff check",
  );

  if (diffOutput.trim().length > 0 && !/No schema changes found/i.test(diffOutput)) {
    throw new Error("Schema drift detected: supabase db diff returned pending schema changes.");
  }
}

function main() {
  try {
    const mode = resolveMode();
    assertSupabaseEnv();
    assertCliAvailable();
    ensureDockerForWindowsLocal();

    const dbUrlWithPassword = buildDbUrlWithPassword();

    if (mode === "apply" || mode === "ci") applyMigrations(dbUrlWithPassword);
    if (mode === "drift" || mode === "ci") {
      checkMigrationHistoryDrift(dbUrlWithPassword);
      checkSchemaDrift(dbUrlWithPassword);
    }

    process.stdout.write(`Supabase migration gate passed (mode=${mode}).\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main();
