CREATE OR REPLACE FUNCTION restore_revision(p_rev_id uuid) RETURNS notes
LANGUAGE plpgsql AS $$
DECLARE
  v_rev  note_revisions;
  v_note notes;
BEGIN
  -- 1. Load the revision to restore
  SELECT * INTO v_rev FROM note_revisions WHERE id = p_rev_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision % not found', p_rev_id;
  END IF;

  -- 2. Load the current note (refuse soft-deleted)
  SELECT * INTO v_note
  FROM notes
  WHERE id = v_rev.note_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note % not found or soft-deleted', v_rev.note_id;
  END IF;

  -- 3. Write the snapshot back. The capture_revision trigger will save the
  --    CURRENT state as a new revision — so the restore is itself undoable.
  UPDATE notes
  SET title   = v_rev.title,
      body    = v_rev.body,
      excerpt = v_rev.excerpt,
      status  = v_rev.status
  WHERE id = v_rev.note_id
  RETURNING * INTO v_note;

  RETURN v_note;
END $$;