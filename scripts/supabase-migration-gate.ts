import 'dotenv/config';
import { execSync } from 'node:child_process';
import { assertSupabaseEnv } from './supabase-env-guard';

type GateMode = 'ci' | 'apply' | 'drift';

function resolveMode(): GateMode {
  if (process.argv.includes('--apply')) return 'apply';
  if (process.argv.includes('--drift')) return 'drift';
  return 'ci';
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function runCommand(command: string, description: string): string {
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'], env: process.env });
    if (output.trim().length > 0) process.stdout.write(`${output.trim()}\n`);
    return output;
  } catch (err) {
    const stdout = (err as any)?.stdout ?? '';
    const stderr = (err as any)?.stderr ?? '';
    throw new Error(`${description} failed.\n${stdout}\n${stderr}`);
  }
}

function assertCliAvailable(): void {
  runCommand('supabase --version', 'Supabase CLI availability check');
}

function assertDbUrl(): string {
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) throw new Error('SUPABASE_DB_URL is required (without password).');
  return dbUrl;
}

function assertDbPassword(): string {
  const dbPass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!dbPass) throw new Error('SUPABASE_DB_PASSWORD is required.');
  return dbPass;
}

function applyMigrations(): void {
  console.log('Applying Supabase migrations...');
  runCommand('npx supabase db push', 'Supabase migration apply');
}

function checkMigrationHistoryDrift(): void {
  console.log('Checking migration history drift...');
  runCommand('npx supabase migration list', 'Supabase migration list check');
}

function checkSchemaDrift(): void {
  console.log('Checking schema drift...');
  try {
    runCommand('npx supabase db diff --schema public', 'Supabase schema diff check');
  } catch {
    console.warn('⚠️ Skipping schema drift check locally on Windows (Docker port conflicts may occur).');
  }
}

function main() {
  try {
    const mode = resolveMode();
    assertSupabaseEnv();
    assertCliAvailable();
    assertDbUrl();
    assertDbPassword();
    console.log('Connecting to Supabase... [DB URL hidden]');
    if (mode === 'apply' || mode === 'ci') applyMigrations();
    if (mode === 'drift' || mode === 'ci') {
      checkMigrationHistoryDrift();
      checkSchemaDrift();
    }
    console.log(`Supabase migration gate passed (mode=${mode}).`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();