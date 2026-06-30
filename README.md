# TAO Academy

Free AI-training website — the top-of-funnel attractor for Binary Blender.
Static HTML, cloned visual language from `binary-blender.com`, generated from
the existing course material in `_Skool`.

> Content is the attractor. The Build Day is the product.

## How it works

The `_Skool` folder tree **is** the database. `build.mjs` walks it, lifts the
`<body>` out of each already-authored lesson, strips the source's inline
`<style>`, and rebakes the content into the Academy shell (BB nav + footer,
breadcrumb, prev/next, funnel CTA). Zero dependencies.

```
node build.mjs        # → writes ./dist  (the deployable static site)
```

`dist/` is the artifact. Nothing else ships.

## Adding courses

Edit the `COURSES` array in `build.mjs`:

- `status: 'soon'` → renders as a "coming soon" card on the catalog. (name + blurb only)
- `status: 'live'` → add `src` (path under `_Skool`) and `modules` count; the
  generator renders the landing + every `module_NN_*.html` lesson and copies any
  linked assets (EPUBs, images). Re-run `node build.mjs`.

Currently live: **AI Audio Production** (25 lessons). Five more announced.
The wider library (Team AI Outreach, Theatrical AI Output, ~70 courses total)
is staged for the same treatment.

## Preview locally

Open `dist/index.html` directly in a browser, or:

```
cd dist && python3 -m http.server 8080   # → http://localhost:8080
```

## Deploy — academy.binary-blender.com

Static; deploy `dist/` to a new Azure Static Web App (sibling to the main site),
then point the `academy` subdomain at it.

1. New Static Web App (or `swa deploy ./dist`). App artifact location = `dist`.
2. In the SWA → **Custom domains**, add `academy.binary-blender.com`.
3. At the DNS host for `binary-blender.com`, add the CNAME the portal shows
   (`academy` → `<app>.azurestaticapps.net`), validate, done.

`staticwebapp.config.json` (copied into `dist/`) sets the SPA fallback + caching.
