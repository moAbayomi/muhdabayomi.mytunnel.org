import { Hono } from "hono";
import { sql } from "../db";
import type { AppEnv } from "../env";
import { WikiStats } from "../contracts";

const wikiStats = new Hono<AppEnv>();

wikiStats.get("/", async (c) => {
  const stats = await sql`
      SELECT * FROM wiki_stats
    `;

  return c.json(stats as WikiStats[]);
});

export default wikiStats;
