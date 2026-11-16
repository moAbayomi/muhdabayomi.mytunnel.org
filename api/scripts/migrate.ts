import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/blog_dev';
const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'db', 'migrations');
const LOCK_ID = 4242; // arbitrary; just needs to be the same for every run

const sql = postgres(DATABASE_URL, { onnotice: () => {} });

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function getApplied(): Promise<Set<string>> {
  const rows = await sql<{ version: string }[]>`
    SELECT version FROM schema_migrations
  `;
  return new Set(rows.map((r) => r.version));
}

async function applyMigration(file: string) {
  const version = file.replace(/\.sql$/, '');
  const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
  });

  console.log(`  ✔ ${version}`);
}

async function main() {
  await sql`SELECT pg_advisory_lock(${LOCK_ID})`;
  try {
    await ensureMigrationsTable();
    const applied = await getApplied();

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/, '')));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Applying ${pending.length} migration(s):`);
    for (const file of pending) await applyMigration(file);
    console.log('Done.');
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});