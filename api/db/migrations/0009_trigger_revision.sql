CREATE OR REPLACE FUNCTION capture_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.title, OLD.body, OLD.excerpt, OLD.status)
     IS DISTINCT FROM (NEW.title, NEW.body, NEW.excerpt, NEW.status) THEN
    INSERT INTO note_revisions (note_id, title, body, excerpt, status)
    VALUES (OLD.id, OLD.title, OLD.body, OLD.excerpt, OLD.status);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER notes_capture_revision
AFTER UPDATE OF title, body, excerpt, status ON notes
FOR EACH ROW
EXECUTE FUNCTION capture_revision();