CREATE TABLE notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  excerpt         text,
  kind            note_kind NOT NULL DEFAULT 'note',
  status          note_status NOT NULL DEFAULT 'draft',
  parent_id       uuid REFERENCES notes(id) ON DELETE SET NULL,
  cover_media_id  uuid,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  reading_minutes int NOT NULL DEFAULT 1,
  search_vector   tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,   '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body,    '')), 'C')
  ) STORED
);

-- NOTE: no separate unique index on slug — the column's UNIQUE constraint
-- already created one. Adding another would be redundant.

CREATE INDEX notes_status_updated_idx ON notes (status, updated_at DESC);
CREATE INDEX notes_search_idx         ON notes USING gin (search_vector);
CREATE INDEX notes_slug_trgm_idx      ON notes USING gin (slug gin_trgm_ops);
CREATE INDEX notes_parent_idx         ON notes (parent_id);