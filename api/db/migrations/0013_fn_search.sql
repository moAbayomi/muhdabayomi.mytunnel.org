CREATE OR REPLACE FUNCTION search_notes(
  q   text,
  lim int DEFAULT 20,
  off int DEFAULT 0
) RETURNS TABLE (
  id              uuid,
  slug            text,
  title           text,
  excerpt         text,
  kind            note_kind,
  updated_at      timestamptz,
  rank            real,
  headline        text
)
LANGUAGE sql STABLE AS $$
  WITH parsed AS (
    SELECT websearch_to_tsquery('english', q) AS query
  )
  SELECT
    n.id,
    n.slug,
    n.title,
    n.excerpt,
    n.kind,
    n.updated_at,
    ts_rank_cd(n.search_vector, p.query, 32) AS rank,
    ts_headline(
      'english',
      coalesce(n.excerpt, n.body),
      p.query,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=15, ShortWord=3'
    ) AS headline
  FROM notes n, parsed p
  WHERE n.status = 'published'
    AND n.deleted_at IS NULL
    AND n.search_vector @@ p.query
  ORDER BY rank DESC, n.updated_at DESC
  LIMIT lim
  OFFSET off;
$$;