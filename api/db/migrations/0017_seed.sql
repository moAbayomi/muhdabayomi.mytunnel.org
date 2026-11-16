-- Example content for local development. Creates 10 notes:
--   4 pages   (about, now, projects, uses)
--   1 project (daydrops — child of projects)
--   4 notes   (second-brain, thinking, reading-list, colophon)
--   1 draft   (wip-draft-ideas — stays unpublished)
--
-- The graph is non-trivial on purpose:
--   - second-brain is the hub: linked from 5 published notes
--   - second-brain links out to [[about]], [[now]], [[thinking]]
--   - about and now reference each other
--   - daydrops is both a child of projects AND linked from now
--   - the draft links out, but never appears as a backlink source
--     (note_backlinks joins only published sources)
--
-- Re-running this file is a no-op: the guard below skips a non-empty
-- notes table, so `psql -f` is safe after the first run.
--
-- Wrapped in a DO block so intermediate slugs live in local variables
-- (needed for the daydrops parent reference). The link graph is rebuilt
-- explicitly at the end, after every note exists, because the insert-time
-- trigger silently drops edges to notes defined later in the file.

DO $$
DECLARE
  s_about    text;
  s_now      text;
  s_projects text;
  s_uses     text;
  s_daydrops text;
  s_second   text;
  s_think    text;
  s_reading  text;
  s_colophon text;
  v_notes    int;
  v_links    int;
  v_revs     int;
BEGIN
  IF EXISTS (SELECT 1 FROM notes) THEN
    RAISE NOTICE 'notes table is not empty; skipping seed';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------- pages
  SELECT slug INTO s_about FROM create_note(
    'About',
    $body$I'm a developer building things on the web. I keep a [[now]] page,
and I write about [[second-brain]], [[thinking]], and the [[projects]]
I'm working on.

This site is a wiki — every note is a note. See [[colophon]] for
how it's built.$body$,
    'page'
  );

  SELECT slug INTO s_now FROM create_note(
    'Now',
    $body$What I'm doing right now:

- Building [[daydrops]]
- Rethinking my [[second-brain]] setup
- Reading more fiction

Inspired by the [[about]] page and the /now movement.$body$,
    'page'
  );

  SELECT slug INTO s_projects FROM create_note(
    'Projects',
    $body$A list of things I'm building:

- [[daydrops]] — a small daily-noting tool

More to come. See also [[about]].$body$,
    'page'
  );

  SELECT slug INTO s_uses FROM create_note(
    'Uses',
    $body$What I use to do the work:

- Editor: Zed
- Terminal: Ghostty
- Language: TypeScript, occasionally Go
- Database: Postgres, always

See also: [[about]]$body$,
    'page'
  );

  -- -------------------------------------------------------------- project
  -- Created after its parent page so the parent slug resolves.
  SELECT slug INTO s_daydrops FROM create_note(
    'Daydrops',
    $body$Daydrops is a tiny tool for capturing one thought per day.
It's built on Cloudflare Workers and Postgres.

Related: [[second-brain]], [[projects]]$body$,
    'project',
    s_projects
  );

  -- ---------------------------------------------------------------- notes
  SELECT slug INTO s_second FROM create_note(
    'Second Brain',
    $body$A second brain is a system for externalising thought so your head
can be for thinking, not for storage.

The core loop is: capture, refine, connect. You capture quickly,
refine over time, and connect notes to each other. Connection is
what turns a pile of notes into a brain.

The smallest possible SQL that could power a wiki's link graph:

```sql
select n.slug, t.slug as target
from notes n
join note_links l on l.source_id = n.id
join notes t on t.id = l.target_id
where n.status = 'published';
```

Related: [[about]], [[now]], [[thinking]]$body$,
    'note'
  );

  SELECT slug INTO s_think FROM create_note(
    'Thinking',
    $body$Thinking is mostly about making room for it. I try to write before
I think, so the writing does the thinking.

I keep coming back to [[second-brain]] as the mechanism for this,
and [[reading-list]] as the raw material.$body$,
    'note'
  );

  SELECT slug INTO s_reading FROM create_note(
    'Reading List',
    $body$Books I've read recently and what stuck:

- Thinking in Systems — Donella Meadows
- The Art of Doing Science and Engineering — Richard Hamming
- Metaphors We Live By — Lakoff & Johnson

Cross-pollinates with [[thinking]].$body$,
    'note'
  );

  SELECT slug INTO s_colophon FROM create_note(
    'Colophon',
    $body$This site is a wiki. Notes are stored in Postgres, links use
double brackets, and every edge is a row in a join table.

Stack: Hono on Cloudflare Workers, Postgres on Neon,
Astro on Cloudflare Pages.

See also: [[about]], [[second-brain]]$body$,
    'note'
  );

  -- ---------------------------------------------------------------- draft
  PERFORM create_note(
    'WIP: draft ideas',
    $body$Ideas I'm not ready to publish:

- A [[second-brain]] explainer that actually covers Zettelkasten
- A [[now]] page for the archive
- A proper colophon with build steps

Not ready yet.$body$,
    'note'
  );

  -- ------------------------------------------- publish all but the draft
  PERFORM publish_note(s_about);
  PERFORM publish_note(s_now);
  PERFORM publish_note(s_projects);
  PERFORM publish_note(s_uses);
  PERFORM publish_note(s_daydrops);
  PERFORM publish_note(s_second);
  PERFORM publish_note(s_think);
  PERFORM publish_note(s_reading);
  PERFORM publish_note(s_colophon);
  -- 'wip-draft-ideas' stays draft on purpose.

  -- --------------------------------------------- rebuild links + backdate
  -- Triggers are disabled for this block for two reasons:
  --   1. The link rebuild is done explicitly, once, rather than by
  --      UPDATE ... SET body = body (which would bump every updated_at).
  --   2. The date backfill must survive set_updated_at, which unconditionally
  --      overwrites NEW.updated_at.
  -- DDL is transactional, so if anything below raises, the ALTERs roll back too.
  ALTER TABLE notes DISABLE TRIGGER USER;

  DELETE FROM note_links;

  INSERT INTO note_links (source_id, target_id)
  SELECT DISTINCT n.id, t.id
  FROM notes n
  JOIN LATERAL regexp_matches(n.body, '\[\[([a-z0-9-]+)\]\]', 'g') AS m(slug) ON TRUE
  JOIN notes t ON t.slug = m[1]
  WHERE t.id <> n.id
  ON CONFLICT DO NOTHING;

  -- Staggered dates so `directory` (ORDER BY updated_at DESC) and the
  -- home page's "recently updated" list look like a life, not a batch job.
  UPDATE notes n
  SET created_at   = now() - v.age - interval '30 days',
      published_at = CASE
                       WHEN n.status = 'published'
                       THEN now() - v.age - interval '29 days'
                       ELSE NULL
                     END,
      updated_at   = now() - v.age
  FROM (VALUES
    ('now',          interval '0 days'),
    ('second-brain', interval '1 day'),
    ('thinking',     interval '3 days'),
    ('about',        interval '5 days'),
    ('reading-list', interval '8 days'),
    ('daydrops',     interval '10 days'),
    ('projects',     interval '14 days'),
    ('uses',         interval '21 days'),
    ('colophon',     interval '30 days')
  ) AS v(slug, age)
  WHERE n.slug = v.slug;

  ALTER TABLE notes ENABLE TRIGGER USER;

  SELECT count(*) INTO v_notes FROM notes;
  SELECT count(*) INTO v_links FROM note_links;
  SELECT count(*) INTO v_revs  FROM note_revisions;

  RAISE NOTICE 'seed complete: % notes, % links, % revisions', v_notes, v_links, v_revs;
END $$;
