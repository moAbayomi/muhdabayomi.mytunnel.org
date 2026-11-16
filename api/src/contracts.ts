import { z } from 'zod';

export const NoteKind = z.enum(['note', 'page', 'project']);
export const NoteStatus = z.enum(['draft', 'published', 'archived']);

export const NoteSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  kind: NoteKind,
  excerpt: z.string().nullable(),
  reading_minutes: z.number().int().positive(),
  updated_at: z.string().datetime(),  // or z.coerce.date()
});

export const Note = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  body: z.string(),
  excerpt: z.string().nullable(),
  kind: NoteKind,
  status: NoteStatus,
  parent_id: z.string().uuid().nullable(),
  cover_media_id: z.string().uuid().nullable(),
  published_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
  reading_minutes: z.number().int().positive(),
  // search_vector — omit; not serializable meaningfully / app doesn't need it
});

export const DirectoryEntry = z.object({
  slug: z.string(),
  title: z.string(),
  kind: NoteKind,
  updated_at: z.string().datetime(),
  reading_minutes: z.number().int().positive(),
});

export const WikiStats = z.object({
  kind: NoteKind,
  note_count: z.number().int().nonnegative(),
  total_reading_minutes: z.number().int().nonnegative(),
});

export const NoteLink = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
});

export const NoteChild = NoteLink.extend({
  kind: NoteKind,
});

export const NotePage = z.object({
  note: Note,
  backlinks: z.array(NoteLink),
  outgoing: z.array(NoteLink),
  children: z.array(NoteChild),
});

export const SearchResult = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  kind: NoteKind,
  updated_at: z.string().datetime(),
  rank: z.number(),
  headline: z.string(),
});

// Inferred types — use these everywhere
export type Note = z.infer<typeof Note>;
export type NoteSummary = z.infer<typeof NoteSummary>;
export type DirectoryEntry = z.infer<typeof DirectoryEntry>;
export type WikiStats = z.infer<typeof WikiStats>;
export type NotePage = z.infer<typeof NotePage>;
export type SearchResult = z.infer<typeof SearchResult>;

// ─── admin ───────────────────────────────────────────────────────────

export const AdminNoteSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  kind: NoteKind,
  status: NoteStatus,
  published_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime(),
  reading_minutes: z.number().int().positive(),
  deleted_at: z.string().datetime().nullable(),
});

export const CreateNoteInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().default(""),
  kind: NoteKind.default("note"),
  parentSlug: z.string().trim().min(1).nullable().optional(),
});

export const PatchNoteInput = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().optional(),
    excerpt: z.string().nullable().optional(),
    kind: NoteKind.optional(),
    parentSlug: z.string().trim().min(1).nullable().optional(),
    // Optimistic concurrency token: the updated_at the client last saw.
    updatedAt: z.string().datetime().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.body !== undefined ||
      v.excerpt !== undefined ||
      v.kind !== undefined ||
      v.parentSlug !== undefined,
    { message: "No fields to update" },
  );

export const RevisionSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: NoteStatus,
  created_at: z.string().datetime(),
  body_preview: z.string(),
});

export const NoteLinksReport = z.object({
  outgoing: z.array(NoteLink),
  unresolved: z.array(z.object({ slug: z.string() })),
});

export type AdminNoteSummary = z.infer<typeof AdminNoteSummary>;
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;
export type PatchNoteInput = z.infer<typeof PatchNoteInput>;

// ─── media ───────────────────────────────────────────────────────────

export const Media = z.object({
  id: z.string().uuid(),
  r2_key: z.string(),
  url: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  alt: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type Media = z.infer<typeof Media>;