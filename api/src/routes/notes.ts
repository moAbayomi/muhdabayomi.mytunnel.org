import { Hono } from "hono";
import { sql } from "../db";
import { zValidator } from "@hono/zod-validator";
import { validationErrorHook } from "../validation";
import { AppError } from "../errors";
import { NotePage, NoteKind, NoteStatus } from "../contracts";
import type { AppEnv } from "../env";
import z from "zod";
import { decodeCursor, encodeCursor } from "../pagination";

const notes = new Hono<AppEnv>();

const listNotesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: NoteKind.optional(),
  status: NoteStatus.optional(),
});

notes.get(
  "/",
  zValidator("query", listNotesQuerySchema, validationErrorHook),
  async (c) => {
    const { cursor, limit, kind, status } = c.req.valid("query");

    let decoded = null;
    if (cursor) {
      decoded = decodeCursor(cursor);
      if (!decoded) {
        throw new AppError(400, "invalid_cursor", "Cursor is malformed");
      }
    }

    // Fetch limit + 1 so we know whether there's a next page without a COUNT.
    const rows = (await sql`
      SELECT id, slug, title, kind, status, created_at, updated_at
      FROM notes
      WHERE deleted_at IS NULL
        ${decoded ? sql`AND (updated_at, id) < (${decoded.u}::timestamptz, ${decoded.i}::uuid)` : sql``}
        ${kind ? sql`AND kind   = ${kind}` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
      ORDER BY updated_at DESC, id DESC
      LIMIT ${limit + 1}
    `) as Array<{
      id: string;
      slug: string;
      title: string;
      kind: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.updated_at, last.id) : null;

    return c.json({ items: page, nextCursor });
  },
);

notes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const [row] = (await sql`
    SELECT note_page(${slug}) AS page
  `) as { page: NotePage | null }[];

  if (row.page === null) {
    throw new AppError(404, "note_not_found", `No note with slug "${slug}"`);
  }

  // Public API: drafts must not be reachable by URL. note_page() doesn't
  // filter by status (the editor preview in Phase 4+ needs drafts), so the
  // public/private decision lives here.
  if (row.page.note.status !== "published") {
    throw new AppError(404, "note_not_found", `No note with slug "${slug}"`);
  }

  return c.json(row.page);
});

export default notes;
