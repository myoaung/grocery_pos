import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertRuntimeEnv } from "../scripts/runtime-env-guard";

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_ENV = { ...process.env };
let activeTempDir: string | null = null;

function writeEnvFixture(lines: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "runtime-env-guard-"));
  writeFileSync(path.join(dir, ".env"), "", "utf8");
  writeFileSync(path.join(dir, ".env.local"), `${lines.join("\n")}\n`, "utf8");
  activeTempDir = dir;
  return dir;
}

function validRuntimeEnvLines(): string[] {
  const supabaseUrl = "https://tenant-ref.supabase.co";
  return [
    `SUPABASE_URL=${supabaseUrl}`,
    "SUPABASE_ANON_KEY=sb-anon-test-key",
    "SUPABASE_SERVICE_ROLE_KEY=sb-service-role-test-key",
    `JWT_ISSUER=${supabaseUrl}/auth/v1`,
    `JWKS_URI=${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    "JWT_AUDIENCE=authenticated",
  ];
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  process.env = { ...ORIGINAL_ENV };
  if (activeTempDir) {
    rmSync(activeTempDir, { recursive: true, force: true });
    activeTempDir = null;
  }
});

describe("runtime env guard", () => {
  it("fails when SUPABASE_URL is missing", () => {
    const dir = writeEnvFixture(validRuntimeEnvLines().filter((line) => !line.startsWith("SUPABASE_URL=")));

    process.chdir(dir);

    expect(() => assertRuntimeEnv()).toThrow(/SUPABASE_URL is missing or still set to a placeholder value/);
  });

  it("fails when JWKS_URI does not match the Supabase project", () => {
    const dir = writeEnvFixture(
      validRuntimeEnvLines().map((line) =>
        line.startsWith("JWKS_URI=")
          ? "JWKS_URI=https://tenant-ref.supabase.co/auth/v1/.well-known/not-jwks.json"
          : line,
      ),
    );

    process.chdir(dir);

    expect(() => assertRuntimeEnv()).toThrow(/JWKS_URI must match the Supabase Auth JWKS endpoint/);
  });

  it("fails when JWT_AUDIENCE is not authenticated", () => {
    const dir = writeEnvFixture(
      validRuntimeEnvLines().map((line) => (line.startsWith("JWT_AUDIENCE=") ? "JWT_AUDIENCE=grocery-pos" : line)),
    );

    process.chdir(dir);

    expect(() => assertRuntimeEnv()).toThrow(/JWT_AUDIENCE should be "authenticated"/);
  });

  it("passes when the runtime env is valid", () => {
    const dir = writeEnvFixture(validRuntimeEnvLines());

    process.chdir(dir);

    expect(() => assertRuntimeEnv()).not.toThrow();
  });

  it("fails when the service role key is exposed to the client namespace", () => {
    const dir = writeEnvFixture(validRuntimeEnvLines());

    process.chdir(dir);
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = "leaked";

    expect(() => assertRuntimeEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must not be defined/);
  });
});
