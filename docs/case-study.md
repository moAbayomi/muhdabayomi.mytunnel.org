# Case study: rebuilding a personal site as a wiki

A short, honest account of what the old site was, why it was replaced, and what the
current architecture costs and buys. Numbers are from this repository, not estimates.

---

## The old site

Express + EJS, server-rendered on a single EC2 instance, with SQLite on disk, Tailwind
compiled by Vite, and a bearer-token endpoint that an iOS Shortcut posted Apple Notes
into. A GitHub Action copied the repository to the server over SSH and ran
`pm2 restart`.

It worked. Then it went down and accrued a bill.

The failure was not one bug. Three things compounded:

1. **An always-on server for content that changes a few times a month.** Every visit
   rendered EJS and queried SQLite. Nothing was cached at the edge, so every crawler
   hit the process.
2. **A single point of failure with no health checks.** One instance, one process
   manager, a database file on the same disk, and no backups.
3. **A deploy that copied `node_modules`** (124 MB) on every push, because the CI
   runner installed dependencies before `scp`-ing the whole tree.

The structural mistake was not Express. It was paying for a server to produce the same
HTML for every reader.

## The rebuild

```
browser ──▶ Cloudflare Pages (static Astro)  ──┐
                                               │ build-time fetch
phone PWA ──▶ Cloudflare Worker (Hono, TS) ────┘
                        │
                        ├──▶ Neon Postgres   ← notes, links, search
                        └──▶ Cloudflare R2   ← images
```

Four managed services, all free tier, **nothing running 24/7**. There is no process to
keep alive, so "the site is down" stops being a category of failure.

The important split is **serving vs writing**:

- **Serving is static.** Astro pre-renders every note at build time. Readers get HTML
  from a CDN; they never touch the API.
- **Writing is dynamic.** A small authenticated Worker handles the editor, image
  uploads, and publishing. It is the only component that talks to Postgres.

A blog post does not need personalisation. A wiki needs a good editor. Those are
different problems and they get different tools.

## The model: a wiki, not a blog

The site follows Patrik Arvidsson's model: a private knowledge base with a `published`
filter and a static build on top.

- Every public page is a **note**: `slug`, `title`, `body`, `kind`
  (`note` / `page` / `project`), `status`.
- `[[another-slug]]` in a body creates an edge in `note_links`. A trigger rebuilds those
  edges on every save.
- The **directory is alphabetical**; the home page shows counts, not chronology.
- Each note page shows **Linked from** — the backlinks — and its outgoing links.
- RSS exists, but as a "recently updated" feed rather than a blog subscription.

Why not a blog? The writing is short notes of varying length, not dated essays. A
chronological feed imposes an order the content does not have. Links between notes are
more useful than tags, and backlinks are what make browsing pay off.

The cost of this model is discipline: without links, it degrades into an unordered blog.
The editor warns about unresolved `[[typos]]` instead of dropping them silently.

## The database does real work

Postgres is not a bag of rows here. `api/db/migrations/` defines:

- `slugify()` in PL/pgSQL, and `create_note()` with slug-collision retries.
- `capture_revision()` — every meaningful edit snapshots the **old** row, so edits are
  undoable.
- `reindex_note_links()` — derives `note_links` from the body on save.
- `publish_note()` — refuses to publish an empty body, and sets `published_at` only once.
- `search_notes()` — `websearch_to_tsquery` with `ts_rank_cd` and `ts_headline`.
- `note_page()` — returns a whole page (note, backlinks, outgoing, children) as one
  `jsonb` value, so rendering a note is one round trip.

Generated columns handle search (`search_vector`) because `to_tsvector('english', …)` is
immutable; `reading_minutes` is computed in a function because `unaccent()` is not.

## The editor

`/admin` is a static shell with a password gate, a note list, markdown editing with live
preview, a `[[link]]` picker, image upload, and publish/unpublish/delete.

- **Images are resized in the browser** (canvas → WebP, max 1600 px, q0.82) before
  upload, so R2 stores small files and the Worker never decodes an image.
- **Publishing triggers a Pages deploy hook** and the site rebuilds in under a minute.
- **Offline drafts** live in `localStorage`; the service worker caches the editor shell
  and never caches `/v1/*` — an editor serving a stale note is worse than no offline.
- The editor bundle is **293 KB**, loaded only on `/admin`. Public pages ship 2.4–3.4 KB
  of shared JS.

## Performance decisions

- **p5.js is vendored and lazy.** Bundling it pulled 1.1 MB into a shared chunk that
  every page loaded. It is now a 1.0 MB cacheable asset injected on idle, used only by
  the home page's sketch.
- **Sketches rotate every three days.** Two seeded p5 sketches live in `web/src/sketches`;
  the active one is chosen from the date, so the home page changes slowly without a
  deploy.
- **Shiki runs at build time**, not in the browser. The admin preview uses `marked` +
  `sanitize-html` and skips highlighting, which keeps the editor light.
- **The build fails if the API is unreachable.** That is deliberate: a wiki that
  silently ships yesterday's notes is worse than a failed build.

## What I would do differently

- **Never put secrets in `wrangler.jsonc` `vars`.** The first version declared
  `DATABASE_URL`, `ADMIN_PASSWORD` and `AUTH_SECRET` as empty strings. A missing secret
  would have shipped as `""` and broken auth silently. Secrets now live in
  `wrangler secret put`; `Env` is typed explicitly.
- **Check `.gitignore` before the first `git add -A`.** A pnpm store ended up in a commit
  and a 141 MB file blocked the push to GitHub. The store is now ignored, and the branch
  history was rewritten to remove it.
- **Test against a database branch, not production.** The 38 integration tests create and
  delete notes. They run against `DATABASE_URL_TEST`, a Neon branch.
- **Rotate leaked credentials immediately.** A short-lived bearer token and an R2 key pair
  lived in a `.env` on a compromised box. They should have been revoked the day the box
  fell over, not after a rebuild.

## By the numbers

| | |
|---|---|
| API tests | 38, integration (real Worker + Neon) |
| Static pages per build | 14 (home, directory, RSS, 404, editor, one per note) |
| Shared JS on public pages | 2.4–3.4 KB |
| Editor JS | 293 KB, `/admin` only |
| p5 | 1.0 MB, home page only, after first paint |
| Database migrations | 21 |
| Always-on servers | 0 |

The remaining Phase 11 work is the actual deployment: Neon, R2, Worker secrets, Pages,
DNS. The runbook is in [`deploy.md`](./deploy.md).
