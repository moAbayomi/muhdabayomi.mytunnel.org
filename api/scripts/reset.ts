import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/blog_dev';
const LOCK_ID = 4242; // same as migrate.ts — shared mutex

// Safety: refuse to reset anything that isn't clearly local.
// A reset on Neon would destroy real data in ~200ms.
const isLocal =
  DATABASE_URL.includes('localhost') ||
  DATABASE_URL.includes('127.0.0.1');
if (!isLocal && process.env.ALLOW_REMOTE_RESET !== '1') {
  console.error(
    `Refusing to reset non-local database: ${DATABASE_URL}\n` +
    `If you're absolutely sure, set ALLOW_REMOTE_RESET=1.`
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  await sql`SELECT pg_advisory_lock(${LOCK_ID})`;
  try {
    console.log(`Resetting ${DATABASE_URL} ...`);
    await sql`DROP SCHEMA IF EXISTS public CASCADE`;
    await sql`CREATE SCHEMA public`;
    console.log('  ✔ public schema dropped and recreated');
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});