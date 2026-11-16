// api/src/routes/health.ts
import { Hono } from 'hono';
import { sql } from '../db';
import type { AppEnv } from '../env';

const health = new Hono<AppEnv>();

health.get('/', (c) =>
  c.json({ ok: true, service: 'blog-api', version: '0.1.0' })
);

health.get('/db', async (c) => {
  const t0 = Date.now();
  try {
    const [row] = await sql`
      SELECT version FROM schema_migrations
      ORDER BY version DESC LIMIT 1
    `;
    return c.json({
      ok: true,
      latency_ms: Date.now() - t0,
      schema_version: row?.version ?? null,
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        latency_ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      },
      503
    );
  }
});

export default health;