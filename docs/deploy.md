# Deploy runbook

Everything here is done from **your** machine or the Cloudflare/Neon/GitHub
dashboards. The repository is ready for it; these are the account steps.

## Fast path

```bash
cd api && ./node_modules/.bin/wrangler login   # once
cd .. && ./scripts/deploy.sh
```

`scripts/deploy.sh` is a plain bash script — not part of Astro. It runs the
`wrangler` and `pnpm` commands from this runbook in order; open it and read it
before running it. It creates the R2 bucket, prompts for the Worker secrets (hidden
input), applies migrations, deploys the Worker, creates the Pages project, builds and
deploys the site. It cannot attach custom domains/DNS or create the Pages deploy
hook — those are steps 3–5 below.

## Daily workflow (after setup)

There are two kinds of change, and they take two paths.

**Code** — pages, styles, the API. Commit and push to `main`. The workflow in
`.github/workflows/deploy.yml` typechecks, deploys the Worker, builds the site and
uploads it to Pages. That is the whole process: `git push`. No local commands.

**Content** — notes edited in `/admin`. Those live in Postgres, not git. After
publish, unpublish or delete, the editor calls `POST /v1/admin/rebuild`. That
endpoint starts a build one of two ways:

1. `DEPLOY_HOOK_URL` — a Pages deploy hook. Only works if the Pages project is
   connected to Git, because a hook triggers a *build*.
2. `GITHUB_TOKEN` + `GITHUB_REPO` — dispatches `deploy.yml` on GitHub. This works
   with **Direct Upload** projects (what `wrangler pages deploy` creates), and keeps
   CI as the single deploy path.

Set one. For the GitHub path:

```bash
cd api
wrangler secret put GITHUB_TOKEN   # fine-grained PAT: Actions = Read and write
wrangler secret put GITHUB_REPO    # e.g. moAbayomi/<repo-name>
wrangler secret put GITHUB_REF     # main (optional; defaults to main)
```

The workflow file must exist on the default branch for dispatch to work.

### One-time setup for `git push`

1. **Push the branch the workflow listens on.** It is `main`. If your work is on
   another branch, merge it first.
2. **GitHub → Settings → Secrets and variables → Actions**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; optional
     `DATABASE_URL_TEST`.
   - Variables: `WEB_ORIGIN`, `PUBLIC_API_URL`, `PAGES_PROJECT`.
3. **Worker secrets** (step 3 below) are set once. A push does not change them.

Without those secrets the workflow fails on the first run; the Actions log names
the missing one.

## What gets deployed

| Piece | Where | How |
|---|---|---|
| `api/` | Cloudflare Worker | `wrangler deploy` in the `api` job |
| `web/` | Cloudflare Pages | `wrangler pages deploy web/dist` in the `web` job |
| notes | Neon Postgres | `scripts/migrate.ts` |
| images | Cloudflare R2 | `wiki-media` bucket |

The web build **fetches the API at build time**, so the API must be deployed and
reachable before the web job runs. The workflow enforces this with `needs: api`.

---

## 1. Neon

1. Create a project. Copy the **pooled** connection string.
2. Run the migrations against it:

   ```bash
   cd api
   DATABASE_URL="postgres://…" ./node_modules/.bin/tsx scripts/migrate.ts
   ```

   `0017_seed.sql` inserts the seed notes; it is idempotent. On a database that
   already has content it is a no-op.
3. **Optional:** create a second Neon branch (or a local dev database) and set
   `DATABASE_URL_TEST`. The integration tests create and delete notes, so they
   must never run against production. If that secret is absent, CI skips the
   tests and still deploys — run them yourself with `pnpm --filter api test`
   against a dev database.

## 2. R2

1. Create a bucket named `wiki-media` (or change `bucket_name` in
   `api/wrangler.jsonc`).
2. Enable a public URL — a custom domain (`media.moyomi.xyz`) or
   `r2.dev` for now. Note the base URL; it becomes `R2_PUBLIC_URL`.
3. Uploads are served through `R2_PUBLIC_URL` when set, otherwise through
   `/v1/media/<key>`.

## 3. Worker secrets

From `api/`, once per environment:

```bash
wrangler secret put DATABASE_URL       # Neon pooled URL
wrangler secret put ADMIN_PASSWORD     # the editor password
wrangler secret put AUTH_SECRET        # openssl rand -base64 32
wrangler secret put R2_PUBLIC_URL      # https://media…
# Pick ONE rebuild method:
wrangler secret put DEPLOY_HOOK_URL    # Git-connected Pages (step 5)
# or:
wrangler secret put GITHUB_TOKEN       # fine-grained PAT, Actions: read and write
wrangler secret put GITHUB_REPO        # owner/repo
wrangler secret put GITHUB_REF         # main (optional)
```

`WEB_ORIGIN` is passed at deploy time by the workflow (`--var WEB_ORIGIN:…`), so
it is not a secret. Locally, all of these live in `api/.dev.vars`.

> Secrets are **not** declared in `wrangler.jsonc`. If you add a name there with
> an empty value, `wrangler deploy` ships the empty string when the secret is
> missing — which breaks auth silently instead of failing.

Deploy once by hand to confirm:

```bash
cd api
wrangler deploy --var WEB_ORIGIN:https://moyomi.xyz
curl https://blog-api.<your-subdomain>.workers.dev/v1/health
```

Then attach the custom domain `api.moyomi.xyz` in the Workers
dashboard and update `WEB_ORIGIN` in the workflow variables to the site origin.

## 4. Cloudflare Pages

1. Create a project (Direct Upload is fine; CI uploads the build).
2. Project name → the `PAGES_PROJECT` GitHub variable.
3. Custom domain → `moyomi.xyz`.
4. The Pages project needs no build command of its own; the workflow builds.

## 5. Deploy hook

Pages → Settings → Builds & deployments → **Deploy hooks** → create one.
Its URL is `DEPLOY_HOOK_URL`; `POST /v1/admin/rebuild` calls it after publishing.

Until it is set, `POST /v1/admin/rebuild` returns `503 rebuild_not_configured`,
and the editor reports "rebuild not configured yet" — publishing still works,
the site just does not refresh.

## 6. GitHub secrets and variables

**Secrets** (Settings → Secrets → Actions):

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token with Workers + Pages + R2 edit |
| `CLOUDFLARE_ACCOUNT_ID` | from the Cloudflare dashboard |
| `DATABASE_URL_TEST` | *(optional)* Neon dev branch or local dev database — tests create/delete rows |

**Variables** (Settings → Variables → Actions):

| Name | Value |
|---|---|
| `WEB_ORIGIN` | `https://moyomi.xyz` |
| `PUBLIC_API_URL` | `https://api.moyomi.xyz` |
| `PAGES_PROJECT` | the Pages project name |

The first push to `main` runs `.github/workflows/deploy.yml`.

## 7. Verify

- [ ] `curl https://api.<domain>/v1/health` → `{"ok":true,…}`
- [ ] `curl https://api.<domain>/v1/directory` → JSON array
- [ ] `https://<domain>/` renders with real counts
- [ ] `https://<domain>/directory` lists notes and the filter works
- [ ] a note page shows **Linked from**
- [ ] `https://<domain>/rss.xml` validates
- [ ] `/admin` → log in → edit → **publish** → the site updates after the rebuild
- [ ] image upload renders from R2
- [ ] `https://<domain>/robots.txt` has the right sitemap URL

## 8. Close Phase 0

- [ ] EC2 instance stopped or terminated
- [ ] $5 AWS budget alarm active
- [ ] old R2 keys and `API_TOKEN` revoked

## Notes

- **Commit `pnpm-lock.yaml`.** CI installs with `--frozen-lockfile`; if the
  lockfile is stale (for example after adding `p5`), the workflow fails
  immediately.
- **Monorepo install:** `pnpm install` must be run once locally after pulling
  so the workspace links match the lockfile.
- **Database migrations are not run by the workflow.** Apply them deliberately
  (`db:migrate`) before deploying; a migration failure should not be able to
  half-deploy an app.
