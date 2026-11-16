-- publish_note: draft → published.
-- Raises if the body is empty/whitespace; sets published_at only on first publish.
CREATE OR REPLACE FUNCTION publish_note(p_slug text) RETURNS notes
LANGUAGE plpgsql AS $$
DECLARE
  v_note notes;
BEGIN
  -- 1. Load the note (soft-deleted rows are treated as not-found)
  SELECT * INTO v_note
  FROM notes
  WHERE slug = p_slug AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note with slug "%" not found', p_slug;
  END IF;

  -- 2. Refuse to publish an empty body
  IF btrim(v_note.body) = '' THEN
    RAISE EXCEPTION 'Cannot publish note "%": body is empty', p_slug;
  END IF;

  -- 3. Publish; published_at stays at its first value if already set.
  --    The set_updated_at trigger bumps updated_at;
  --    the capture_revision trigger logs the OLD status='draft' row.
  UPDATE notes
  SET status       = 'published',
      published_at = COALESCE(published_at, now())
  WHERE id = v_note.id
  RETURNING * INTO v_note;

  RETURN v_note;
END $$;

-- unpublish_note: published → draft.
-- Does not clear published_at — that column records "first ever published at",
-- which is useful history that survives unpublish / re-publish cycles.
CREATE OR REPLACE FUNCTION unpublish_note(p_slug text) RETURNS notes
LANGUAGE plpgsql AS $$
DECLARE
  v_note notes;
BEGIN
  UPDATE notes
  SET status = 'draft'
  WHERE slug = p_slug AND deleted_at IS NULL
  RETURNING * INTO v_note;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note with slug "%" not found', p_slug;
  END IF;

  RETURN v_note;
END $$;