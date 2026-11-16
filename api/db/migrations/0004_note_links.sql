CREATE TABLE note_links (
  source_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, target_id)
);

-- Backlinks: "which notes point at me?" — the query behind the "Linked from"
-- section on every note page. Without this index that lookup is a full scan.
CREATE INDEX note_links_target_idx ON note_links (target_id);