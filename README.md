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

**Live:** https://tao-academy.pages.dev — host: **Cloudflare Pages** (project `tao-academy`).
**Repo:** `Binary-Blender/tao-academy` (`main` = generator source; this is the
code home, not the host).

To publish an update:

```
./publish.sh        # rebuilds dist/ and runs `wrangler pages deploy`
```

Creds come from env (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) or fall
back to the local key store at `_Dev/agicore-foundry/api_keys.txt`.

### Custom domain — academy.binary-blender.com

The `binary-blender.com` zone is on the same Cloudflare account, so the custom
domain is bound to the Pages project. The only remaining piece is the DNS record
(the deploy token lacks DNS:Edit):

- In the Cloudflare dashboard → `binary-blender.com` → DNS, add:
  **CNAME `academy` → `tao-academy.pages.dev`**, proxied (orange cloud).

It goes live (with auto HTTPS) within a minute of that record existing.
`staticwebapp.config.json` ships in `dist/` but is inert on Pages.
