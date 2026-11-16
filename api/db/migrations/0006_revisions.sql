CREATE TABLE note_revisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  excerpt    text,
  status     note_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

-- Backs the "revision history" panel: all versions of one note, newest first.
-- Leftmost prefix on note_id covers "all revisions for a note"; the DESC
-- suffix makes "newest first" a forward scan instead of a sort.
CREATE INDEX note_revisions_note_idx ON note_revisions (note_id, created_at DESC);