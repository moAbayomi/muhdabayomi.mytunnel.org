# Notes, kinds and series

Every public page on the site is **one row in the `notes` table**. There is no
separate table for pages or projects; `kind` is a label on the row.

| You want | `kind` | URL |
|---|---|---|
| About / Now / Uses | `page` | `/about` |
| A thing you are building | `project` | `/daydrops` |
| A story, a film review, a random note | `note` | `/heat` |
| A hub that groups entries | `page` or `project` | `/films` |

`kind` changes two things only:

1. the label in the page's metadata line (`page`, `project`, `note`), and
2. which counter it increments on the home page (`4 notes · 4 pages · 1 project`).

It does not change the layout, the URL shape, or the renderer. Every note page is
the same template: title, metadata, body, backlinks, children.

## Series

A series is a parent note plus child notes.

- **Films** — create a page `films` (`kind = page`), then each film is a note with
  `parent = films`.
- **Stories** — same, with a `stories` hub.

The parent page renders **in this section** with every child; each child renders
**part of Films** at the top.

`parent_id` is a single foreign key: **one parent per note**. If a note belongs to
two collections (e.g. *Films* and *2026*), use `[[links]]` instead: link the film
to `[[films]]` and `[[2026]]`, and the backlinks on those hub pages give you
many-to-many. That is why tags were dropped.

## Limits worth knowing

- **Children sort alphabetically** (`ORDER BY c.title` in `note_page()`). If order
  matters — episode 1, 2, 10 — add a `position` column or order by `created_at`.
- **Every published note appears in `/directory`**, children included. A large
  series makes the directory long. Filtering to top-level notes
  (`parent_id IS NULL`) is a small change if you want it.
- **URLs stay flat.** A child is `/heat`, not `/films/heat`. Hierarchy is metadata,
  not path nesting.

## Creating pages, projects and series

Use `/admin`. The editor now has two controls:

- **kind** — `note`, `page`, or `project`
- **parent** — any note except the one you are editing (so a self-parent is
  impossible)

To make a series: create the hub first, then create each entry and pick the hub as
its parent.

## Cleaning the test data

The rows in your dev database are disposable. To empty the notes but keep the
schema, functions and triggers:

```sql
DELETE FROM notes;   -- cascades to note_links and note_revisions
```

The seed will not re-run: `0017_seed.sql` is already recorded in
`schema_migrations`. `pnpm --filter api db:reset` is the harsher option — it drops
the whole schema and reinstalls it, **including the seed notes**.
