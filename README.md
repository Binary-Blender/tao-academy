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

**Live:** https://academy.binary-blender.com
**Host:** a Cloudflare **Worker with static assets** (`wrangler.jsonc`, worker
`tao-academy`, also at `tao-academy.chrisbender999.workers.dev`).
**Repo:** `Binary-Blender/tao-academy` (`main` = generator source; the code home).

To publish an update:

```
./publish.sh        # rebuilds dist/ and runs `wrangler deploy`
```

Creds come from env (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) or fall
back to the local key store at `_Dev/agicore-foundry/api_keys.txt`.

### Why a Worker, not Pages

The deploy token has `Workers:Edit` + zone read but **not** `Zone:DNS:Edit`.
Attaching a custom domain to a Worker via the Workers domains API
(`PUT /accounts/{id}/workers/domains`) auto-provisions the DNS record **and** the
TLS cert as a managed side effect — no DNS:Edit required. Pages' custom-domain
flow did not, so the site was moved onto a Worker. `academy.binary-blender.com`
is already attached; `./publish.sh` just pushes new content to it.

`staticwebapp.config.json` ships in `dist/` but is inert here.
