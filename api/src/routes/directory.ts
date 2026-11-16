import { Hono } from "hono";
import { sql } from "../db";
import type { AppEnv } from "../env";
import { DirectoryEntry } from "../contracts";

const directory = new Hono<AppEnv>();

directory.get("/", async (c) => {
  const rows = await sql`
    SELECT slug, title, kind, updated_at, reading_minutes
    FROM directory
    `;

  return c.json(rows as DirectoryEntry[]);
});

export default directory