-- api/db/migrations/0018_fn_create_note_reserved.sql
--
-- C2 fix: the reserved-slug list in 0011 missed the slugs that collide
-- with static Astro routes. A note titled "Directory" got the valid slug
-- "directory" and was then unreachable, because /directory is a real page
-- and Astro resolves static routes before [slug].
--
-- CREATE OR REPLACE (rather than editing 0011) because schema_migrations
-- tracks applied versions by filename: an edited 0011 would never re-run.

CREATE OR REPLACE FUNCTION create_note(
  p_title       text,
  p_body        text,
  p_kind        note_kind DEFAULT 'note',
  p_parent_slug text      DEFAULT NULL
) RETURNS notes
LANGUAGE plpgsql AS $$
DECLARE
  v_base_slug     text;
  v_slug          text;
  v_counter       int := 0;
  v_parent_id     uuid;
  v_reading_mins  int;
  v_note          notes;
  v_reserved      text[] := ARRAY[
    -- editor / system routes
    'new', 'edit', 'delete', 'admin', 'api',
    'auth', 'login', 'logout', 'signup',
    'search', 'settings',
    -- static routes emitted by the site
    'index', 'directory', '404',
    'rss', 'rss-xml',
    'sitemap', 'sitemap-index', 'sitemap-index-xml'
  ];
BEGIN
  v_base_slug := slugify(p_title);

  IF v_base_slug = ANY(v_reserved) OR left(v_base_slug, 1) = '_' THEN
    RAISE EXCEPTION 'Slug "%" is reserved and cannot be used', v_base_slug;
  END IF;

  IF p_parent_slug IS NOT NULL THEN
    SELECT id INTO v_parent_id FROM notes WHERE slug = p_parent_slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent note with slug "%" does not exist', p_parent_slug;
    END IF;
  END IF;

  v_reading_mins := greatest(1, ceil(
    coalesce(
      array_length(
        regexp_split_to_array(trim(both from p_body), E'\\s+'),
        1
      ),
      0
    )::numeric / 200
  )::int);

  LOOP
    v_slug := v_base_slug
      || CASE WHEN v_counter > 0 THEN '-' || (v_counter + 1) ELSE '' END;

    BEGIN
      INSERT INTO notes (slug, title, body, kind, parent_id, reading_minutes)
      VALUES (v_slug, p_title, p_body, p_kind, v_parent_id, v_reading_mins)
      RETURNING * INTO v_note;

      RETURN v_note;

    EXCEPTION WHEN unique_violation THEN
      v_counter := v_counter + 1;
      IF v_counter >= 100 THEN
        RAISE EXCEPTION 'Could not generate unique slug for title "%" (100 attempts)', p_title;
      END IF;
    END;
  END LOOP;
END $$;
