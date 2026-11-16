# Revamp plan — a personal wiki

A static Astro site in `web/`, a TypeScript API in `api/`, Postgres behind it, and a
small PWA editor so notes go in from your phone.

The model is Patrik Arvidsson's site, not a blog: **a private knowledge base with a
`published` filter and a static build on top of it.** Every public page is a note. There
is no feed, no "posted on", no pagination. The directory is alphabetical, links are
inline and bracketed, and a note shows what links to it.

**Status:** Phase 0 deferred (see below), Phase 1 done (commit `e11970d`), Phase 2 next.

---

## How we work

1. You do **one phase at a time**. Not one task — one phase, start to finish.
2. Each phase ends with a **checkpoint** (`C0`…`C12`).
3. When you hit a checkpoint, say **"C2 done"** (plus anything that deviated). I run the
   audit commands against your repo, tell you what's missing, and only then do you start
   the next phase.
4. If a task is blocked, say which one and why.
5. Commit at every checkpoint. `git log` is part of how I check progress.

Every phase has an **Audit** block: those are the exact commands I'll run.

---

## The model in one paragraph

A note is a row: `slug`, `title`, `body`, `kind`, `status`, `parent_id`. Writing `[[another-slug]]`
in a body creates an edge in `note_links`; a trigger rebuilds those edges on every save.
The public site is a build-time read of every note where `status = 'published'`. The
directory lists them alphabetically, each note page renders its body plus a **"Linked
from"** list, and the home page shows counts rather than dates. That's the whole site.

---

## Architecture

```
browser ──▶ Cloudflare Pages (static Astro, CDN)  ──┐
                                                   │ build-time fetch
phone PWA ──▶ Cloudflare Worker (Hono, TS) ────────┘
                        │
                        ├──▶ Postgres (Neon)      ← notes, links, PL/pgSQL
                        └──▶ Cloudflare R2        ← images
```

Four moving parts, all free tier, **nothing running 24/7**. That is the structural fix
for the AWS bill: there is no server to keep alive, so "the site went down" stops being
a category of failure.

**Deliberate trade-off:** publishing triggers a rebuild (~40s) via a deploy hook. Reads
are free and instant forever. For a wiki you edit a few times a week, that's correct.

**Second trade-off:** `web/` and `api/` don't share a types package. ~40 lines are
duplicated. Worth it to keep each deployable independently.

---

## Repo layout

```
.
├── plan.md
├── package.json              # private root, workspace + dev scripts
├── pnpm-workspace.yaml
├── docs/
│   ├── decisions.md
│   └── schema.md             # ERD + notes on the PL/pgSQL
├── api/                      # Cloudflare Worker
│   ├── wrangler.jsonc
│   ├── db/
│   │   ├── migrations/       # 0001_*.sql … applied in order
│   │   ├── seed.sql
│   │   └── README.md
│   ├── scripts/migrate.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── env.ts  db.ts  errors.ts  contracts.ts
│   │   ├── lib/{auth,http,slug,ids,markdown}.ts
│   │   └── routes/{public,auth,admin,media}.ts
│   └── test/
└── web/                      # Astro static site
    ├── astro.config.mjs
    ├── src/
    │   ├── layouts/Base.astro
    │   ├── components/{Header,Footer,NoteList,Backlinks,Meta,ThemeToggle,SearchFilter}.astro
    │   ├── pages/{index,directory,404}.astro
    │   ├── pages/[slug].astro         # note pages
    │   ├── pages/rss.xml.ts
    │   ├── lib/{api,markdown,links,format}.ts
    │   ├── scripts/{sketch,admin,filter}/
    │   ├── fixtures/notes.json
    │   └── styles/global.css
    └── public/
```

**Routing note:** Astro resolves static routes before dynamic ones, so `/directory` beats
`[slug]`. The API must reject reserved slugs (`index`, `directory`, `404`, `rss.xml`,
`sitemap-index.xml`, `admin`, `api`) or a note named `directory` would be unreachable.

---

## Environment variables

| Where | Name | Purpose |
|---|---|---|
| `api/.dev.vars` | `DATABASE_URL` | Neon pooled connection string |
| | `ADMIN_PASSWORD` | your editor password |
| | `AUTH_SECRET` | 32+ random bytes, signs session tokens |
| | `WEB_ORIGIN` | `http://localhost:4321` / prod origin |
| | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | media |
| | `R2_BUCKET`, `R2_PUBLIC_URL` | media |
| | `DEPLOY_HOOK_URL` | Cloudflare Pages build hook |
| `web/.env` | `API_URL` | base URL of the API at build time |

`.dev.vars` and `.env` are gitignored. Production values go in with
`wrangler secret put`, never in a file.

---

## Phase 0 — Ground truth (originally ≈1h, still open)

- **0.1** Cost Explorer, group by *Service*, 6 months. Write down the biggest line item.
- **0.2** `pm2 stop all`, then EC2 → Instance state → Stop.
- **0.3** Sweep orphaned Elastic IPs, EBS volumes, snapshots, NAT gateways.
- **0.4** Billing → Budgets → $5 monthly alarm.
- **0.5** Save `site.db` off the box if it still exists.
- **0.6** **Revoke** the R2 keys and `API_TOKEN` from the old `.env`.
- **0.7** Cloudflare + Neon accounts; Neon project created.

**Status: DEFERRED.** You chose to start Phase 1 first. Nothing recorded here says the
EC2 instance was stopped, so the meter may still be running. Close this before Phase 11.

### Checkpoint C0
**Audit:**
```bash
git status --short
psql --version
node -v && pnpm -v
test -f docs/decisions.md && echo "decisions written"
```

---

## Phase 1 — Repo skeleton ✅ DONE

Commit `e11970d`. Root pnpm workspace, `api/` (Hono + Wrangler, `GET /health`), `web/`
(Astro 7, static, sitemap + Tailwind), `docs/decisions.md`, legacy Express tree removed.

**Deviations, recorded:** `web`'s `check` runs `astro build` because
`@astrojs/check@0.9.12` crashes on Node 24 via `@emnapi/runtime@2.0.0-beta.2`;
`astro check` is kept as `pnpm --filter web typecheck`. `@cloudflare/vitest-pool-workers`
is deferred to Phase 3.

### Checkpoint C1 ✅
```bash
pnpm check
curl -s localhost:8787/health
curl -sI localhost:4321 | head -1
```

---

## Phase 2 — Database: notes, links, and the PL/pgSQL playground (≈1 day)

Do it against **local Postgres** (`createdb blog_dev`) for fast iteration; the same SQL
files run against Neon in Phase 11.

- **2.1** Migration convention: `NNNN_name.sql` plus a `schema_migrations` table
  (`version`, `applied_at`). `api/scripts/migrate.ts` applies pending files in one
  transaction each. Scripts `db:migrate`, `db:reset`.
- **2.2** `0001_extensions.sql`: `pgcrypto` (gen_random_uuid), `unaccent` (slugify),
  `pg_trgm` (fuzzy search).
- **2.3** `0002_types.sql`:
  ```sql
  CREATE TYPE note_kind   AS ENUM ('note','page','project');
  CREATE TYPE note_status AS ENUM ('draft','published','archived');
  ```
  `page` is for About/Now; `project` is for things like Daydrops. They live in the same
  table because in a wiki everything is a note.
- **2.4** `0003_notes.sql` — the core table:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `slug text NOT NULL UNIQUE`
  - `title text NOT NULL`, `body text NOT NULL DEFAULT ''`, `excerpt text`
  - `kind note_kind NOT NULL DEFAULT 'note'`
  - `status note_status NOT NULL DEFAULT 'draft'`
  - `parent_id uuid REFERENCES notes(id) ON DELETE SET NULL`
  - `cover_media_id uuid`
  - `published_at timestamptz`, `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT now()`
  - `deleted_at timestamptz`
  - `reading_minutes int NOT NULL DEFAULT 1`
  - `search_vector tsvector GENERATED ALWAYS AS (...) STORED` — weighted title `A`,
    excerpt `B`, body `C`, via `to_tsvector('english', ...)`.
  - Indexes: `UNIQUE(slug)`, `(status, updated_at DESC)`, `GIN(search_vector)`,
    `GIN(slug gin_trgm_ops)`, `(parent_id)`.
- **2.5** `0004_note_links.sql` — the thing that makes it a wiki:
  ```sql
  CREATE TABLE note_links (
    source_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
  );
  CREATE INDEX note_links_target_idx ON note_links (target_id);
  ```
  One row per `[[slug]]` occurrence pair; the index on `target_id` is what makes
  "Linked from" cheap.
- **2.6** `0005_media.sql` — `media(id, r2_key UNIQUE, url, mime, bytes, width, height,
  alt, created_at)`.
- **2.7** `0006_revisions.sql` — `note_revisions(id, note_id, title, body, excerpt,
  status, created_at, created_by)`.
- **2.8** `0007_fn_slugify.sql` — `slugify(text)` in PL/pgSQL:
  ```sql
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
  ```
- **2.9** `0008_trigger_updated_at.sql` — `set_updated_at()` → `NEW.updated_at = now()`,
  `BEFORE UPDATE ON notes`.
- **2.10** `0009_trigger_revision.sql` — `capture_revision()` `AFTER UPDATE OF title,
  body, excerpt, status ON notes`, inserting the **old** row only when something changed:
  ```sql
  IF (OLD.title, OLD.body, OLD.excerpt, OLD.status)
     IS DISTINCT FROM (NEW.title, NEW.body, NEW.excerpt, NEW.status) THEN
    INSERT INTO note_revisions(note_id, title, body, excerpt, status)
    VALUES (OLD.id, OLD.title, OLD.body, OLD.excerpt, OLD.status);
  END IF;
  ```
- **2.11** `0010_trigger_links.sql` — `reindex_note_links()`, `AFTER INSERT OR UPDATE OF
  body ON notes`. Deletes the note's outgoing edges, then re-derives them:
  ```sql
  DELETE FROM note_links WHERE source_id = NEW.id;

  INSERT INTO note_links (source_id, target_id)
  SELECT DISTINCT NEW.id, n.id
  FROM regexp_matches(NEW.body, '\[\[([a-z0-9-]+)\]\]', 'g') AS m(slug)
  JOIN notes n ON n.slug = m[1]
  WHERE n.id <> NEW.id
  ON CONFLICT DO NOTHING;
  ```
  Unresolved links (typos) are silently dropped — which is correct, but means a broken
  link looks like plain text. The editor should warn instead; that's Phase 10.
- **2.12** `0011_fn_create_note.sql` — `create_note(p_title, p_body, p_kind, p_parent_slug)`
  returning `notes`. Retry loop for unique slugs (`slugify(title)`, then `-2`, `-3`…),
  rejects reserved slugs, sets `reading_minutes`.
- **2.13** `0012_fn_publish.sql` — `publish_note(p_slug)`: raises if the body is empty or
  only whitespace; sets `status='published'` and `published_at=now()` only if unset.
  Also `unpublish_note(p_slug)`.
- **2.14** `0013_fn_search.sql` — `search_notes(q, lim, off)` using
  `websearch_to_tsquery('english', q)`, ranked with `ts_rank_cd`, plus a `ts_headline`
  snippet. Exclude drafts and soft-deleted rows.
- **2.15** `0014_fn_note_page.sql` — `note_page(p_slug)` returning one `jsonb`:
  the note, its **backlinks**, its **outgoing links**, and its children. One round trip
  for a whole note page:
  ```sql
  SELECT jsonb_build_object(
    'note', to_jsonb(n),
    'backlinks', (SELECT jsonb_agg(...) FROM note_links l ...),
    'outgoing',  (SELECT jsonb_agg(...) FROM note_links l ...),
    'children',  (SELECT jsonb_agg(...) FROM notes c WHERE c.parent_id = n.id)
  )
  ```
- **2.16** `0015_fn_restore_revision.sql` — `restore_revision(rev_id)` writes the snapshot
  back onto the note (which itself creates a new revision — correct for an audit trail).
- **2.17** `0016_views.sql`:
  - `directory` — published notes: `slug, title, kind, updated_at, reading_minutes`.
  - `wiki_stats` — counts by kind and total reading minutes, for the home page.
  - `note_backlinks` — target → source, published only.
- **2.18** `0017_seed.sql` — 8–12 real notes, interlinked with `[[...]]` so the graph is
  non-trivial: at least one `page` (`about`, `now`), one `project`, one draft, one note
  with a code block, and one note that links to three others.
- **2.19** Exercise it by hand in `psql`:
  ```sql
  SELECT create_note('Second brain', 'See [[about]] and [[now]].', 'note', NULL);
  SELECT * FROM note_links;                       -- 2 edges
  UPDATE notes SET body = 'Only [[about]] now.' WHERE slug = 'second-brain';
  SELECT count(*) FROM note_links;                -- 1
  SELECT publish_note('second-brain');
  SELECT * FROM note_page('about');               -- note + backlinks
  SELECT * FROM search_notes('brain');
  ```
- **2.20** `docs/schema.md` — Mermaid ERD plus one paragraph per function/trigger.

### Checkpoint C2
**Audit:**
```bash
psql blog_dev -c '\d+ notes'
psql blog_dev -c '\d+ note_links'
psql blog_dev -c '\df'
psql blog_dev -c "select tgname from pg_trigger where not tgisinternal"
psql blog_dev -c "select count(*) from note_links"
psql blog_dev -c "select title from search_notes('brain')"
psql blog_dev -c "select * from wiki_stats"
```
**Plus, from you:** one sentence each on `reindex_note_links`, `capture_revision`,
`create_note`, `note_page`.

**Gotchas:**
- **Generated columns need `IMMUTABLE`.** `to_tsvector('english', x)` is fine; `now()`
  and `unaccent()` are not. That's why `reading_minutes` is set by function, not generated.
- **`regexp_matches` returns `text[]`**, so match on `m[1]`, not `m.slug` — the alias
  names the row, not the capture group.
- **The link trigger must delete before insert**, or stale edges survive an edit.
- **`unaccent` needs the extension first.**
- **`SECURITY DEFINER`** functions need `SET search_path = public, pg_temp`.
- **Self-links and duplicates** — exclude `n.id <> NEW.id`, and use `DISTINCT` +
  `ON CONFLICT DO NOTHING`.

---

## Phase 3 — API foundation (≈1 day)

- **3.1** `api/src/env.ts` — typed bindings + `requireEnv()` that fails at startup.
- **3.2** `api/src/db.ts` — `neon(env.DATABASE_URL)` from `@neondatabase/serverless`,
  plus a small `sql` tagged-template helper.
- **3.3** Middleware: request id, structured log line, `server-timing`.
- **3.4** `api/src/errors.ts` — `AppError(status, code, message, details?)` and one
  `onError` shape: `{ error: { code, message, details?, requestId } }`.
- **3.5** CORS allowlist from `WEB_ORIGIN`; allow `Authorization` + `Content-Type`.
- **3.6** `contracts.ts` — zod schemas for `Note`, `NoteSummary`, `DirectoryEntry`,
  `WikiStats`, `NotePage` (note + backlinks + outgoing + children), `SearchResult`.
- **3.7** `GET /v1/health`, `GET /v1/health/db`.
- **3.8** `GET /v1/directory` — published notes only, alphabetical, with `kind` and
  `updatedAt`.
- **3.9** `GET /v1/notes/:slug` — calls `note_page()`, returns the whole payload; 404 with
  the standard envelope otherwise.
- **3.10** `GET /v1/stats` — from `wiki_stats`.
- **3.11** `GET /v1/search?q=` — calls `search_notes()`, 400 under 2 characters.
- **3.12** `GET /v1/notes` — cursor-paginated, newest-updated first. Used by the editor,
  not the static site.
- **3.13** Tests with `@cloudflare/vitest-pool-workers`: health, directory shape, 404
  envelope, short-search 400.
- **3.14** `api/README.md` endpoint table.

### Checkpoint C3
**Audit:**
```bash
cd api && pnpm test
curl -s localhost:8787/v1/health
curl -s localhost:8787/v1/directory
curl -s localhost:8787/v1/notes/nope -o /dev/null -w '%{http_code}\n'
curl -s "localhost:8787/v1/search?q=p"
```

---

## Phase 4 — Auth (≈half day)

- **4.1** `ADMIN_PASSWORD` + `AUTH_SECRET` in `.dev.vars`; `wrangler secret put` in prod.
- **4.2** `lib/auth.ts` — HMAC-SHA256 token via Web Crypto:
  `base64url({sub,iat,exp}) + "." + signature`, 30-day expiry. No JWT library.
- **4.3** Constant-time password comparison (hash both, `crypto.subtle.verify`).
- **4.4** `POST /v1/auth/login` → `{ token, expiresAt }`; generic 401 on failure.
- **4.5** `requireAuth` middleware — verifies signature **and** expiry.
- **4.6** Login rate limit: `login_attempts(ip, at)` + `check_login_rate(ip)` PL/pgSQL,
  5 failures per 15 minutes.
- **4.7** Tests: valid, wrong password, missing header, tampered token, expired token.

### Checkpoint C4
**Audit:**
```bash
cd api && pnpm test
curl -s -X POST localhost:8787/v1/admin/notes -o /dev/null -w '%{http_code}\n'
```

---

## Phase 5 — Admin CRUD + links + revisions (≈1 day)

- **5.1** `GET /v1/admin/notes?status=` — drafts and published.
- **5.2** `POST /v1/admin/notes` — zod-validated, calls `create_note()`.
- **5.3** `PATCH /v1/admin/notes/:id` — client sends the `updatedAt` it last saw; mismatch
  returns **409** with the current row. Optimistic concurrency.
- **5.4** `POST /v1/admin/notes/:id/publish` and `.../unpublish` → Phase 2 functions;
  map `RAISE EXCEPTION` to 422.
- **5.5** `DELETE /v1/admin/notes/:id` (soft) and `.../restore`.
- **5.6** `GET /v1/admin/notes/:id/links` — outgoing, plus unresolved `[[...]]` targets.
  This is what lets the editor warn about typos.
- **5.7** `GET .../revisions`, `POST .../revisions/:rev/restore`.
- **5.8** `POST /v1/admin/rebuild` — calls `DEPLOY_HOOK_URL`.
- **5.9** Tests: create → edit → link → publish → revise → restore → delete, plus 409.

### Checkpoint C5
**Audit:**
```bash
cd api && pnpm test
psql blog_dev -c "select count(*) from note_revisions"
psql blog_dev -c "select count(*) from note_links"
```

---

## Phase 6 — Media to R2 (≈half day)

- **6.1** R2 bucket `wiki-media`, public access, note the base URL.
- **6.2** `POST /v1/admin/media` — multipart; **magic-byte** validation (JPEG/PNG/WebP
  only), 10 MB cap, key `YYYY/MM/<uuid>.<ext>`, metadata row in `media`.
- **6.3** `DELETE /v1/admin/media/:id` — row + object.
- **6.4** `Cache-Control: public, max-age=31536000, immutable`.
- **6.5** Tests: real PNG accepted; `.txt` renamed `.png` rejected; 11 MB rejected.

### Checkpoint C6
```bash
cd api && pnpm test
```

---

## Phase 7 — Web foundation + design system (≈1.5 days)

Patrik's restraint, your own identity.

- **7.1** `astro.config.mjs` — `output: "static"`, `site`, sitemap, Tailwind via Vite,
  `prefetch: true`.
- **7.2** **Type:** Instrument Sans (UI), Newsreader (note bodies), JetBrains Mono (meta,
  slugs, counts, dates). Self-hosted via `@fontsource-variable/*`, latin subset,
  `font-display: swap`.
- **7.3** Tokens in `global.css`:
  - paper `#faf8f5` / ink `#14120f` / muted `#6f6a63` / rule `#e2ddd5`
  - dark: `#12110f` / `#eae5dd` / `#8a847b` / `#2a2723`
  - one accent: rust `#a8471f` / `#e0703f`
  - fluid type scale, spacing scale, `[data-theme=dark]` variant
  - `::selection`, `:focus-visible`, `prefers-reduced-motion` guard
- **7.4** `Base.astro` — head, canonical, OG defaults, inline theme script **before**
  paint, skip-link.
- **7.5** Components: `Header` (wordmark, monospace nav), `Footer` (local time, commit
  hash, RSS), `ThemeToggle`, `Meta` (label/value in mono), `NoteList` (title — dotted
  leader — meta), `Backlinks` ("Linked from"), `SearchFilter`.
- **7.6** `BracketedLink.astro` — renders `[Title]` with literal brackets, brackets in
  muted, text in ink, accent on hover. This is the visual signature of the whole site.
- **7.7** `/styleguide` (dev only) — every token and component, both themes.
- **7.8** `404.astro` — deadpan, with a link back to the directory.

### Checkpoint C7
```bash
pnpm --filter web check
pnpm --filter web build
```
**Plus:** screenshots of `/styleguide` at 360/768/1440 in both themes.

---

## Phase 8 — Wiki pages (≈1.5 days)

- **8.1** `web/src/lib/api.ts` — build-time fetch of `/v1/directory` and per-note
  `/v1/notes/:slug`, with a **fixture fallback** (`fixtures/notes.json`) so the build never
  depends on the API being up. Log loudly when it falls back.
- **8.2** `web/src/lib/markdown.ts` — `marked` + `shiki` + sanitize. Preprocess
  `[[slug]]` → `[Title](/<slug>)` using a slug→title map from the build, **before**
  rendering. Unresolved links render as literal `[[slug]]` in muted text, not silence.
- **8.3** `/` — name, role, one paragraph, then **In the wiki** counts (notes · pages ·
  projects · minutes), three recently updated, and a link to the directory. No feed.
- **8.4** `/directory` — flat alphabetical list from `/v1/directory`, kind in mono,
  "updated" as a relative date. Plus a client-side filter input that narrows the
  already-rendered list (no API call, no extra moving part).
- **8.5** `[slug].astro` — `getStaticPaths` from the directory:
  - breadcrumb `Home / Title`
  - `h1`, then a mono line: `updated 3 Nov 2026 · 4 min · note`
  - body in Newsreader at ~68ch
  - **Linked from** — the backlinks list, after a hairline
  - **Links out** — the outgoing links, collapsed by default
  - parent/children if `parent_id` is set
- **8.6** `/rss.xml` — "recently updated" feed from `updated_at`, not a blog feed.
- **8.7** `robots.txt`, sitemap, per-page title/description/canonical/OG.
- **8.8** `public/_headers` (security + cache) and `_redirects`.
- **8.9** Reserved-slug guard: the build fails loudly if a note's slug collides with a
  static route.

### Checkpoint C8
```bash
pnpm --filter web build
ls web/dist | head
grep -c "<item>" web/dist/rss.xml
```
**Plus:** confirmation that the build succeeds with `API_URL` pointed at a dead host.

---

## Phase 9 — p5.js (≈half day)

- **9.1** Decide what it draws. Suggestion: a seeded line/contour field in the accent
  colour, sitting beside the wordmark — a mark, not a lava lamp.
- **9.2** `web/src/scripts/sketch.ts` — **instance mode**.
- **9.3** Constraints: `import()` after first paint; one static frame under
  `prefers-reduced-motion`; `noLoop()` when off-screen; pause when `document.hidden`;
  `pixelDensity` capped at 2 (1 on small screens); seeded from the date.
- **9.4** Fixed aspect box in the hero so there's no layout shift; CSS fallback.

### Checkpoint C9
```bash
pnpm --filter web build
du -h web/dist/_astro/*.js | sort -h | tail -3
```
**Plus:** Lighthouse mobile + desktop.

---

## Phase 10 — PWA editor (≈1.5 days)

- **10.1** `web/src/pages/admin.astro` — static shell, `noindex`, login gate.
- **10.2** `web/src/scripts/admin/` — vanilla TS: `auth.ts`, `api.ts`, `editor.ts`,
  `media.ts`.
- **10.3** Note list (draft/published), create, edit, delete, publish/unpublish.
- **10.4** Markdown textarea + live preview. Autosave to `localStorage`; "unsaved" badge.
- **10.5** Link helpers: type `[[` to pick a note; warn on unresolved `[[...]]` in the
  body using `/v1/admin/notes/:id/links`.
- **10.6** Image upload: canvas-resize to 1600px, WebP ~0.82, then upload.
- **10.7** Publish → `POST /v1/admin/rebuild`; show "publishing…" until the hook returns.
- **10.8** Revisions list + restore.
- **10.9** PWA: manifest, icons, hand-written service worker (precache the admin shell,
  never cache `/v1/*`). Offline drafts in `localStorage`, sync on reconnect.

### Checkpoint C10
```bash
pnpm --filter web build
ls web/dist/admin* web/dist/manifest.webmanifest
```
**Plus:** a note written on your phone, published, and visible on the live site.

---

## Phase 11 — Deploy + CI + docs (≈1 day)

- **11.1** Migrate + seed Neon.
- **11.2** Pages project: root `web`, build `pnpm --filter web build`, output `dist`,
  `API_URL` as a build env var. Copy the deploy hook URL.
- **11.3** `wrangler deploy`; `wrangler secret put` for every secret; real `WEB_ORIGIN`.
- **11.4** Custom domains for site and API; DNS in Cloudflare; verify CORS from the real
  origin.
- **11.5** GitHub Actions with path filters: `api.yml` (install, check, test, deploy),
  `web.yml` (build, pages deploy). Delete the old EC2 workflow.
- **11.6** `README.md` as a case study: architecture, the AWS post-mortem, the
  static-rebuild trade-off, why the wiki model.
- **11.7** Final sweep: `git log -p | grep -i 'secret\|password'`, no `.dev.vars`, clean tree.

### Checkpoint C11
```bash
git status --short
curl -sI https://<domain> | head -3
curl -s https://api.<domain>/v1/health
```
**Plus:** a push to `main` deploys both; the AWS instance is terminated.

---

## Phase 12 — Stretch (after v1 ships)

- **12.1** Pinned GitHub repos — `GET /v1/github/pinned`, cached 1h. Render as a short
  list on the home page.
- **12.2** Link unfurls — for `github.com` / `medium.com` links in a body, fetch OG
  metadata **server-side at build time**, cache it, render a restrained link card.
  Allowlist domains; never fetch arbitrary URLs from the client.
- **12.3** Full-text search UI over `/v1/search` (the directory filter only matches
  titles).
- **12.4** Per-note OG images with `satori` + `resvg`.
- **12.5** The work-log / activity strip, if you ever want Patrik's "Recent rhythms".
- **12.6** Analytics — Cloudflare Web Analytics (no cookies, no banner).

---

## Definition of done for v1

- [ ] A note lives at `/<slug>`, came from Postgres, and renders its `[[links]]`.
- [ ] Its page shows **Linked from** with at least one backlink.
- [ ] `/directory` lists every published note alphabetically.
- [ ] The home page shows real counts, not dates.
- [ ] Search returns ranked results.
- [ ] You can write and publish from your phone.
- [ ] CDN + Worker + Neon + R2; nothing billed hourly; a $5 alarm proves it.
- [ ] `pnpm check` and `pnpm test` green in CI.
- [ ] `docs/decisions.md` and `README.md` explain why.

---

## Progress

| Phase | Checkpoint | Done |
|---|---|---|
| 0 — Ground truth | C0 | [ ] deferred |
| 1 — Repo skeleton | C1 | [x] `e11970d` |
| 2 — Database + links + PL/pgSQL | C2 | [ ] |
| 3 — API foundation | C3 | [ ] |
| 4 — Auth | C4 | [ ] |
| 5 — Admin CRUD | C5 | [ ] |
| 6 — Media | C6 | [ ] |
| 7 — Design system | C7 | [ ] |
| 8 — Wiki pages | C8 | [ ] |
| 9 — p5.js | C9 | [ ] |
| 10 — PWA editor | C10 | [ ] |
| 11 — Deploy + docs | C11 | [ ] |
| 12 — Stretch | — | [ ] |
