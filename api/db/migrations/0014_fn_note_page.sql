CREATE OR REPLACE FUNCTION note_page(p_slug text)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'note', to_jsonb(n),
    'backlinks', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',    src.id,
        'slug',  src.slug,
        'title', src.title
      ) ORDER BY src.title)
      FROM note_links l
      JOIN notes src ON src.id = l.source_id
      WHERE l.target_id = n.id
        AND src.status    = 'published'
        AND src.deleted_at IS NULL
    ), '[]'::jsonb),
    'outgoing', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',    tgt.id,
        'slug',  tgt.slug,
        'title', tgt.title
      ) ORDER BY tgt.title)
      FROM note_links l
      JOIN notes tgt ON tgt.id = l.target_id
      WHERE l.source_id = n.id
        AND tgt.deleted_at IS NULL
    ), '[]'::jsonb),
    'children', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',   c.id,
        'slug', c.slug,
        'title', c.title,
        'kind', c.kind
      ) ORDER BY c.title)
      FROM notes c
      WHERE c.parent_id = n.id
        AND c.status    = 'published'
        AND c.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  FROM notes n
  WHERE n.slug = p_slug
    AND n.deleted_at IS NULL;
$$;