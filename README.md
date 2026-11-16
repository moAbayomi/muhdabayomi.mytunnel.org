# muhdabayomi.mytunnel.org

A personal wiki. Notes live in Postgres, link to each other with `[[double brackets]]`,
and are published as a static site. There is no feed and no "posted on" — every public
page is a note, the directory is alphabetical, and each note shows what links to it.

The model is [Patrik Arvidsson's site](https://patrikarvidsson.com/): a private
knowledge base with a `published` filter and a static build on top.

**Status: Phase 3 of 13.** The API serves public reads; the web app is still the Astro
skeleton. See [`plan.md`](./plan.md) for the remaining phases.

---

## How it fits together

```
browser ──▶ Cloudflare Pages (static Astro)  ──┐
                                               │ build-time fetch
phone PWA ──▶ Cloudflare Worker (Hono, TS) ────┘
                        │
                        ├──▶ Postgres (Neon)   ← notes, links, search
                        └──▶ Cloudflare R2     ← images
```

Four moving parts, all free tier, and **nothing running 24/7**. That last part is the
point: there is no server to keep alive, so "the site is down" stops being a category of
failure. `docs/decisions.md` has the longer version, including the AWS post-mortem.

### Why the links matter

Writing `[[another-slug]]` in a note creates a row in `note_links`; a trigger rebuilds
those edges on every save. That table is the only structure the wiki has:

- the note page renders **Linked from** from `note_links` (index on `target_id`)
- `note_page(slug)` returns the note, its backlinks, its outgoing links and its children
  in one round trip
- unresolved links are dropped silently, so the editor has to warn about typos

Without the links this is just an unordered blog. The discipline is the feature.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Astro 7 (static output), Tailwind 4, TypeScript |
| API | Hono 4 on Cloudflare Workers, zod validation |
| Database | Postgres 18 (Neon in production), PL/pgSQL for the wiki logic |
| Media | Cloudflare R2 |
| Tests | Vitest with `@cloudflare/vitest-plugin` (runs the real Worker) |
| Tooling | pnpm workspaces, Wrangler |

---

## Repo layout

```
.
├── plan.md                 # the 13-phase build plan
├── docs/
│   ├── decisions.md        # why static, why Postgres, the AWS post-mortem
│   └── schema.md           # ERD, every function and trigger
├── api/                    # Cloudflare Worker
│   ├── db/migrations/      # 0001 … 0019, applied in order
│   ├── scripts/            # migrate.ts, reset.ts
│   ├── src/
│   │   ├── index.ts        # app wiring, error envelope, CORS
│   │   ├── routes/         # health, directory, notes, search, wiki-stats
│   │   ├── contracts.ts    # zod schemas + inferred types
│   │   └── pagination.ts   # opaque cursor encode/decode
│   └── test/
└── web/                    # Astro static site
```

---

## Quick start

Requires **Node 24**, **pnpm 11**, and **Postgres 18** locally.

```bash
pnpm install

# environment
cp api/.dev.vars.example api/.dev.vars   # fill in DATABASE_URL
cp web/.env.example web/.env

# local database
createdb blog_dev
cd api && pnpm exec tsx scripts/migrate.ts && cd ..   # defaults to localhost/blog_dev

# run both apps
pnpm dev            # api on :8787, web on :4321
```

### The one confusing thing about the database

`DATABASE_URL` is read from `api/.dev.vars`, and the Worker can only talk to **Neon** —
Cloudflare Workers have no raw TCP, so `@neondatabase/serverless` cannot reach a local
Postgres. Meanwhile the migration scripts run in Node and *can* talk to localhost.

| Command | Target |
|---|---|
| `cd api && pnpm exec tsx scripts/migrate.ts` | `postgres://localhost:5432/blog_dev` |
| `pnpm --filter api db:migrate` | whatever `DATABASE_URL` in `.dev.vars` says (Neon) |
| `pnpm --filter api db:reset` | local only — refuses a non-localhost URL unless `ALLOW_REMOTE_RESET=1` |

Use local for schema work and Neon for anything the Worker touches. Keep both migrated.

---

## Scripts

**Root**

| Command | Does |
|---|---|
| `pnpm dev` | runs `api` and `web` in parallel |
| `pnpm dev:api` / `pnpm dev:web` | one at a time |
| `pnpm build` | builds the static site |
| `pnpm check` | `tsc --noEmit` in api, `astro build` in web |
| `pnpm test` | API test suite |
| `pnpm format` | Prettier |

**`api/`**

| Command | Does |
|---|---|
| `pnpm dev` | `wrangler dev` on :8787 |
| `pnpm test` | Vitest, 8 tests |
| `pnpm db:migrate` | apply pending migrations to `DATABASE_URL` |
| `pnpm db:reset` | drop + recreate the local schema, then migrate |

**`web/`**

| Command | Does |
|---|---|
| `pnpm dev` | Astro dev server on :4321 |
| `pnpm build` | static build to `dist/` |
| `pnpm typecheck` | `astro check` — currently broken on Node 24, see Known gaps |

---

## API

Base path `/v1`. There is no authentication yet (Phase 4); every route below is public.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/health` | liveness, service name and version |
| `GET` | `/v1/health/db` | runs a query, reports latency and the latest applied migration |
| `GET` | `/v1/directory` | published notes, alphabetical, no bodies |
| `GET` | `/v1/notes?cursor=&limit=&kind=&status=` | cursor-paginated; `limit` ≤ 100 |
| `GET` | `/v1/notes/:slug` | note + backlinks + outgoing + children; drafts 404 |
| `GET` | `/v1/search?q=&lim=&off=` | full-text, ranked; `q` must be ≥ 2 chars |
| `GET` | `/v1/stats` | one row per kind: count and total reading minutes |

Errors come back in one shape, always:

```json
{
  "error": {
    "code": "note_not_found",
    "message": "No note with slug \"nope\"",
    "requestId": "f372b0b6-…"
  }
}
```

Codes in use: `note_not_found`, `validation_failed`, `invalid_cursor`,
`invalid_input`, `http_error`, `internal_error`.

**Pagination is cursor-based**, not offset. The cursor is an opaque base64 tuple of
`(updated_at, id)`; page 2 will not duplicate rows when a note is edited mid-scroll.

CORS allows exactly the origins listed in `WEB_ORIGIN` (comma-separated). Anything else
gets no `Access-Control-Allow-Origin`.

---

## Database

19 migrations, applied in order. The essentials:

- `notes` — slug, title, markdown body, `kind` (`note`/`page`/`project`),
  `status` (`draft`/`published`/`archived`), `parent_id`, soft delete, generated
  `search_vector`
- `note_links` — the wiki graph
- `note_revisions` — a snapshot of the old row on every meaningful edit
- `media` — R2 object metadata
- views: `directory`, `wiki_stats`, `note_backlinks`

`docs/schema.md` has the ERD, the triggers, and every function including
`create_note`, `publish_note`, `search_notes`, `note_page` and `restore_revision`.

Seed data (10 notes, 23 edges) ships as `0017_seed.sql` and is idempotent — re-running it
is a no-op.

---

## Testing

```bash
pnpm --filter api test
```

The suite runs the actual Worker via `@cloudflare/vitest-plugin`, against the database in
`api/.dev.vars` — these are integration tests, not mocks. **They require a seeded
database**: several assertions depend on the seed's notes (alphabetical directory, drafts
excluded, search results).

---

## Known gaps

- **`web/` is still the Astro hello world.** Pages, design system and p5.js are Phases 7–9.
- **No auth.** Reading is public; there is no write path yet (Phase 4).
- **`astro check` is broken on Node 24** via `@astrojs/check` →
  `@emnapi/runtime@2.0.0-beta.2`, and Astro misreports the crash as "package not
  installed". `pnpm --filter web check` therefore runs `astro build`; `typecheck` is the
  real command for when upstream fixes it.
- **Nothing is deployed.** No Pages project, no Worker, no secrets, no CI yet (Phase 11).
- **Phase 0 is still open** — the old EC2 instance may still be billing. `docs/decisions.md`
  has the checklist.

---

## Roadmap

`plan.md` is the source of truth: 13 phases, each ending in a checkpoint with the exact
commands used to audit it. Next up is Phase 4 (auth), then the admin CRUD, then the site
itself.
