import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_DB_PASSWORD",
] as const;

function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }
    const key = line.slice(0, equalIndex).trim();
    if (!key) {
      continue;
    }
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadEnvFiles(): void {
  const files = [".env", ".env.local"];
  for (const file of files) {
    const absolutePath = path.resolve(process.cwd(), file);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const parsed = parseDotEnv(readFileSync(absolutePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes("replace") ||
    normalized.includes("changeme")
  );
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidPgUrlWithoutPassword(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (!(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:")) {
      return false;
    }
    return parsed.password.length === 0;
  } catch {
    return false;
  }
}

export function assertSupabaseEnv(): void {
  loadEnvFiles();
  const errors: string[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const value = process.env[key];
    if (!value || isPlaceholder(value)) {
      errors.push(`${key} is missing or still set to a placeholder value.`);
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl && !isValidHttpUrl(supabaseUrl)) {
    errors.push("SUPABASE_URL must be a valid http(s) URL.");
  }

  const supabaseDbUrl = process.env.SUPABASE_DB_URL;
  if (supabaseDbUrl && !isValidPgUrlWithoutPassword(supabaseDbUrl)) {
    errors.push(
      "SUPABASE_DB_URL must be a valid postgres URL and must not include a password. Use SUPABASE_DB_PASSWORD instead.",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Supabase env guard failed:\n- ${errors.join("\n- ")}`);
  }
}

function main() {
  try {
    assertSupabaseEnv();
    process.stdout.write("Supabase env guard passed.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("supabase-env-guard")) {
  main();
}
