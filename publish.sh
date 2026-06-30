#!/usr/bin/env bash
# Rebuild the site and deploy it to Cloudflare Pages (project: tao-academy).
# Creds come from the environment, or fall back to the local key store.
# No secret is stored in this file.
set -euo pipefail
cd "$(dirname "$0")"

node build.mjs

KF="${KF:-/mnt/c/Users/chris/Documents/_Dev/agicore-foundry/api_keys.txt}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$(grep -i 'apit token' "$KF" | grep -oE 'cfat_[A-Za-z0-9]+')}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(grep -i 'account id' "$KF" | grep -oE '[0-9a-f]{32}')}"

npx --yes wrangler@latest pages deploy dist \
  --project-name tao-academy --branch main --commit-dirty=true
echo "Deployed → https://tao-academy.pages.dev (and academy.binary-blender.com)"
