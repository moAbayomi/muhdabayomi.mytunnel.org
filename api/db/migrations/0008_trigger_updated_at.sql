CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER notes_set_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();