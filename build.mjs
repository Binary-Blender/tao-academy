// ============================================================
//  TAO Academy — static site generator
//  Zero dependencies. The _Skool folder tree IS the database;
//  this script discovers courses by walking it and emits a
//  deployable static site into ./dist.
//
//  A "course" is any directory containing BOTH index.html and
//  at least one module_NN_*.html lesson. Program = the top
//  whitelisted root; level = the Free/Premium/VIP segment in
//  the path, relabelled (everything here is free).
//
//  Source lessons are already standalone HTML with their own
//  inline <style>. We lift the <body>, drop the inline style,
//  and rebake the content into the Academy shell (BB look,
//  breadcrumb, prev/next, funnel CTA).
//
//  Run:  node build.mjs        → writes ./dist
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKOOL = '/mnt/c/Users/chris/Documents/_Skool';
const DIST = join(__dirname, 'dist');

// --- Funnel destinations (point back into the Binary Blender funnel) ---
const MAIN_SITE = 'https://www.binary-blender.com';
const APPS_URL  = `${MAIN_SITE}/apps.html`;
const SHOP_URL = 'https://www.binary-blender.com/shop';

// Filled in by renderCourse: { slug: { title, rawTitle, file, back, fontSize } } — baked into read.html.
const BOOKS = {};

// Courses whose textbook lives outside a Textbook/ folder (so auto-detect misses
// it) but is an unambiguous 1:1 match. Path relative to _Skool.
// Value is an epub path (string), OR { path, title } when a course's companion
// book carries a title different from the course title. Path is relative to _Skool.
const MANUAL_TEXTBOOKS = {
  'cognition-systems-engineering': 'Textbooks/Cognition Systems Engineering/CSE Textbook/cognition_systems_engineering.epub',
  'the-one-person-enterprise': 'AI Business School/The One-Person Enterprise/the_one_person_enterprise.epub',
  'ai-creative-direction': 'AI Art Textbooks/AI Creative Director Textbook/the_ai_creative_director.epub',
};
function manualTextbook(slug) {
  const mt = MANUAL_TEXTBOOKS[slug];
  if (!mt) return null;
  const path = typeof mt === 'string' ? mt : mt.path;
  return { absEpub: join(SKOOL, path), filename: basename(path), title: typeof mt === 'object' ? mt.title : null };
}

// The curated on-ramp: foundational courses in increasing order. These lead the
// catalog (a "Start Here" path) and sort first within their program block.
const FEATURED_PATH = ['mastering-ai-prompts', 'how-to-use-your-strategic-ai', 'stop-being-the-bottleneck'];

// --- Programs to scan, in catalog order. The label is what the visitor sees. ---
// The 'Team AI Outreach' folder is displayed as 'The AI MBA' — that's the
// AI WIN-WIN Institute's public brand for this business-focused ladder. See
// aiwinwin.binary-blender.com/ai-mba for the marketing surface / track map.
const PROGRAMS = [
  { dir: 'Tactical AI Orchestration', label: 'Tactical AI Orchestration', blurb: 'The flagship and its orbit — the TAO methodology itself, the core techniques (prompt craft, strategy, orchestration), and the graduate-level theory that grounds it: Cognition Systems Engineering, the Formless Response, Mind Breeding.' },
  { dir: 'Team AI Outreach', label: 'The AI MBA', blurb: 'The AI WIN-WIN Institute’s business curriculum. Twenty-four courses across eight tracks in groups of three — launch, operate, compound, then fork into a people path or a content path.' },
  { dir: 'Theatrical AI Output', label: 'Theatrical AI Output', blurb: 'The AI-native creator studio — produce video, sound, and a content engine that runs without you.' },
  { dir: 'AI Business School', label: 'AI Business School', blurb: 'Run a one-person enterprise with AI doing the heavy lifting.' },
  { dir: 'AI Creative Direction', label: 'AI Creative Direction', blurb: 'Direct AI like a creative lead — taste, judgment, and a house style.' },
];

// Two programs are ordered by track/ladder, not alphabetically:
//   - The AI MBA (aiwinwin.binary-blender.com/ai-mba)
//   - Theatrical AI Output (algorithmic-arts.binary-blender.com/tao)
// The lists below are the source of truth for course order within each
// program. If a course exists in the folder but isn't listed here, it
// falls to the end. PROGRAM_ORDERS maps label → order array so the sort
// logic in both the discovery loop and programSection can look up which
// program (if any) needs a track order.

const AI_MBA_ORDER = [
  // Track 0 · Promote (warm-up)
  'the-promotion', 'the-decision-stack', 'the-executive-operating-system',
  // Track 1 · Launch
  'document-your-expertise', 'your-first-ai-powered-offer', 'marketing-assets-in-a-weekend',
  // Track 2 · Operate
  'stop-doing-everything-yourself', 'client-delivery-at-scale', 'content-that-runs-without-you',
  // Track 3 · Compound
  'think-like-a-strategist', 'build-once-sell-forever', 'the-one-person-empire',
  // Track 4 · Multiply (People path)
  'transform-mindset-and-roles', 'augment-your-team-with-ai', 'optimize-for-impact',
  // Track 4 · Produce (Content path)
  'the-content-production-system', 'video-that-sells', 'the-one-person-studio',
  // Track 5 · Publish
  'the-book-you-already-wrote', 'the-knowledge-product', 'the-publishing-business',
  // Track 6 · Master
  'the-codes', 'the-judgment-layer', 'the-compound-operator',
];

const THEATRICAL_AI_OUTPUT_ORDER = [
  // Track 0 · Speed Run (warm-up)
  'innovator-or-hater', 'the-100-video-problem', 'find-your-voice',
  // Track 1 · Production Studio
  'sound-design-for-youtubers', 'visual-firepower', 'the-complete-video-pipeline',
  // Track 2 · Content Engine
  'the-ideation-machine', 'ai-as-your-writing-room', 'batch-production',
  // Track 3 · Business
  'packaging-that-earns-the-click', 'growth-and-monetization', 'the-sustainable-creator',
  // Track 4 · Advanced Production (Pro path)
  'retention-mastery', 'multi-model-orchestration', 'the-creators-studio',
  // Track 5 · Expand (Pro path)
  'the-book-you-already-made', 'course-products-for-creators', 'the-multi-platform-empire',
  // Track 6 · Master (Pro path)
  'the-creators-code', 'taste-and-judgment', 'the-compound-creator',
  // Track 4 · Punk Rock AI (VIP path — the fast fork)
  'the-manifesto', 'the-toolkit', 'the-zine',
];

const PROGRAM_ORDERS = {
  'The AI MBA': AI_MBA_ORDER,
  'Theatrical AI Output': THEATRICAL_AI_OUTPUT_ORDER,
};

// Curated sub-sections for the flagship program — turn its grab-bag into a
// legible path: the core techniques, then the graduate-level capstone, then
// applied craft. Any course in the program not listed here falls into a final
// "More in this program" block, so nothing is ever lost. 'tao' is intentionally
// omitted — it's the hero feature at the top of the page.
const SUBSECTIONS = {
  'Tactical AI Orchestration': [
    { label: 'Core Techniques', blurb: 'The everyday practitioner skills — prompt craft, strategy, and getting the work off your plate.',
      slugs: ['mastering-ai-prompts', 'how-to-use-your-strategic-ai', 'stop-being-the-bottleneck', 'skill-libraries-for-ai', 'multi-model-orchestration', 'building-with-claude-code'] },
    { label: 'The Capstone · Synmatic', blurb: 'The graduate-level theory that grounds the practice — the formal spine of the methodology.',
      slugs: ['cognition-systems-engineering', 'mind-breeding', 'the-formless-response', 'thin-the-veil-real-world-mmos', 'advanced-ambient-ai', 'ai-assisted-architecture', 'the-novasyn-dev-stacks'] },
    { label: 'Applied Craft', blurb: 'The method turned on specific work — writing, building, shipping.',
      slugs: ['romance-realms', 'software-assassination-service', 'the-archive-intensive', 'the-workshop'] },
  ],
};

// Return a rank(slug) function for label, or null if the program uses the
// default level+alpha sort. Missing slugs sort to the end of the list.
function programRank(label) {
  const order = PROGRAM_ORDERS[label];
  if (!order) return null;
  return (slug) => {
    const i = order.indexOf(slug);
    return i === -1 ? order.length : i;
  };
}

// Free/Premium/VIP → neutral level labels (everything on TAO Academy is free).
const LEVELS = [
  { match: /vip/i,            label: 'Mastery',     rank: 2 },
  { match: /premium/i,        label: 'Advanced',    rank: 1 },
  { match: /free/i,           label: 'Foundations', rank: 0 },
];
const levelFor = (segments) => {
  for (const seg of segments) for (const L of LEVELS) if (L.match.test(seg)) return L;
  return { label: 'Core', rank: 0 };
};

// ---------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------
const grab = (html, re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
const bodyOf  = (html) => grab(html, /<body[^>]*>([\s\S]*?)<\/body>/i);
const h1Of    = (html) => grab(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '').trim();
const decode  = (s) => s.replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/&[a-z]+;/g, ' ').trim();
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function shortTitle(rawTitle) {
  const t = decode(rawTitle).replace(/\s+(—|–|-)\s+(Free Course|Course Index|Course)\s*$/i, '');
  return t.split(/\s+(?:—|–)\s+/)[0].trim() || t;
}
function blurbFrom(idxHtml) {
  const intro = grab(idxHtml, /<p class="intro"[^>]*>([\s\S]*?)<\/p>/i) || grab(idxHtml, /<body[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  let t = decode(stripTags(intro));
  if (t.length > 175) t = t.slice(0, 172).replace(/\s+\S*$/, '') + '…';
  return t;
}
function kebab(s) {
  return decode(s).toLowerCase()
    .replace(/^\s*\d+\s*[-_.]*\s*/, '')   // drop leading "01_", "01 - "
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
}
function ensureDir(p) { mkdirSync(p, { recursive: true }); }

// Neutralize links/images whose targets won't exist in the output. The source
// courses carry pre-existing dead cross-references (renamed/placeholder modules,
// EPUB-internal .xhtml). Unwrap dead anchors to plain text; drop missing images.
function neutralize(html, validRel) {
  const isExternal = (u) => /^(https?:|mailto:|#|\/\/|data:|tel:)/i.test(u);
  const norm = (u) => u.replace(/^\.\//, '').split(/[?#]/)[0];
  html = html.replace(/<a\b[^>]*?\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (m, href, inner) => (isExternal(href) || validRel.has(norm(href))) ? m : inner);
  html = html.replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi,
    (m, src) => (/^(https?:|\/\/|data:)/i.test(src) || validRel.has(norm(src))) ? m : '');
  return html;
}

// ---------------------------------------------------------------
//  Discovery — walk a program root, return its courses
// ---------------------------------------------------------------
function isCourseDir(dir) {
  let entries; try { entries = readdirSync(dir); } catch { return false; }
  return entries.includes('index.html') && entries.some((f) => /^module_\d+.*\.html$/i.test(f));
}
// Find a companion textbook: a Textbook/ (or textbook/) folder holding an .epub,
// either inside the course dir or beside it (the course often sits at <X>/course
// while the book sits at <X>/Textbook). Returns { absEpub, filename } or null.
function findTextbook(courseDir) {
  for (const base of [courseDir, dirname(courseDir)]) {
    let entries; try { entries = readdirSync(base, { withFileTypes: true }); } catch { continue; }
    const tb = entries.find((e) => e.isDirectory() && /^textbook$/i.test(e.name));
    if (!tb) continue;
    const dir = join(base, tb.name);
    let epub; try { epub = readdirSync(dir).find((f) => /\.epub$/i.test(f)); } catch { continue; }
    if (epub) return { absEpub: join(dir, epub), filename: epub };
  }
  return null;
}
function discover(program, usedSlugs) {
  const root = join(SKOOL, program.dir);
  const courses = [];
  const walk = (dir) => {
    if (isCourseDir(dir)) { courses.push(makeCourse(program, dir, usedSlugs)); return; } // don't recurse into a course
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isDirectory()) walk(join(dir, e.name));
  };
  walk(root);
  return courses;
}
function makeCourse(program, srcAbs, usedSlugs) {
  const idxHtml = readFileSync(join(srcAbs, 'index.html'), 'utf8');
  const rawTitle = grab(idxHtml, /<title[^>]*>([\s\S]*?)<\/title>/i) || h1Of(idxHtml);
  const rel = relative(SKOOL, srcAbs);
  const segments = rel.split(/[\\/]/);
  const leaf = segments[segments.length - 1];
  const base = (/^course$/i.test(leaf) ? segments[segments.length - 2] : leaf) || leaf;
  let slug = kebab(base);
  while (usedSlugs.has(slug)) slug = slug.replace(/(-\d+)?$/, (m) => `-${(parseInt(m.slice(1)) || 1) + 1}`);
  usedSlugs.add(slug);
  const modules = readdirSync(srcAbs).filter((f) => /^module_\d+.*\.html$/i.test(f)).length;
  return {
    slug, srcAbs, modules,
    program: program.label,
    level: levelFor(segments),
    title: shortTitle(rawTitle),
    blurb: blurbFrom(idxHtml),
    textbook: findTextbook(srcAbs) || manualTextbook(slug),
  };
}

// ---------------------------------------------------------------
//  Site chrome
// ---------------------------------------------------------------
function nav(root, active) {
  const a = (href, label, cls = '') => `<a href="${href}"${cls ? ` class="${cls}"` : ''}>${label}</a>`;
  // The <div data-portfolio-switch> gets replaced by the shared portfolio
  // switcher loaded from binary-blender.com/portfolio-switch.js — see
  // <head> injection in page(). The old "Binary Blender ↗" nav link is
  // pulled since the switcher already surfaces the family.
  return `<nav>
  <div data-portfolio-switch></div>
  <button class="nav-toggle" aria-label="Toggle navigation">&#9776;</button>
  <div class="nav-links">
    ${a(`${root}index.html`, 'Courses', active === 'home' ? 'active' : '')}
    ${a(APPS_URL, 'Free Apps')}
    ${a(SHOP_URL, 'Shop', 'nav-cta')}
  </div>
</nav>`;
}
function footer(root) {
  return `<footer>
  <div class="footer-content">
    <div class="footer-logo">TAO Academy</div>
    <div class="footer-links">
      <a href="${root}index.html">All Courses</a>
      <a href="${APPS_URL}">Free Apps</a>
      <a href="${MAIN_SITE}">Binary Blender</a>
      <a href="${SHOP_URL}">Shop</a>
      <a href="mailto:chrisbender999@gmail.com">Contact</a>
    </div>
  </div>
  <div class="footer-bottom"><p>&copy; 2026 Binary Blender &middot; TAO Academy. Free forever. Built to be given away.</p></div>
</footer>`;
}
function page({ root, title, active = '', main }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="${root}academy.css">
<script src="https://binary-blender.com/portfolio-switch.js" defer></script>
<script src="https://binary-blender.com/announcement-bar.js" defer></script>
</head>
<body>
${nav(root, active)}
${main}
${footer(root)}
<script>
document.querySelector('.nav-toggle')?.addEventListener('click', function () {
  document.querySelector('.nav-links')?.classList.toggle('open');
});
</script>
</body>
</html>`;
}
function lessonCta() {
  return `<div class="lesson-cta">
  <h3>Want this run inside your team?</h3>
  <p>The courses are free forever. When you're ready to put it into production, we build a custom AI-powered app on your hardware in a day.</p>
  <a href="${SHOP_URL}" class="cta-button">Visit the Shop</a>
</div>`;
}

// ---------------------------------------------------------------
//  Render one course (landing + every lesson + linked assets)
// ---------------------------------------------------------------
function renderCourse(course) {
  const root = '../../';
  const srcDir = course.srcAbs;
  const outDir = join(DIST, 'courses', course.slug);
  ensureDir(outDir);

  const files = readdirSync(srcDir).filter((f) => /^module_\d+.*\.html$/i.test(f)).sort();
  const lessons = files.map((file) => {
    const html = readFileSync(join(srcDir, file), 'utf8');
    return { file, html, label: h1Of(html) || file };
  });
  const idxHtml = readFileSync(join(srcDir, 'index.html'), 'utf8');

  // The set of paths that WILL exist in the output: the landing, every lesson,
  // and any linked asset we can copy. Bodies are neutralized against this so no
  // dead link survives. `..` refs (escapes) are never copied → get unwrapped.
  const validRel = new Set(['index.html', ...files]);
  for (const m of [idxHtml, ...lessons.map((l) => l.html)].join('\n').matchAll(/(?:src|href)="([^"]+)"/gi)) {
    const ref = m[1];
    if (/^(https?:|mailto:|#|\/\/|module_)/i.test(ref)) continue;
    if (/\.html?(\?|#|$)/i.test(ref)) continue;
    if (ref.includes('..')) continue;
    if (!/\.[a-z0-9]{2,5}(\?|#|$)/i.test(ref)) continue;
    const rel = ref.split(/[?#]/)[0];
    try {
      const dest = join(outDir, rel); ensureDir(dirname(dest));
      copyFileSync(join(srcDir, rel), dest);
      validRel.add(rel.replace(/^\.\//, ''));
    } catch { /* referenced but absent in source → stays out of validRel, link unwrapped */ }
  }

  // Companion textbook — copy the EPUB in, register it for the reader, and
  // surface Read-online / Download buttons at the top of the course landing.
  let textbookCard = '';
  if (course.textbook) {
    // Use a distinct `book/` dir (not `textbook/`) so a case-insensitive local FS
    // can't collide it with a module-linked `Textbook/` copy — which would break
    // the manifest path on case-sensitive Cloudflare.
    const outEpub = join(outDir, 'book', course.textbook.filename);
    ensureDir(dirname(outEpub));
    copyFileSync(course.textbook.absEpub, outEpub);
    const bookTitle = course.textbook.title || course.title;
    BOOKS[course.slug] = {
      title: `${bookTitle} <em>&mdash; the textbook</em>`,
      rawTitle: bookTitle,
      file: `courses/${course.slug}/book/${course.textbook.filename}`,
      back: { href: `courses/${course.slug}/index.html`, label: course.title },
      fontSize: '110%',
    };
    textbookCard = `<div class="textbook-card">
    <div class="tb-icon">📖</div>
    <div class="tb-meta">
      <span class="tb-label">Companion textbook</span>
      <span class="tb-title">${bookTitle} &mdash; The Complete Textbook</span>
    </div>
    <div class="tb-actions">
      <a class="cta-button" href="${root}read.html?course=${course.slug}">Read online</a>
      <a class="cta-button outline" href="book/${course.textbook.filename}" download>Download EPUB</a>
    </div>
  </div>`;
  }

  // Course landing — source index.html body, neutralized.
  const landingMain = `<div class="reading-shell">
  <div class="breadcrumb"><a href="${root}index.html">TAO Academy</a> &rsaquo; <span>${course.program}</span> &rsaquo; ${course.title}</div>
  ${textbookCard}
  <article class="reading">${neutralize(bodyOf(idxHtml), validRel)}</article>
  ${lessonCta()}
</div>`;
  writeFileSync(join(outDir, 'index.html'),
    page({ root, title: `${course.title} — TAO Academy`, main: landingMain }));

  // Each lesson.
  lessons.forEach((lesson, i) => {
    const prev = lessons[i - 1], next = lessons[i + 1];
    const navLink = (l, dir, cls) => l
      ? `<a class="${cls}" href="${l.file}"><span class="ln-dir">${dir}</span><span class="ln-title">${l.label}</span></a>`
      : `<a class="${cls} disabled"></a>`;
    const main = `<div class="reading-shell">
  <div class="breadcrumb"><a href="${root}index.html">TAO Academy</a> &rsaquo; <a href="index.html">${course.title}</a> &rsaquo; ${lesson.label}</div>
  <article class="reading">${neutralize(bodyOf(lesson.html), validRel)}</article>
  <nav class="lesson-nav">
    ${navLink(prev, '← Previous', 'prev')}
    ${navLink(next, 'Next →', 'next')}
  </nav>
  ${lessonCta()}
</div>`;
    writeFileSync(join(outDir, lesson.file),
      page({ root, title: `${lesson.label} — ${course.title}`, main }));
  });

  return lessons.length;
}

// ---------------------------------------------------------------
//  Catalog home (grouped by program, level badge per card)
// ---------------------------------------------------------------
function renderCatalog(byProgram, totals) {
  const card = (c) => `<a class="course-card" href="courses/${c.slug}/index.html">
      <div class="cc-top"></div>
      <div class="cc-body">
        <div class="course-meta"><span class="pill free">Free</span><span class="pill level lvl-${c.level.rank}">${c.level.label}</span><span class="pill modules">${c.modules} lessons</span>${c.textbook ? '<span class="pill book">📖 Textbook</span>' : ''}</div>
        <h3>${c.title}</h3>
        <p>${c.blurb}</p>
        <span class="cc-link">Start the course &rarr;</span>
      </div></a>`;

  const bySlug = new Map();
  for (const list of byProgram.values()) for (const c of list) bySlug.set(c.slug, c);
  const featuredRank = (slug) => { const i = FEATURED_PATH.indexOf(slug); return i === -1 ? FEATURED_PATH.length : i; };

  const pathStep = (slug, n) => {
    const c = bySlug.get(slug); if (!c) return '';
    return `<a class="path-step" href="courses/${c.slug}/index.html">
        <span class="path-num">${n}</span>
        <span class="path-body">
          <span class="path-title">${c.title}${c.textbook ? ' <span class="tb-dot" title="Includes a textbook">📖</span>' : ''}</span>
          <span class="path-desc">${c.blurb}</span>
        </span>
      </a>`;
  };
  // The flagship feature — the TAO course, elevated and framed by the four
  // readings of its own name (the four tiers). This is the front door.
  const flagshipCourse = bySlug.get('tao');
  const flagshipLessons = flagshipCourse ? flagshipCourse.modules : 27;
  const tierRows = [
    ['1', 'Think &middot; Attune &middot; Observe', 'Be the practitioner &mdash; the daily operating system.'],
    ['2', 'Tactical AI Orchestration', 'Build the systems &mdash; the eight production principles.'],
    ['3', 'Transform &middot; Augment &middot; Optimize', 'Lead the org &mdash; multiplication, not replacement.'],
    ['4', 'The Mastery', 'The dark arts &amp; the formal spine.'],
  ].map(([n, k, v]) => `<div class="ft"><span class="ft-n">${n}</span><span class="ft-t"><b>${k}</b><span>${v}</span></span></div>`).join('\n      ');
  const flagship = `<section class="section flagship" id="flagship">
  <style>
    .flagship{background:linear-gradient(160deg,#08201c,#0d1524);color:#e6f2ef;border-radius:18px;padding:2.6rem 2rem;margin:1.4rem auto;max-width:1120px;}
    .flagship .feyebrow{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:#2dd4bf;}
    .flagship h2{color:#fff;font-size:clamp(1.6rem,4vw,2.1rem);margin:.5rem 0 .5rem;letter-spacing:-.01em;}
    .flagship .fthesis{color:#a7c4bd;max-width:62ch;line-height:1.65;margin:0 0 1.6rem;}
    .flagship .fthesis b{color:#7fe7d0;}
    .flagship .ftiers{display:grid;grid-template-columns:repeat(2,1fr);gap:.7rem;margin:0 0 1.6rem;}
    .flagship .ft{display:flex;gap:.7rem;align-items:flex-start;background:rgba(45,212,191,.06);border:1px solid rgba(45,212,191,.22);border-radius:10px;padding:.85rem .95rem;}
    .flagship .ft-n{font-family:ui-monospace,Menlo,monospace;font-weight:700;color:#08201c;background:#2dd4bf;border-radius:6px;padding:.08rem .5rem;font-size:.8rem;flex:none;}
    .flagship .ft-t b{display:block;color:#e6f2ef;font-size:.95rem;}
    .flagship .ft-t>span{color:#8fb3ab;font-size:.85rem;line-height:1.45;}
    .flagship .fbook{color:#7f9b94;font-size:.85rem;margin:1.1rem 0 0;}
    .flagship .fbook em{color:#a7c4bd;font-style:italic;}
    .flagship .cta-button{background:#2dd4bf;color:#08201c;border:none;font-weight:700;}
    .flagship .cta-button:hover{background:#7fe7d0;}
    @media(max-width:640px){.flagship .ftiers{grid-template-columns:1fr;}}
  </style>
  <span class="feyebrow">The Flagship</span>
  <h2>Tactical AI Orchestration</h2>
  <p class="fthesis">AI is a manufacturing problem &mdash; quality is built in at every stage, not inspected at the end. One methodology, taught as a daily practice, then built up into systems, leadership, and mastery: <b>four readings of its own name.</b></p>
  <div class="ftiers">
      ${tierRows}
  </div>
  <div class="cta-buttons"><a href="courses/tao/index.html" class="cta-button">Start the flagship &rarr; ${flagshipLessons} lessons</a></div>
  <p class="fbook">Comes with its own textbook &mdash; <em>TAO: The Way of AI Orchestration</em> &mdash; plus the companion reads <em>Seven Habits of Highly Effective AI Engineers</em> &amp; <em>Atomic AI</em>. Graduate track: <em>Cognition Systems Engineering</em>.</p>
</section>`;

  const startHere = `<section class="section start-here" id="start">
  <h2>Then &mdash; three on-ramps.</h2>
  <p class="section-subtitle">Not sure where to branch after the flagship? Take these three in order &mdash; prompt craft, then strategy, then getting the work off your plate &mdash; and the rest of the library opens up.</p>
  <div class="path-row">
    ${FEATURED_PATH.map((s, i) => pathStep(s, i + 1)).join('\n    ')}
  </div>
</section>`;

  const gridBlock = (label, blurb, list) => `<div class="subsection">
      <h3 class="subsection-label">${label}</h3>${blurb ? `\n      <p class="subsection-blurb">${blurb}</p>` : ''}
      <div class="course-grid">
        ${list.map(card).join('\n        ')}
      </div>
    </div>`;

  const programSection = (p) => {
    const rank = programRank(p.label);
    const courses = (byProgram.get(p.label) || []).slice()
      .filter((c) => c.slug !== 'tao')   // the flagship is the hero feature above
      .sort((a, b) =>
        rank
          ? rank(a.slug) - rank(b.slug)
          : featuredRank(a.slug) - featuredRank(b.slug) || a.level.rank - b.level.rank || a.title.localeCompare(b.title)
      );
    if (!courses.length) return '';

    let inner;
    const subs = SUBSECTIONS[p.label];
    if (subs) {
      const placed = new Set();
      const blocks = [];
      for (const sub of subs) {
        const list = sub.slugs.map((s) => bySlug.get(s)).filter((c) => c && c.program === p.label && !placed.has(c.slug));
        list.forEach((c) => placed.add(c.slug));
        if (list.length) blocks.push(gridBlock(sub.label, sub.blurb, list));
      }
      const rest = courses.filter((c) => !placed.has(c.slug));
      if (rest.length) blocks.push(gridBlock('More in this program', '', rest));
      inner = blocks.join('\n    ');
    } else {
      inner = `<div class="course-grid">
      ${courses.map(card).join('\n      ')}
    </div>`;
    }

    return `<div class="program-block">
    <div class="program-label">${p.label}</div>
    <p class="program-blurb">${p.blurb}</p>
    ${inner}
  </div>`;
  };

  const main = `<section class="hero">
  <span class="hero-eyebrow">Free Training from Binary Blender</span>
  <h1><span class="highlight">TAO Academy</span></h1>
  <p>One flagship methodology and the library around it &mdash; ${totals.courses} courses, ${totals.lessons} lessons on orchestrating AI like a production system. No signup. No paywall. No email gate. Open one and start.</p>
  <div class="cta-buttons">
    <a href="#flagship" class="cta-button">Start with the flagship</a>
    <a href="#library" class="cta-button outline">Browse all courses</a>
  </div>
</section>

${flagship}

${startHere}

<section class="section" id="library">
  <style>
    .subsection{margin:1.5rem 0 .5rem;}
    .subsection-label{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700;margin:1.4rem 0 .15rem;}
    .subsection-blurb{color:#666;font-size:.92rem;margin:0 0 .9rem;max-width:62ch;}
  </style>
  <h2>The Course Library</h2>
  <p class="section-subtitle">Everything is free, forever &mdash; a library being given away, not a product being sold. ${totals.courses} courses across ${totals.programs} programs, ${totals.lessons} lessons in total.</p>
  ${PROGRAMS.map(programSection).join('\n  ')}
</section>

<section class="funnel-band">
  <h2>Free to learn. Built to deploy.</h2>
  <p>The Academy teaches the method. When you're ready to put it into production, we build a custom AI-powered app &mdash; on open-source models, on your hardware, yours to keep &mdash; in a single day.</p>
  <div class="cta-buttons">
    <a href="${SHOP_URL}" class="cta-button">Visit the Shop</a>
    <a href="${APPS_URL}" class="cta-button outline">Browse the free apps</a>
  </div>
</section>`;

  writeFileSync(join(DIST, 'index.html'),
    page({ root: '', title: 'TAO Academy — Free AI Training from Binary Blender', active: 'home', main }));
}

// ---------------------------------------------------------------
//  Main
// ---------------------------------------------------------------
function main() {
  rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);
  copyFileSync(join(__dirname, 'src', 'academy.css'), join(DIST, 'academy.css'));
  copyFileSync(join(__dirname, 'src', 'staticwebapp.config.json'), join(DIST, 'staticwebapp.config.json'));
  ensureDir(join(DIST, 'vendor'));
  for (const f of ['epub.min.js', 'jszip.min.js'])
    copyFileSync(join(__dirname, 'src', 'vendor', f), join(DIST, 'vendor', f));

  const usedSlugs = new Set();
  const byProgram = new Map();
  let courseCount = 0, lessonCount = 0;

  // DISCOVERY order ≠ DISPLAY order. Walk The AI MBA first so its slugs
  // (the-book-you-already-wrote, the-codes) take priority over stale
  // duplicates that exist under Tactical AI Orchestration. Display order
  // still follows the PROGRAMS array via renderCatalog's PROGRAMS.map.
  const discoveryOrder = [
    ...PROGRAMS.filter((p) => p.label === 'The AI MBA'),
    ...PROGRAMS.filter((p) => p.label !== 'The AI MBA'),
  ];
  for (const p of discoveryOrder) {
    const rank = programRank(p.label);
    const courses = discover(p, usedSlugs).sort((a, b) =>
      rank
        ? rank(a.slug) - rank(b.slug)
        : a.level.rank - b.level.rank || a.title.localeCompare(b.title)
    );
    byProgram.set(p.label, courses);
    for (const c of courses) {
      const n = renderCourse(c);
      lessonCount += n; courseCount++;
      console.log(`  ${c.program} / ${c.level.label} / ${c.title}  (${n})`);
    }
  }
  const totals = { courses: courseCount, lessons: lessonCount, programs: PROGRAMS.filter((p) => (byProgram.get(p.label) || []).length).length };
  renderCatalog(byProgram, totals);

  // Bake the textbook manifest into the reader.
  const readerTpl = readFileSync(join(__dirname, 'src', 'read.html'), 'utf8');
  writeFileSync(join(DIST, 'read.html'), readerTpl.replace('__BOOKS_MANIFEST__', JSON.stringify(BOOKS)));

  console.log(`\nTAO Academy built → dist/`);
  console.log(`  ${totals.courses} courses, ${totals.lessons} lessons, ${totals.programs} programs, ${Object.keys(BOOKS).length} textbooks.`);
}

main();
