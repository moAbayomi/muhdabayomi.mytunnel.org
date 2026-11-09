# Revamp plan — `muhdabayomi.mytunnel.org`

A static Astro site in `web/`, a TypeScript API in `api/`, Postgres behind it, and a
small PWA editor so notes go in from your phone. Built to be a blog first and a
playground second.

**Status:** v1 = blog. GitHub repos, link unfurls, and search are Phase 12 — real, but
deliberately last.

---

## How we work

1. You do **one phase at a time**. Not one task — one phase, start to finish.
2. Each phase ends with a **checkpoint** (`C0`…`C12`).
3. When you hit a checkpoint, say **"C2 done"** (plus anything that deviated). I then
   run the audit commands myself against your repo, tell you what's missing, and only
   then do you start the next phase.
4. If a task is blocked, say which one and why. Don't skip it silently — most of these
   tasks are load-bearing for a later phase.
5. Commit at every checkpoint. `git log` is part of how I check progress.

Every phase has an **Audit** block: those are the exact commands I'll run. If you've
done the phase, they pass. If they don't pass, that's the answer to "what am I lacking".

---

## Architecture

```
browser ──▶ Cloudflare Pages (static Astro, CDN)  ──┐
                                                   │ build-time fetch
phone PWA ──▶ Cloudflare Worker (Hono, TS) ────────┘
                        │
                        ├──▶ Postgres (Neon)      ← blog content, PL/pgSQL
                        └──▶ Cloudflare R2        ← images
```

Four moving parts, all free tier, **nothing running 24/7**. That last point is the
whole fix for what happened on AWS: there is no server to keep alive, so "the site went
down" stops being a category of failure.

**Deliberate trade-off:** the site is static, so publishing triggers a rebuild (~40s)
via a Cloudflare deploy hook. Reads are free and instant forever. For a blog written a
few times a month, that's the right trade. If you ever need instant publishing, the
switch is making `/writing/[slug]` SSR — don't do it now.

**Second trade-off:** `web/` and `api/` don't share a types package. Types are
duplicated (~40 lines). Worth it to keep each deployable independently. Revisit only if
the duplication starts causing bugs.

---

## Repo layout

```
.
├── plan.md
├── package.json              # private root, workspace + dev scripts
├── pnpm-workspace.yaml
├── .nvmrc
├── .gitignore
├── docs/
│   ├── decisions.md          # why static, why Postgres, the AWS post-mortem
│   └── schema.md             # ERD + notes on the PL/pgSQL
├── api/                      # Cloudflare Worker
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.jsonc
│   ├── vitest.config.ts
│   ├── .dev.vars.example
│   ├── db/
│   │   ├── migrations/       # 0001_*.sql … applied in order
│   │   ├── seed.sql
│   │   └── README.md
│   ├── scripts/migrate.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── env.ts
│   │   ├── db.ts
│   │   ├── errors.ts
│   │   ├── contracts.ts      # zod schemas
│   │   ├── lib/{auth,http,slug,ids}.ts
│   │   └── routes/{public,auth,admin,media}.ts
│   └── test/
└── web/                      # Astro static site
    ├── package.json
    ├── astro.config.mjs
    ├── tsconfig.json
    ├── public/
    └── src/
        ├── layouts/Base.astro
        ├── components/
        ├── pages/
        ├── lib/{api,markdown,format}.ts
        ├── scripts/{sketch,admin}/
        ├── fixtures/posts.json
        └── styles/global.css
```

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

## Phase 0 — Ground truth (≈1h, no code)

- **0.1** Open **Cost Explorer**, group by *Service*, last 6 months. Write down the
  single biggest line item. This decides whether you were paying for free-tier expiry
  or for load — and it's a paragraph in your README.
- **0.2** Stop the meter: `pm2 stop all` on the box, then EC2 → Instance state → Stop.
  If the instance is already gone, say so and move on.
- **0.3** Sweep for resources that bill while idle: **Elastic IPs** (unattached),
  **EBS volumes** (available), **snapshots**, **NAT gateways**, **CloudWatch Logs**
  retention. Delete anything orphaned.
- **0.4** Billing → **Budgets** → $5 monthly alarm to your email. Do not skip this.
- **0.5** If the box is alive, try to get your posts off it:
  `scp you@host:/var/www/app/data/site.db ./legacy-site.db`. If it's gone, accept the
  loss — there were only 3 test notes.
- **0.6** **Revoke the old credentials.** The keys in `.env` lived on a box that fell
  over. Delete the old R2 API token in the Cloudflare dashboard and delete the old
  `API_TOKEN`. You're minting new ones anyway.
- **0.7** Accounts: **Cloudflare** (Pages + Workers + R2), **Neon** (Postgres), GitHub
  (have it). Create the Neon project, note the pooled connection string.
- **0.8** Local toolchain — already present, verify: `node -v` (24.x), `pnpm -v` (11.x),
  `psql --version` (18.x). `wrangler` gets installed as a dev dependency in Phase 1.
- **0.9** Create `docs/decisions.md`: one page, dated, recording (a) why the EC2/SSR
  setup is being replaced, (b) why static + Postgres, (c) the AWS line item from 0.1.

### Checkpoint C0
**Audit:**
```bash
git status --short
psql --version
node -v && pnpm -v
test -f docs/decisions.md && echo "decisions written"
```
**Plus, from you:** the top Cost Explorer line item, and whether `legacy-site.db`
exists locally.

---

## Phase 1 — Repo skeleton (≈2h)

- **1.1** Root `package.json`: `"private": true`, `"packageManager": "pnpm@11.x"`,
  engines `node >=24`. Scripts: `dev`, `dev:api`, `dev:web`, `check`, `format`.
- **1.2** `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - api
    - web
  ```
- **1.3** `.nvmrc` (`24`), `.editorconfig`, and replace `.gitignore`:
  ```
  node_modules
  .env
  .dev.vars
  .DS_Store
  dist
  .astro
  .wrangler
  *.log
  ```
- **1.4** Record the deletions: `git add -A` so the old Express tree is actually
  removed from the index, not just from disk. Commit.
- **1.5** `api/package.json` — deps: `hono`, `zod`, `@neondatabase/serverless`.
  devDeps: `wrangler`, `typescript`, `@cloudflare/workers-types`, `vitest`,
  `@cloudflare/vitest-pool-workers`.
- **1.6** `api/tsconfig.json` — strict, `types: ["@cloudflare/workers-types"]`,
  `module: "esnext"`, `moduleResolution: "bundler"`, `noEmit: true`.
- **1.7** `api/wrangler.jsonc` — `name: "blog-api"`, `main: "src/index.ts"`,
  `compatibility_date` (today), `compatibility_flags: ["nodejs_compat"]`,
  `observability.enabled: true`.
- **1.8** `api/src/index.ts` — Hono app, `GET /health` → `{ ok: true }`, export default.
- **1.9** `web/` — scaffold Astro **manually** (no `create astro`, you deleted
  everything on purpose): `package.json` with `astro`, `@astrojs/sitemap`,
  `@astrojs/rss`, `tailwindcss`, `@tailwindcss/vite`; `astro.config.mjs` with
  `output: "static"`, `site`, Tailwind plugin; `tsconfig.json` extending
  `astro/tsconfigs/strict`; `src/pages/index.astro` with "hello".
- **1.10** Root scripts:
  - `dev`: `pnpm --parallel --filter "./api" --filter "./web" dev`
  - `dev:api`: `pnpm --filter api dev` → `wrangler dev`
  - `dev:web`: `pnpm --filter web dev` → `astro dev`
  - `check`: `pnpm -r check` (tsc `--noEmit` in api, `astro check` in web)
- **1.11** `api/.dev.vars.example` and `web/.env.example` with every name from the
  table above, values blank or `changeme`. Copy to the real files locally.
- **1.12** `pnpm install`, run both, commit.

### Checkpoint C1
**Audit:**
```bash
pnpm check
curl -s localhost:8787/health
curl -sI localhost:4321 | head -1
git ls-files | head -30
```

> `web`'s `check` runs `astro build`, not `astro check`. `@astrojs/check@0.9.12`
> currently crashes on Node 24 via `@emnapi/runtime@2.0.0-beta.2`, and Astro
> misreports that crash as "dependency not installed". `astro check` is still
> wired up as `pnpm --filter web typecheck` for when that's fixed upstream.
> Building is the honest gate in the meantime: it proves the site compiles.
**Expect:** `/health` returns JSON, Astro responds 200, `git ls-files` no longer lists
`app.js`/`views/`/`routes/`, and `pnpm check` is clean.

**Gotchas:** Astro 7 requires node ≥ 22.23 — you're on 24, fine. Don't add a `shared/`
package; `packages/` is currently an empty leftover dir, delete it.

---

## Phase 2 — Database: schema + the PL/pgSQL playground (≈1 day)

This is the phase you actually want to play in. Do it against **local Postgres**
(`createdb blog_dev`) for fast iteration; the same SQL files run against Neon in
Phase 11. One source of truth: `api/db/migrations/`, numbered, applied in order.

- **2.1** Migration convention: `NNNN_name.sql`, plus a `schema_migrations` table
  (`version`, `applied_at`). Write `api/scripts/migrate.ts` that reads the directory and
  applies pending files in one transaction each. Add `pnpm db:migrate` and
  `pnpm db:reset`.
- **2.2** `0001_extensions.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
  CREATE EXTENSION IF NOT EXISTS unaccent;  -- slugify
  CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy search
  ```
- **2.3** `0002_types.sql` — `CREATE TYPE post_status AS ENUM ('draft','published','archived');`
- **2.4** `0003_posts.sql` — the core table:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `slug text NOT NULL UNIQUE`
  - `title text NOT NULL`, `body text NOT NULL DEFAULT ''`, `excerpt text`
  - `status post_status NOT NULL DEFAULT 'draft'`
  - `cover_media_id uuid`
  - `published_at timestamptz`, `created_at timestamptz NOT NULL DEFAULT now()`,
    `updated_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz`
  - `view_count bigint NOT NULL DEFAULT 0`
  - `search_vector tsvector GENERATED ALWAYS AS (...) STORED` — weighted:
    title `A`, excerpt `B`, body `C`, using `to_tsvector('english', ...)`.
  - `reading_minutes int` — **not** a generated column; see gotcha below.
  - Indexes: `UNIQUE(slug)`, `(status, published_at DESC)`, `GIN(search_vector)`,
    `GIN(slug gin_trgm_ops)` for fuzzy slug lookup.
- **2.5** `0004_tags.sql` — `tags(id, slug UNIQUE, name)`, `post_tags(post_id, tag_id,
  PRIMARY KEY (post_id, tag_id))` with FKs `ON DELETE CASCADE`.
- **2.6** `0005_media.sql` — `media(id uuid, r2_key text UNIQUE, url text, mime text,
  bytes int, width int, height int, alt text, created_at)`.
- **2.7** `0006_revisions.sql` — `post_revisions(id, post_id, title, body, excerpt,
  status, created_at, created_by text)` with FK to `posts`.
- **2.8** `0007_fn_slugify.sql` — a real PL/pgSQL function:
  ```sql
  -- STABLE, not IMMUTABLE: it calls unaccent(), which is only STABLE.
  -- That means slugify can't be used in a generated column or index expression.
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
- **2.9** `0008_trigger_updated_at.sql` — `set_updated_at()` sets `NEW.updated_at =
  now()`; attach `BEFORE UPDATE ON posts`.
- **2.10** `0009_trigger_revision.sql` — `capture_revision()` `AFTER UPDATE OF title,
  body, excerpt, status ON posts`, inserting the **old** row into `post_revisions`
  when something actually changed:
  ```sql
  IF (OLD.title, OLD.body, OLD.excerpt, OLD.status)
     IS DISTINCT FROM (NEW.title, NEW.body, NEW.excerpt, NEW.status) THEN
    INSERT INTO post_revisions(post_id, title, body, excerpt, status)
    VALUES (OLD.id, OLD.title, OLD.body, OLD.excerpt, OLD.status);
  END IF;
  ```
- **2.11** `0010_fn_create_post.sql` — `create_post(p_title, p_body, p_excerpt,
  p_tags text[]) RETURNS posts`. Generates a unique slug (try `slugify(title)`, then
  `-2`, `-3`… in a loop), inserts the post, upserts tags, links them, sets
  `reading_minutes` from `regexp_split_to_array`. One call, whole post.
- **2.12** `0011_fn_publish.sql` — `publish_post(p_slug)`:
  - `RAISE EXCEPTION` if the body is empty or only whitespace,
  - sets `status='published'`, `published_at=now()` **only if not already set**,
  - returns the row. Also `unpublish_post(p_slug)`.
  - This is the atomic publish you asked for: validation and state change in one
    round trip.
- **2.13** `0012_fn_search.sql` — `search_posts(q text, lim int DEFAULT 20, off int
  DEFAULT 0)` returning ranked results with `ts_rank_cd` and a `ts_headline` snippet:
  ```sql
  WHERE search_vector @@ websearch_to_tsquery('english', q)
  ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', q)) DESC
  ```
- **2.14** `0013_fn_restore_revision.sql` — `restore_revision(rev_id uuid)` writes the
  snapshot back onto the post (which itself generates a new revision — that's correct,
  it's an audit trail, not a checklist).
- **2.15** `0014_views.sql` — `archive_counts` (year, month, count of published),
  `tag_counts` (tag, slug, count), `post_summary` (published posts minus the body, plus
  `reading_minutes`).
- **2.16** `0015_seed.sql` — 6–8 real posts with real prose, a few tags, at least one
  draft, at least one with a code block now that you're a tinkerer. Don't seed lorem
  ipsum; you'll be reading this thing for months.
- **2.17** Exercise the PL/pgSQL by hand with `psql` and confirm:
  ```sql
  -- revision appears on update
  SELECT create_post('Test post', 'body text', 'excerpt', ARRAY['meta']);
  UPDATE posts SET body = 'edited' WHERE slug = 'test-post';
  SELECT count(*) FROM post_revisions;      -- 1
  -- publish refuses emptiness
  SELECT publish_post('test-post');
  UPDATE posts SET body = '   ' WHERE slug = 'test-post';
  SELECT publish_post('test-post');         -- must RAISE
  -- search ranks title above body
  SELECT * FROM search_posts('post');
  ```
- **2.18** `docs/schema.md` — a Mermaid ERD plus one paragraph per function/trigger
  explaining what it does and why.

### Checkpoint C2
**Audit:**
```bash
psql blog_dev -c '\d+ posts'
psql blog_dev -c '\df'
psql blog_dev -c "select tgname from pg_trigger where not tgisinternal"
psql blog_dev -c "select count(*) from post_revisions"
psql blog_dev -c "select title, ts_rank_cd(search_vector, websearch_to_tsquery('english','post')) from posts"
```
**Plus, from you:** a sentence each on what `capture_revision`, `create_post`,
`publish_post`, and `search_posts` do. If you can't explain one, it isn't done.

**Gotchas — these will bite you:**
- **Generated columns require `IMMUTABLE` expressions.** `to_tsvector('english', x)` is
  immutable; `unaccent()` and `now()` are not. That's why `reading_minutes` is set by
  function/trigger rather than generated.
- **Trigger recursion:** `capture_revision` inserts into a *different* table, so it
  won't recurse — but if you ever add a trigger on `post_revisions` that touches
  `posts`, you will need a guard.
- **`unaccent` needs the extension** before `slugify` will compile.
- **`SECURITY DEFINER`** functions need `SET search_path = public, pg_temp` pinned, or
  they're an injection foothold. Do that on any you mark definer.
- **Slug collisions** only show up on the second post with the same title. Build the
  retry loop now, not after the unique constraint fails in production.

---

## Phase 3 — API foundation (≈1 day)

- **3.1** `api/src/env.ts` — one typed `Env` interface for bindings + secrets; a
  `requireEnv()` helper that fails loudly at startup, not at request time.
- **3.2** `api/src/db.ts` — `neon(env.DATABASE_URL)` from
  `@neondatabase/serverless`. Export a tiny `sql` tagged-template helper. **Do not**
  build a connection per request; the HTTP driver doesn't need it.
- **3.3** Middleware: request id (`crypto.randomUUID()`), structured `console.log`
  with method/path/status/ms, and a `server-timing` header.
- **3.4** `api/src/errors.ts` — `AppError(status, code, message, details?)` plus
  `app.onError` returning one shape:
  `{ error: { code, message, details?, requestId } }`. Never leak stack traces.
- **3.5** CORS: allowlist exactly `env.WEB_ORIGIN`, allow `Authorization` and
  `Content-Type`, no wildcards.
- **3.6** `api/src/contracts.ts` — zod schemas: `PostSummary`, `Post`, `Paginated<T>`,
  `SearchResult`. Derive TS types with `z.infer`.
- **3.7** `GET /v1/health` → `{ ok: true, version }`; `GET /v1/health/db` → runs
  `select 1` and reports latency.
- **3.8** `GET /v1/posts` — published only, `deleted_at IS NULL`, ordered by
  `published_at DESC, id DESC`. Cursor pagination (`?cursor=&limit=`, limit capped at
  50). Return `nextCursor`.
- **3.9** `GET /v1/posts/:slug` — 200 or a 404 with the standard envelope.
- **3.10** `GET /v1/tags` and `GET /v1/archive` from the Phase 2 views.
- **3.11** `GET /v1/search?q=` — calls `search_posts()`, rejects `q` shorter than 2
  chars with 400.
- **3.12** Tests with `@cloudflare/vitest-pool-workers`: health, list pagination,
  404 shape, validation failure. If the pool setup fights you for more than an hour,
  fall back to testing the pure helpers and the SQL via `psql` — but then say so, don't
  silently skip.
- **3.13** `api/README.md` — endpoint table with method, path, auth, and one example
  response each.

### Checkpoint C3
**Audit:**
```bash
cd api && pnpm test
curl -s localhost:8787/v1/health
curl -s "localhost:8787/v1/posts?limit=2"
curl -s "localhost:8787/v1/posts/nope" -o /dev/null -w '%{http_code}\n'
curl -s "localhost:8787/v1/search?q=p"
```
**Expect:** 200s, a 404 envelope with `code`, and a 400 for the one-char search.

**Gotchas:** Neon's HTTP driver can't talk to local Postgres — the Worker must point at
Neon (its `dev` branch) even in development. Keep local Postgres for PL/pgSQL work and
migrations, run migrations against both.

---

## Phase 4 — Auth (≈half day)

- **4.1** `ADMIN_PASSWORD` and `AUTH_SECRET` in `.dev.vars` locally;
  `wrangler secret put` in production.
- **4.2** `api/src/lib/auth.ts` — sign a token with **Web Crypto** (HMAC-SHA256):
  `base64url(JSON({sub:"admin", iat, exp}))` + `.` + signature. 30-day expiry.
  No JWT library; ~30 lines and you learn what a JWT actually is.
- **4.3** Compare the password constant-time: hash both with SHA-256 and use
  `crypto.subtle.verify`, or XOR-accumulate. Never `===` on a secret.
- **4.4** `POST /v1/auth/login` `{ password }` → `{ token, expiresAt }`. 401 on failure
  with a generic message.
- **4.5** `requireAuth` middleware — parse `Authorization: Bearer`, verify signature
  **and** expiry, attach `c.set("user", ...)`. Reject with the standard envelope.
- **4.6** Rate-limit login. Smallest thing that works: a `login_attempts(ip, at)`
  table and a `check_login_rate(ip)` PL/pgSQL function — 5 failures per 15 minutes.
  You get another PL/pgSQL toy for free.
- **4.7** Tests: valid login, wrong password, missing header, tampered signature,
  expired token (freeze time or sign with a past `exp`).

### Checkpoint C4
**Audit:**
```bash
cd api && pnpm test
# expect 401
curl -s -X POST localhost:8787/v1/admin/posts -o /dev/null -w '%{http_code}\n'
# tamper: flip the last character of a real token, expect 401
```
**Plus, from you:** what happens to a token when you change `AUTH_SECRET`, and why the
password comparison isn't `===`.

---

## Phase 5 — Admin CRUD + revisions (≈1 day)

- **5.1** `GET /v1/admin/posts?status=` — drafts and published, newest first.
- **5.2** `POST /v1/admin/posts` — validate with zod, call `create_post()`. 201 with
  the row.
- **5.3** `PATCH /v1/admin/posts/:id` — the client sends `updatedAt` it last saw; if it
  doesn't match, **409** with the current row. This is optimistic concurrency and it's
  the difference between a toy API and a real one.
- **5.4** `POST /v1/admin/posts/:id/publish` and `.../unpublish` → call the Phase 2
  functions. Surface the `RAISE EXCEPTION` as a 422 with a readable message.
- **5.5** `DELETE /v1/admin/posts/:id` — soft delete (`deleted_at`), plus
  `POST /v1/admin/posts/:id/restore`.
- **5.6** `GET /v1/admin/posts/:id/revisions`; `POST /v1/admin/posts/:id/revisions/:rev/restore`.
- **5.7** `POST /v1/admin/rebuild` — calls `DEPLOY_HOOK_URL`. Auth required. Phase 10
  uses it; wire it now.
- **5.8** Tests: full lifecycle create → edit → publish → revise → restore → delete,
  plus the 409 conflict case.

### Checkpoint C5
**Audit:**
```bash
cd api && pnpm test
psql blog_dev -c "select count(*) from post_revisions"
psql blog_dev -c "select slug,status,published_at from posts order by created_at desc limit 5"
```
**Plus, from you:** a curl transcript of one full lifecycle.

**Gotchas:** the revision trigger fires on the API's UPDATE, so every edit through
`PATCH` leaves a snapshot. If you see zero revisions, the trigger isn't attached or
`updated_at` is being set twice.

---

## Phase 6 — Media to R2 (≈half day)

- **6.1** R2 bucket `blog-media`, public access enabled (custom domain or
  `r2.dev` for now). Note the public base URL.
- **6.2** `POST /v1/admin/media` — multipart upload. Validate: **magic bytes** (not the
  extension), allow only JPEG/PNG/WebP, cap at 10 MB. Key:
  `YYYY/MM/<uuid>.<ext>`. Store metadata in `media`.
- **6.3** `DELETE /v1/admin/media/:id` — remove the row and the object.
- **6.4** Cache headers: `Cache-Control: public, max-age=31536000, immutable` (keys are
  unique, so that's safe).
- **6.5** Tests: accept a real PNG; reject a `.txt` renamed to `.png`; reject 11 MB.

### Checkpoint C6
**Audit:**
```bash
cd api && pnpm test
curl -s -X POST localhost:8787/v1/admin/media -o /dev/null -w '%{http_code}\n'
```
**Plus, from you:** the public URL of an uploaded image that renders in a browser.

---

## Phase 7 — Web foundation + design system (≈1.5 days)

Keep the current restraint, add a real identity.

- **7.1** `web/astro.config.mjs` — `output: "static"`, `site`,
  `integrations: [sitemap()]`, Tailwind v4 via `@tailwindcss/vite`,
  `prefetch: true`.
- **7.2** **Type:** Instrument Sans (UI/display), Newsreader (post prose, gives the
  writing weight), JetBrains Mono (meta, timestamps, labels). Self-host with
  `@fontsource-variable/*`, subset to latin, `font-display: swap`.
- **7.3** `web/src/styles/global.css` — tokens:
  - paper `#faf8f5` / ink `#14120f` / muted `#6f6a63` / rule `#e2ddd5`
  - dark: paper `#12110f` / ink `#eae5dd` / muted `#8a847b` / rule `#2a2723`
  - one accent, used sparingly (links, focus, the p5 canvas): rust `#a8471f` / `#e0703f`
  - type scale, fluid spacing, `@custom-variant dark` against `[data-theme=dark]`
  - `::selection`, visible `:focus-visible`, `prefers-reduced-motion` guard
- **7.4** `Base.astro` — head (charset, viewport, canonical, OG defaults), inline
  theme script **before** paint, skip-link, `<slot />`.
- **7.5** Components: `Header` (wordmark + nav), `Footer` (local time in Osun, RSS,
  colophon), `ThemeToggle`, `Meta` (mono label/value), `DotLeader` (the dotted list
  rule you already had), `PostCard`.
- **7.6** Theme logic: `localStorage.theme` → system → `data-theme` on `<html>`. No
  flash. **Fix the old bug** where the variant looked for `[data-theme=dark]` but the
  script toggled `.dark`.
- **7.7** `/styleguide` page (dev-only) showing every token, heading, and component in
  both themes. This is how you design instead of guessing.
- **7.8** `404.astro` — deadpan, not "loading!!!".

### Checkpoint C7
**Audit:**
```bash
pnpm --filter web check
pnpm --filter web build
```
**Plus, from you:** screenshots of `/styleguide` at 360px, 768px, 1440px in both
themes; the Lighthouse baseline numbers.

---

## Phase 8 — Blog pages (≈1.5 days)

- **8.1** `web/src/lib/api.ts` — build-time `fetch` of published posts, with a
  **fixture fallback** (`web/src/fixtures/posts.json`) so the build never depends on
  the API being up. Log loudly when it falls back.
- **8.2** `web/src/lib/markdown.ts` — `marked` + `shiki` for code highlighting +
  sanitization. Content is yours, but sanitize anyway; it's one line and it's the
  difference between a blog and an XSS vector.
- **8.3** `/writing/index.astro` — grouped by year, then month, dotted leaders, day
  numbers. Your existing list pattern, tightened.
- **8.4** `/writing/[slug].astro` — `getStaticPaths` from 8.1; prose measure ~68ch;
  title, date, reading time, tags; cover image with `srcset`; prev/next.
- **8.5** `/tags/[tag].astro` and `/tags/index.astro`.
- **8.6** `/rss.xml` via `@astrojs/rss`; `robots.txt`; sitemap already from 7.1.
- **8.7** Per-page `<title>`, description, canonical, OG/Twitter tags. **Fix the old
  bug** where `layout.ejs` overwrote every title.
- **8.8** `public/_headers` (security headers, cache policy) and `_redirects`.
- **8.9** Home page: intro, `now` block, three latest posts, elsewhere links. (p5 comes
  in Phase 9 — leave a slot.)

### Checkpoint C8
**Audit:**
```bash
pnpm --filter web build
ls web/dist/writing | head
head -5 web/dist/rss.xml
grep -c "<item>" web/dist/rss.xml
```
**Plus, from you:** the built page count, an RSS validation pass, and confirmation that
the build still succeeds with `API_URL` pointed at a dead host (fixture fallback).

---

## Phase 9 — p5.js (≈half day)

- **9.1** Decide what it draws. Suggestion: a slow, seeded contour/line field in the
  accent colour behind the wordmark — quiet, not a lava lamp.
- **9.2** `web/src/scripts/sketch.ts` — **instance mode** (`new p5(fn, el)`), no global
  mode.
- **9.3** Constraints, all of them:
  - `import()` it after first paint (`requestIdleCallback`), so it never blocks LCP,
  - `prefers-reduced-motion` → draw exactly one frame and stop,
  - `IntersectionObserver` → `noLoop()` when scrolled out, `loop()` when back,
  - `document.hidden` → pause,
  - cap `pixelDensity` at 2, and 1 on small screens,
  - seed from the date so it's stable for a day and changes overnight.
- **9.4** Mount in the home hero with a fixed aspect box (no layout shift) and a CSS
  fallback for no-JS.

### Checkpoint C9
**Audit:**
```bash
pnpm --filter web build
du -h web/dist/_astro/*.js | sort -h | tail -3
```
**Plus, from you:** Lighthouse mobile + desktop, and confirmation that the canvas stops
drawing when scrolled away.

---

## Phase 10 — PWA editor (≈1.5 days)

- **10.1** `web/src/pages/admin.astro` — static shell, `noindex`, login gate. The HTML
  is public; the data isn't.
- **10.2** `web/src/scripts/admin/` — vanilla TS modules: `auth.ts`, `api.ts`,
  `editor.ts`, `media.ts`. No framework; it keeps the bundle tiny and proves you can.
- **10.3** List drafts/published, create, edit, delete. Show revision count.
- **10.4** Markdown textarea + live preview (client-side `marked` + sanitize).
  Autosave to `localStorage` every few seconds; "unsaved" indicator.
- **10.5** Image upload: resize with `<canvas>` to max 1600px wide, export WebP at
  ~0.82, then upload. This is why R2 stays cheap.
- **10.6** Publish → `POST .../publish` → `POST /v1/admin/rebuild` → the site rebuilds.
  Show "publishing…" until the hook returns.
- **10.7** Revisions list + restore button.
- **10.8** PWA: `manifest.webmanifest`, icons, hand-written service worker —
  precache the admin shell, **never** cache `/v1/*`.
- **10.9** Offline: drafts queue in `localStorage`, sync on reconnect. A visible
  "offline" badge, not a silent failure.

### Checkpoint C10
**Audit:**
```bash
pnpm --filter web build
ls web/dist/admin* web/dist/manifest.webmanifest
```
**Plus, from you:** a post written on your phone, published, and visible on the live
site; and an offline draft that survives a reload with the network off.

---

## Phase 11 — Deploy + CI + docs (≈1 day)

- **11.1** Run migrations against Neon (`pnpm db:migrate` with the Neon URL). Seed.
- **11.2** Pages project: root `web`, build `pnpm --filter web build`, output `dist`,
  `API_URL` as a build env var. Note the deploy hook URL.
- **11.3** Deploy the Worker: `wrangler deploy`; `wrangler secret put` for every secret;
  set `WEB_ORIGIN` to the real origin.
- **11.4** Custom domain for the API (`api.mytunnel.org`) and for the site. DNS in
  Cloudflare. Verify HTTPS and CORS from the real origin.
- **11.5** GitHub Actions — two workflows with path filters:
  - `api.yml`: `pnpm install`, `pnpm --filter api check`, `pnpm --filter api test`,
    `wrangler deploy` (secret `CLOUDFLARE_API_TOKEN`).
  - `web.yml`: build + deploy to Pages (`wrangler pages deploy`).
  - Delete the old EC2 workflow (it's still in git history; recover it from there if
    you ever want to read it).
- **11.6** Preview deployments on PRs, if the free tier allows it. Nice, not required.
- **11.7** `README.md` as a case study: the architecture diagram, the AWS post-mortem
  (line item from 0.1), the static-rebuild trade-off, and how the PL/pgSQL fits in.
  This is the file a recruiter actually reads.
- **11.8** Final sweep: no secrets in git (`git log -p | grep -i 'secret\|password'`),
  no `.dev.vars` committed, `git status` clean.

### Checkpoint C11
**Audit:**
```bash
git status --short
git log --oneline -5
curl -sI https://<your-domain> | head -3
curl -s https://api.<your-domain>/v1/health
```
**Plus, from you:** confirmation that a push to `main` deploys both, and that the AWS
instance is terminated.

---

## Phase 12 — Stretch: the fun things (after v1 ships)

Explicitly **not** part of v1. Do these only once the blog is live and you've posted
something real.

- **12.1** Pinned GitHub repos — `GET /v1/github/pinned`, cached 1h (Cloudflare `caches`
  API or a `cache_entries` table). Render on the home page as a small list, not cards.
  Needs a GitHub token; keep it in `wrangler secret`, never in the client.
- **12.2** Link unfurls — when a post contains a link to `github.com` or `medium.com`,
  fetch the target's OG metadata **server-side at build time**, cache it, and render a
  restrained link card (title, description, domain). Allowlist domains; never fetch
  arbitrary user-supplied URLs from the client.
- **12.3** Per-post OG images — generate at build with `satori` + `resvg`.
- **12.4** Search UI — a `/search` page hitting `/v1/search`, or `pagefind` if you'd
  rather keep it static.
- **12.5** Analytics — Cloudflare Web Analytics (free, no cookies, no banner).

---

## Definition of done for v1

- [ ] A real post lives at `/<slug>` and came from the database, not a fixture.
- [ ] Editing a post creates a revision; restoring one works.
- [ ] Search returns ranked results.
- [ ] You can write and publish from your phone.
- [ ] The site is on a CDN, the API is on Workers, the DB is on Neon, images on R2.
- [ ] Nothing is billed hourly and there's a $5 alarm to prove it.
- [ ] `pnpm check` and `pnpm test` are green in CI.
- [ ] `docs/decisions.md` and `README.md` explain why, not just what.

---

## Progress

| Phase | Checkpoint | Done |
|---|---|---|
| 0 — Ground truth | C0 | [ ] |
| 1 — Repo skeleton | C1 | [ ] |
| 2 — Database + PL/pgSQL | C2 | [ ] |
| 3 — API foundation | C3 | [ ] |
| 4 — Auth | C4 | [ ] |
| 5 — Admin CRUD | C5 | [ ] |
| 6 — Media | C6 | [ ] |
| 7 — Design system | C7 | [ ] |
| 8 — Blog pages | C8 | [ ] |
| 9 — p5.js | C9 | [ ] |
| 10 — PWA editor | C10 | [ ] |
| 11 — Deploy + docs | C11 | [ ] |
| 12 — Stretch | — | [ ] |
