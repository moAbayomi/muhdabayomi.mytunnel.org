# Decisions

Reverse-chronological. One entry per decision that would be expensive to undo.

---

## 2026-11-20 — Secrets are set out-of-band, never in `vars`

**Context:** `wrangler.jsonc` declared `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`,
`DEPLOY_HOOK_URL` and `R2_PUBLIC_URL` as empty `vars`, so the generated types would exist.

**Decision:** remove them from `vars`. Declare the bindings explicitly in
`api/src/env.ts`, and set the values with `wrangler secret put` in production and
`api/.dev.vars` locally.

**Why:** an empty `vars` entry ships as an empty string when the secret is missing. Auth
then compares against `""` — locking everyone out, or worse, accepting an empty password
if the validation ever relaxes. A missing secret should fail loudly, not silently.

**Consequence:** `wrangler types` no longer drives the app's types; `Env` is the source of
truth. CI writes a temporary `.dev.vars` containing only the test database URL.

---

## 2026-11-20 — Deploy topology and ordering

**Decision:** Cloudflare Pages hosts `web/`; a Worker hosts `api/`; Neon holds data; R2
holds images. `.github/workflows/deploy.yml` runs the API job first (typecheck → migrate
and test a Neon branch → `wrangler deploy`), then the web job (`needs: api`) builds with
`PUBLIC_API_URL` and uploads `web/dist`.

**Why order matters:** the web build fetches published notes at build time, so the API
must be deployed and reachable before Pages can build. Two independent workflows would
race.

**Trade-off:** a deploy fails if the API or Neon is unreachable, rather than shipping a
snapshot. That is deliberate: for a wiki, stale content that looks live is worse than a
failed build.

**Open:** `DATABASE_URL_TEST` must point at a Neon branch, never production — the test
suite creates and deletes notes.

---

## 2026-11-09 — The site is a wiki, not a blog

**Context:** reference sites — `patrikarvidsson.com`, `williamjansson.com`,
`namitjuneja.com`. Patrik's `Horizon` page describes the actual machine: a Markdown
knowledgebase, notes marked `public: true`, read at build time into static HTML by Lume,
no client-side JavaScript.

**Decision:** model the site as a flat-namespace wiki. Every public page is a note.
`[[slug]]` in a body creates an edge in `note_links`; a trigger rebuilds those edges on
save. `/directory` is alphabetical. The home page shows counts, not chronology. RSS is a
"recently updated" feed, not a subscribe-to-my-blog feed.

**Why:** the content is short notes of varying length, not dated essays. A chronological
feed imposes an order the writing doesn't have. Links between notes are more useful than
tags, and backlinks are the thing that makes browsing pay off.

**Consequences:**
- Schema gains `note_links`, `parent_id`, and `kind` (`note` / `page` / `project`).
- Tags are dropped from v1 — links replace them.
- Phase 8 becomes `/directory` + `/<slug>` with a "Linked from" section, not an index.
- Reserved slugs must be rejected by the API: `index`, `directory`, `404`, `rss.xml`,
  `sitemap-index.xml`, `admin`, `api`.

**Trade-off:** a wiki degrades into an unordered blog if you don't link. The backlink
panel is the payoff for the discipline, and the editor should warn on unresolved
`[[...]]` rather than silently dropping them.

---

## 2026-11-09 — Static Astro frontend + Hono Worker API + Postgres

**Context:** the previous site was Express + EJS server-rendered on a single EC2
instance, with a bearer-token endpoint that an iOS Shortcut posted Apple Notes into.
It went down and accrued a bill.

**Decision:** `web/` is a static Astro build on Cloudflare Pages; `api/` is a Hono
Worker on TypeScript; content lives in Postgres; images in R2.

**Why:**
- A blog renders identically for every reader. Server-side rendering pays for a
  process that exists to produce the same HTML twice a week. Static generation on a
  CDN has no server to fall over and no hourly cost.
- The dynamic part is *ingestion* (writing a post), not *serving* it. So the API is
  small and auth-only; readers never touch it.
- Postgres over SQLite because PL/pgSQL is part of the point of this build.

**Trade-off:** publishing requires a rebuild (~40s) triggered by a deploy hook. Acceptable
for a few posts a month. The escape hatch is SSR on `/writing/[slug]` only.

**Consequence:** there is no always-on server. Nothing to bill hourly, nothing to keep
alive.

---

## Phase 0 status — DEFERRED

Phase 0 (stop the AWS bill, rotate credentials, create Cloudflare + Neon accounts) was
explicitly deferred so the repo skeleton could start first.

Still outstanding:

- [ ] Cost Explorer: identify the largest line item (free-tier expiry vs. load).
- [ ] Stop / terminate the EC2 instance; `pm2 stop all` first.
- [ ] Save `site.db` off the box if it still exists.
- [ ] Sweep orphaned Elastic IPs, EBS volumes, snapshots, NAT gateways.
- [ ] $5 monthly budget alarm.
- [ ] **Revoke** the R2 keys and `API_TOKEN` that lived in the old `.env`.

This must be closed before Phase 11. Until it is, the meter may still be running.
