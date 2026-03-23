import {
  isPlaceholder,
  isValidHttpUrl,
  loadEnvFiles,
} from "./supabase-env-guard";

const REQUIRED_RUNTIME_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWKS_URI",
  "JWT_AUDIENCE",
  "JWT_ISSUER",
] as const;

type Severity = "CRITICAL" | "SECURITY" | "INFO";

function logGuardMessage(severity: Severity, message: string): void {
  const stream = severity === "INFO" ? process.stdout : process.stderr;
  stream.write(`[ENV_GUARD][${severity}] ${message}\n`);
}

function assertRuntimeEnv(): void {
  loadEnvFiles();

  const errors: string[] = [];
  const values = Object.fromEntries(
    REQUIRED_RUNTIME_ENV_KEYS.map((key) => [key, process.env[key]?.trim() ?? ""]),
  ) as Record<(typeof REQUIRED_RUNTIME_ENV_KEYS)[number], string>;

  for (const key of REQUIRED_RUNTIME_ENV_KEYS) {
    const value = values[key];
    if (!value || isPlaceholder(value)) {
      errors.push(`${key} is missing or still set to a placeholder value.`);
    }
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    errors.push("SECURITY VIOLATION: NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must not be defined.");
  }

  const hasConcreteSupabaseUrl =
    Boolean(values.SUPABASE_URL) && !isPlaceholder(values.SUPABASE_URL) && isValidHttpUrl(values.SUPABASE_URL);

  if (values.SUPABASE_URL && !isPlaceholder(values.SUPABASE_URL) && !isValidHttpUrl(values.SUPABASE_URL)) {
    errors.push("SUPABASE_URL must be a valid http(s) URL.");
  }

  if (values.JWKS_URI && !isValidHttpUrl(values.JWKS_URI)) {
    errors.push("JWKS_URI must be a valid http(s) URL.");
  }

  if (values.JWT_ISSUER && !isValidHttpUrl(values.JWT_ISSUER)) {
    errors.push("JWT_ISSUER must be a valid http(s) URL.");
  }

  const normalizedSupabaseUrl = hasConcreteSupabaseUrl ? values.SUPABASE_URL.replace(/\/+$/, "") : "";
  if (normalizedSupabaseUrl) {
    const expectedIssuer = `${normalizedSupabaseUrl}/auth/v1`;
    const expectedJwksUri = `${expectedIssuer}/.well-known/jwks.json`;

    if (values.JWT_ISSUER && values.JWT_ISSUER.replace(/\/+$/, "") !== expectedIssuer) {
      errors.push(
        `JWT_ISSUER must match the Supabase Auth issuer for this project (${expectedIssuer}).`,
      );
    }

    if (values.JWKS_URI && values.JWKS_URI.replace(/\/+$/, "") !== expectedJwksUri) {
      errors.push(
        `JWKS_URI must match the Supabase Auth JWKS endpoint for this project (${expectedJwksUri}).`,
      );
    }
  }

  if (values.JWT_AUDIENCE && values.JWT_AUDIENCE !== "authenticated") {
    errors.push('JWT_AUDIENCE should be "authenticated" for Supabase Auth access tokens.');
  }

  if (errors.length > 0) {
    for (const error of errors) {
      const severity: Severity = error.startsWith("SECURITY VIOLATION") ? "SECURITY" : "CRITICAL";
      logGuardMessage(severity, error);
    }
    throw new Error(`Runtime env guard failed:\n- ${errors.join("\n- ")}`);
  }

  logGuardMessage("INFO", "Runtime env contract is valid.");
}

function main() {
  try {
    assertRuntimeEnv();
    process.stdout.write("Runtime env guard passed.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("runtime-env-guard")) {
  main();
}

export { assertRuntimeEnv };
