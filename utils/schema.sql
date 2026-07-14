CREATE TABLE IF NOT EXISTS entries (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source_note_id TEXT UNIQUE NOT NULL,
	slug TEXT UNIQUE NOT NULL,
	title TEXT NOT NULL,
	content TEXT NOT NULL,
	photo_url TEXT,
	note_modified INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at DESC);