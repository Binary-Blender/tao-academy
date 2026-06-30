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

## Deploy

**Live now:** https://binary-blender.github.io/tao-academy/
**Repo:** `Binary-Blender/tao-academy` — `main` holds the generator, `gh-pages`
holds the published site (served by GitHub Pages, branch `gh-pages`, root).

To publish an update:

```
./publish.sh        # rebuilds dist/ and force-pushes it to gh-pages
```

> Hosted on GitHub Pages rather than Azure Static Web Apps (the main site's host)
> because this environment had no Azure auth. To move to Azure for parity, create
> a Static Web App pointed at this repo's `gh-pages` branch (artifact location
> `/`) and the same custom-domain step below applies.

### Custom domain — academy.binary-blender.com

The site is reachable at the `github.io` URL above today. To put it on the
subdomain, two steps (both require access this build process doesn't have):

1. **DNS** — at the host for `binary-blender.com`, add a CNAME:
   `academy` → `binary-blender.github.io`
2. **Pages** — once DNS resolves, set the custom domain in
   repo → Settings → Pages → Custom domain = `academy.binary-blender.com`
   (this writes a `CNAME` file to `gh-pages` and enables HTTPS).

Do **not** set the Pages custom domain before DNS is live — Pages would redirect
the working `github.io` URL to a domain that doesn't resolve yet.

`staticwebapp.config.json` ships in `dist/` for a future Azure move; Pages ignores it.
