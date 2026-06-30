#!/usr/bin/env bash
# Rebuild the site and deploy it as a Cloudflare Worker with static assets
# (config in wrangler.jsonc). The custom domain academy.binary-blender.com is
# already attached to the Worker, so a deploy is all that's needed to ship.
# Creds come from the environment, or fall back to the local key store.
set -euo pipefail
cd "$(dirname "$0")"

node build.mjs

KF="${KF:-/mnt/c/Users/chris/Documents/_Dev/agicore-foundry/api_keys.txt}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$(grep -i 'apit token' "$KF" | grep -oE 'cfat_[A-Za-z0-9]+')}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-34d5a9fc15e4c50e684ba6030e92d3fa}"

npx --yes wrangler@latest deploy
echo "Deployed → https://academy.binary-blender.com"
