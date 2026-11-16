import { Hono } from "hono";
import { sql } from "../db";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SearchResult } from "../contracts";
import type { AppEnv } from "../env";
import { validationErrorHook } from "../validation";

const search = new Hono<AppEnv>();

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Query must be at least 2 characters"),
  lim: z.coerce.number().int().min(1).max(100).default(20),
  off: z.coerce.number().int().min(0).default(0),
});

search.get(
  "/",
  zValidator("query", searchQuerySchema, (result, c) =>
    validationErrorHook(result, c),
  ),
  async (c) => {
    const { q, lim, off } = c.req.valid("query");

    const results = (await sql`
      SELECT * FROM search_notes(${q}, ${lim}, ${off})
    `) as SearchResult[];

    return c.json(results);
  },
);

export default search;
