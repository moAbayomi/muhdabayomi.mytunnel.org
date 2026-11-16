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