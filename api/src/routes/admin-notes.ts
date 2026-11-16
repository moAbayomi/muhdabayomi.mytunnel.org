import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import type { AppEnv } from "../env";
import { AppError } from "../errors";
import { validationErrorHook } from "../validation";
import { CreateNoteInput, PatchNoteInput } from "../contracts";
import { mapPgError } from "../lib/pg-errors";

const adminNotes = new Hono<AppEnv>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reject a non-uuid path segment as 404 rather than letting SQL throw 22P02. */
function asUuid(raw: string, what: "note" | "revision"): string {
  if (!UUID_RE.test(raw)) {
    throw new AppError(404, `${what}_not_found`, `No ${what} with id "${raw}"`);
  }
  return raw;
}

/**
 * Same rule as create_note(): ceil(words / 200), minimum 1.
 * PATCH has to recompute this because only create_note() sets it — a body
 * edit would otherwise leave the reading time stale.
 */
function readingMinutes(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 1;
  return Math.max(1, Math.ceil(trimmed.split(/\s+/).length / 200));
}

type NoteRow = Record<string, unknown>;

async function loadNote(id: string, includeDeleted = false): Promise<NoteRow | null> {
  const rows = (await sql`
    SELECT *
    FROM notes
    WHERE id = ${id}::uuid
      AND (${includeDeleted}::boolean OR deleted_at IS NULL)
  `) as NoteRow[];

  return rows[0] ?? null;
}

async function slugForId(id: string): Promise<string> {
  const rows = (await sql`
    SELECT slug FROM notes WHERE id = ${id}::uuid AND deleted_at IS NULL
  `) as { slug: string }[];

  if (!rows[0]) throw new AppError(404, "note_not_found", "No note with that id");
  return rows[0].slug;
}

const listQuery = z.object({
  status: z.enum(["all", "draft", "published", "archived"]).default("all"),
  deleted: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

// ───────────────────────────────────────────────────────────── list / read

adminNotes.get("/", zValidator("query", listQuery, validationErrorHook), async (c) => {
  const { status, deleted } = c.req.valid("query");
  const statusFilter = status === "all" ? null : status;

  const rows = await sql`
    SELECT id, slug, title, kind, status, published_at,
           updated_at, reading_minutes, deleted_at
    FROM notes
    WHERE (${deleted}::boolean OR deleted_at IS NULL)
      AND (${statusFilter}::text IS NULL OR status::text = ${statusFilter}::text)
    ORDER BY updated_at DESC
    LIMIT 200
  `;

  return c.json(rows);
});

adminNotes.get("/:id", async (c) => {
  const note = await loadNote(asUuid(c.req.param("id"), "note"));
  if (!note) throw new AppError(404, "note_not_found", "No note with that id");
  return c.json(note);
});

// ───────────────────────────────────────────────────────────────── create

adminNotes.post(
  "/",
  zValidator("json", CreateNoteInput, validationErrorHook),
  async (c) => {
    const { title, body, kind, parentSlug } = c.req.valid("json");

    try {
      const [note] = await sql`
        SELECT * FROM create_note(
          ${title},
          ${body},
          ${kind}::note_kind,
          ${parentSlug ?? null}
        )
      `;
      return c.json(note, 201);
    } catch (err) {
      mapPgError(err);
    }
  },
);

// ───────────────────────────────────────────────────────────────── update

adminNotes.patch(
  "/:id",
  zValidator("json", PatchNoteInput, validationErrorHook),
  async (c) => {
    const id = asUuid(c.req.param("id"), "note");
    const patch = c.req.valid("json");

    const current = await loadNote(id);
    if (!current) throw new AppError(404, "note_not_found", "No note with that id");

    // Optimistic concurrency. Compare in JS at millisecond precision: Postgres
    // timestamps carry microseconds, JS Dates do not, so a SQL equality check
    // on the round-tripped string is unreliable.
    if (patch.updatedAt) {
      const clientMs = new Date(patch.updatedAt).getTime();
      const currentMs = new Date(current.updated_at as string).getTime();

      if (Number.isNaN(clientMs)) {
        throw new AppError(400, "invalid_updated_at", "updatedAt is not a valid timestamp");
      }
      if (clientMs !== currentMs) {
        throw new AppError(409, "stale_note", "This note changed since you loaded it", {
          current,
        });
      }
    }

    // undefined = "not supplied" (leave as is), null = "clear the parent".
    let parentId: string | null | undefined;
    if (patch.parentSlug !== undefined) {
      if (patch.parentSlug === null) {
        parentId = null;
      } else {
        const parents = (await sql`
          SELECT id FROM notes
          WHERE slug = ${patch.parentSlug} AND deleted_at IS NULL
        `) as { id: string }[];

        if (!parents[0]) {
          throw new AppError(
            422,
            "invalid_parent",
            `No note with slug "${patch.parentSlug}"`,
          );
        }
        parentId = parents[0].id;
      }
    }

    const title = patch.title ?? (current.title as string);
    const body = patch.body ?? (current.body as string);
    const excerpt =
      patch.excerpt !== undefined ? patch.excerpt : (current.excerpt as string | null);
    const kind = patch.kind ?? (current.kind as string);
    const parent =
      parentId !== undefined ? parentId : (current.parent_id as string | null);

    const [updated] = await sql`
      UPDATE notes
      SET title           = ${title},
          body            = ${body},
          excerpt         = ${excerpt},
          kind            = ${kind}::note_kind,
          parent_id       = ${parent}::uuid,
          reading_minutes = ${readingMinutes(body)}
      WHERE id = ${id}::uuid AND deleted_at IS NULL
      RETURNING *
    `;

    if (!updated) throw new AppError(404, "note_not_found", "No note with that id");
    return c.json(updated);
  },
);

// ───────────────────────────────────────────────────────── publish / draft

adminNotes.post("/:id/publish", async (c) => {
  const slug = await slugForId(asUuid(c.req.param("id"), "note"));

  try {
    const [note] = await sql`SELECT * FROM publish_note(${slug})`;
    return c.json(note);
  } catch (err) {
    mapPgError(err);
  }
});

adminNotes.post("/:id/unpublish", async (c) => {
  const slug = await slugForId(asUuid(c.req.param("id"), "note"));

  try {
    const [note] = await sql`SELECT * FROM unpublish_note(${slug})`;
    return c.json(note);
  } catch (err) {
    mapPgError(err);
  }
});

// ──────────────────────────────────────────────────────── delete / restore

adminNotes.delete("/:id", async (c) => {
  const id = asUuid(c.req.param("id"), "note");

  const rows = await sql`
    UPDATE notes SET deleted_at = now()
    WHERE id = ${id}::uuid AND deleted_at IS NULL
    RETURNING id
  `;

  if (rows.length === 0) {
    throw new AppError(404, "note_not_found", "No note with that id");
  }
  return c.body(null, 204);
});

adminNotes.post("/:id/restore", async (c) => {
  const id = asUuid(c.req.param("id"), "note");

  const [note] = await sql`
    UPDATE notes SET deleted_at = NULL
    WHERE id = ${id}::uuid AND deleted_at IS NOT NULL
    RETURNING *
  `;

  if (!note) {
    throw new AppError(404, "note_not_found", "No deleted note with that id");
  }
  return c.json(note);
});

// ────────────────────────────────────────────────────────── links / history

adminNotes.get("/:id/links", async (c) => {
  const id = asUuid(c.req.param("id"), "note");

  const note = await loadNote(id, true);
  if (!note) throw new AppError(404, "note_not_found", "No note with that id");

  const outgoing = await sql`
    SELECT n.id, n.slug, n.title
    FROM note_links l
    JOIN notes n ON n.id = l.target_id
    WHERE l.source_id = ${id}::uuid
    ORDER BY n.title
  `;

  // Targets written as [[slug]] that resolve to no existing note. The
  // reindex trigger drops these silently, so the editor has to surface them.
  // Backslashes are doubled: inside a JS template literal '\[[' would
  // collapse to '[[' and Postgres would reject the regex.
  const unresolved = await sql`
    SELECT DISTINCT m[1] AS slug
    FROM notes n
    JOIN LATERAL regexp_matches(n.body, '\\[\\[([a-z0-9-]+)\\]\\]', 'g') AS m(slug) ON TRUE
    WHERE n.id = ${id}::uuid
      AND NOT EXISTS (SELECT 1 FROM notes t WHERE t.slug = m[1])
    ORDER BY 1
  `;

  return c.json({ outgoing, unresolved });
});

adminNotes.get("/:id/revisions", async (c) => {
  const id = asUuid(c.req.param("id"), "note");

  const note = await loadNote(id, true);
  if (!note) throw new AppError(404, "note_not_found", "No note with that id");

  const rows = await sql`
    SELECT id, title, status, created_at, left(body, 240) AS body_preview
    FROM note_revisions
    WHERE note_id = ${id}::uuid
    ORDER BY created_at DESC
  `;

  return c.json(rows);
});

adminNotes.post("/:id/revisions/:revId/restore", async (c) => {
  const id = asUuid(c.req.param("id"), "note");
  const revId = asUuid(c.req.param("revId"), "revision");

  const revisions = (await sql`
    SELECT id FROM note_revisions
    WHERE id = ${revId}::uuid AND note_id = ${id}::uuid
  `) as { id: string }[];

  if (!revisions[0]) {
    throw new AppError(404, "revision_not_found", "No such revision for this note");
  }

  try {
    const [note] = await sql`SELECT * FROM restore_revision(${revId})`;
    return c.json(note);
  } catch (err) {
    mapPgError(err);
  }
});

export default adminNotes;
