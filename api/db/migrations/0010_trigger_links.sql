CREATE OR REPLACE FUNCTION reindex_note_links() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM note_links WHERE source_id = NEW.id;

  INSERT INTO note_links (source_id, target_id)
  SELECT DISTINCT NEW.id, n.id
  FROM regexp_matches(NEW.body, '\[\[([a-z0-9-]+)\]\]', 'g') AS m(slug)
  JOIN notes n ON n.slug = m[1]
  WHERE n.id <> NEW.id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

CREATE TRIGGER notes_reindex_links
AFTER INSERT OR UPDATE OF body ON notes
FOR EACH ROW
EXECUTE FUNCTION reindex_note_links();