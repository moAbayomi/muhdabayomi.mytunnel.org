-- api/db/migrations/0019_directory_alphabetical.sql
--
-- C2 fix: `directory` ordered by updated_at DESC, which makes it a feed,
-- not a directory. The wiki model (and plan.md §Phase 8) wants the
-- directory alphabetical; recency belongs in the home page's
-- "recently updated" list, which reads `notes` directly.
--
-- If you ever prefer recency here, this is a one-line revert:
--   ORDER BY updated_at DESC

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
ORDER BY title;
