#!/usr/bin/env bash
# Rebuild the site and publish it to the gh-pages branch (what GitHub Pages serves).
# Reads the authenticated remote from `origin` — no token is stored in this file.
set -euo pipefail
cd "$(dirname "$0")"

node build.mjs

REMOTE=$(git remote get-url origin)
STAGE=$(mktemp -d)
cp -r dist/. "$STAGE/"
touch "$STAGE/.nojekyll"                       # tell Pages not to run Jekyll
git -C "$STAGE" init -q -b gh-pages
git -C "$STAGE" add -A
git -C "$STAGE" -c user.email=chrisbender999@gmail.com -c user.name="Christopher Bender" \
    commit -q -m "Publish TAO Academy"
git -C "$STAGE" push -f "$REMOTE" gh-pages
rm -rf "$STAGE"
echo "Published → https://binary-blender.github.io/tao-academy/"
