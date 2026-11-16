-- ============================================================
-- directory: the published-note listing.
-- Backs the "Notes" / "Projects" / "Pages" directory pages.
-- Only published, non-deleted notes. No bodies (don't need them
-- for a list, and shipping every body would bloat the response).
-- ============================================================
CREATE OR REPLACE VIEW directory AS
SELECT
  slug,
  title,
  kind,
  updated_at,
  reading_minutes
FROM notes
WHERE status = 'published'
  AND deleted_at IS NULL
ORDER BY updated_at DESC;

-- ============================================================
-- wiki_stats: home-page counters.
-- One row per kind (note, page, project), each with a count and
-- the total reading minutes across published, non-deleted notes.
-- ============================================================
CREATE OR REPLACE VIEW wiki_stats AS
SELECT
  kind,
  count(*)                        AS note_count,
  coalesce(sum(reading_minutes), 0) AS total_reading_minutes
FROM notes
WHERE status = 'published'
  AND deleted_at IS NULL
GROUP BY kind;

-- ============================================================
-- note_backlinks: the "Linked from" relation, published only.
-- target → source. Read as "target is linked from source."
-- ============================================================
CREATE OR REPLACE VIEW note_backlinks AS
SELECT
  l.target_id,
  tgt.slug  AS target_slug,
  tgt.title AS target_title,
  l.source_id,
  src.slug  AS source_slug,
  src.title AS source_title
FROM note_links l
JOIN notes tgt ON tgt.id = l.target_id
JOIN notes src ON src.id = l.source_id
WHERE tgt.status     = 'published'
  AND tgt.deleted_at IS NULL
  AND src.status     = 'published'
  AND src.deleted_at IS NULL;