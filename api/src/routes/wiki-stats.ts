import { Hono } from "hono";
import { sql } from "../db";
import type { AppEnv } from "../env";
import { WikiStats } from "../contracts";

const wikiStats = new Hono<AppEnv>();

wikiStats.get("/", async (c) => {
  const stats = await sql`
    SELECT
          kind,
          note_count::int AS note_count,
          total_reading_minutes::int AS total_reading_minutes
        FROM wiki_stats    `;

  return c.json(stats as WikiStats[]);
});

export default wikiStats;
