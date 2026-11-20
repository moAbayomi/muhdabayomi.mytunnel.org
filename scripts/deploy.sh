#!/usr/bin/env bash
#
# One-command deploy for the wiki.
#
#   ./scripts/deploy.sh
#
# It does what a CLI can do:
#   1. create the R2 bucket (if missing)
#   2. set the Worker secrets (prompted, input hidden)
#   3. apply migrations to Neon
#   4. deploy the Worker
#   5. create the Pages project (if missing), build and deploy the site
#
# It cannot do the dashboard steps: custom domains/DNS and the Pages deploy
# hook. Those are listed at the end and in docs/deploy.md.
#
# Secrets are read with `read -s`, never echoed and never written to disk.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/api"
WRANGLER="$API/node_modules/.bin/wrangler"

if [ ! -x "$WRANGLER" ]; then
  echo "Dependencies are not installed. Run: pnpm install"
  exit 1
fi

if ! "$WRANGLER" whoami >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare. Run:"
  echo "  cd api && ./node_modules/.bin/wrangler login"
  exit 1
fi

read -rp "site origin [https://moyomi.xyz]: " WEB_ORIGIN
WEB_ORIGIN="${WEB_ORIGIN:-https://moyomi.xyz}"

echo "API URL used at build time. On the first deploy the custom API domain may"
echo "not resolve yet; use the Worker's *.workers.dev URL, then redeploy the site"
echo "after attaching the domain."
read -rp "api url [https://api.moyomi.xyz]: " PUBLIC_API_URL
PUBLIC_API_URL="${PUBLIC_API_URL:-https://api.moyomi.xyz}"

read -rp "pages project [wiki-web]: " PAGES_PROJECT
PAGES_PROJECT="${PAGES_PROJECT:-wiki-web}"

echo
echo "==> R2 bucket"
(cd "$API" && "$WRANGLER" r2 bucket create wiki-media) 2>/dev/null ||
  echo "    bucket already exists"

echo
echo "==> Worker secrets (hidden input; blank keeps the current value)"
DB_URL=""
printf "  DATABASE_URL: "
IFS= read -rs DB_URL
echo
if [ -n "$DB_URL" ]; then
  printf '%s' "$DB_URL" | (cd "$API" && "$WRANGLER" secret put DATABASE_URL) >/dev/null
  echo "    set"
else
  echo "    skipped"
fi

for name in ADMIN_PASSWORD AUTH_SECRET R2_PUBLIC_URL DEPLOY_HOOK_URL; do
  printf "  %s: " "$name"
  value=""
  IFS= read -rs value
  echo
  if [ -n "$value" ]; then
    printf '%s' "$value" | (cd "$API" && "$WRANGLER" secret put "$name") >/dev/null
    echo "    set"
  else
    echo "    skipped"
  fi
done

echo
if [ -n "$DB_URL" ]; then
  echo "==> migrations"
  (cd "$API" && DATABASE_URL="$DB_URL" ./node_modules/.bin/tsx scripts/migrate.ts)
else
  echo "==> migrations skipped (no DATABASE_URL given)"
fi

echo
echo "==> deploy Worker"
(cd "$API" && "$WRANGLER" deploy --var "WEB_ORIGIN:$WEB_ORIGIN")

echo
echo "==> Pages project"
"$WRANGLER" pages project create "$PAGES_PROJECT" --production-branch main \
  >/dev/null 2>&1 || echo "    project already exists"

echo
echo "==> build site against $PUBLIC_API_URL"
PUBLIC_API_URL="$PUBLIC_API_URL" pnpm --filter web build

echo
echo "==> deploy site"
"$WRANGLER" pages deploy "$ROOT/web/dist" --project-name "$PAGES_PROJECT"

cat <<EOF

Deployed. Remaining dashboard steps:

  1. Workers -> blog-api -> Settings -> Domains & Routes
     add  api.<your-domain>
  2. Pages -> $PAGES_PROJECT -> Custom domains
     add  <your-domain>
  3. Pages -> $PAGES_PROJECT -> Settings -> Deploy hooks
     create one, then:  cd api && ./node_modules/.bin/wrangler secret put DEPLOY_HOOK_URL

Verify:
  curl https://api.<your-domain>/v1/health
  open https://<your-domain>
EOF
