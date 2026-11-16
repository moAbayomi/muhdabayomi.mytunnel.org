-- STABLE, not IMMUTABLE: it calls unaccent(), which is only STABLE.
CREATE OR REPLACE FUNCTION slugify(input text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE out text;
BEGIN
  out := lower(unaccent(coalesce(input,'')));
  out := regexp_replace(out, '[^a-z0-9]+', '-', 'g');
  out := regexp_replace(out, '(^-+|-+$)', '', 'g');
  IF out = '' THEN out := 'untitled'; END IF;
  RETURN left(out, 96);
END $$;