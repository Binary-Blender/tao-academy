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
const MANUAL_TEXTBOOKS = {
  'cognition-systems-engineering': 'Textbooks/Cognition Systems Engineering/CSE Textbook/cognition_systems_engineering.epub',
  'the-one-person-enterprise': 'AI Business School/The One-Person Enterprise/the_one_person_enterprise.epub',
  'ai-creative-direction': 'AI Art Textbooks/AI Creative Director Textbook/the_ai_creative_director.epub',
};

// The curated on-ramp: foundational courses in increasing order. These lead the
// catalog (a "Start Here" path) and sort first within their program block.
const FEATURED_PATH = ['mastering-ai-prompts', 'how-to-use-your-strategic-ai', 'stop-being-the-bottleneck'];

// --- Programs to scan, in catalog order. The label is what the visitor sees. ---
const PROGRAMS = [
  { dir: 'Tactical AI Orchestration', label: 'Tactical AI Orchestration', blurb: 'The flagship program — building, creating, and orchestrating with AI, from first prompt to frontier technique.' },
  { dir: 'Team AI Outreach', label: 'Team AI Outreach', blurb: 'Turn what you know into an AI-powered business — launch, operate, and multiply.' },
  { dir: 'Theatrical AI Output', label: 'Theatrical AI Output', blurb: 'The AI-native creator studio — produce video, sound, and a content engine that runs without you.' },
  { dir: 'AI Business School', label: 'AI Business School', blurb: 'Run a one-person enterprise with AI doing the heavy lifting.' },
  { dir: 'AI Creative Direction', label: 'AI Creative Direction', blurb: 'Direct AI like a creative lead — taste, judgment, and a house style.' },
];

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
    textbook: findTextbook(srcAbs) ||
      (MANUAL_TEXTBOOKS[slug] ? { absEpub: join(SKOOL, MANUAL_TEXTBOOKS[slug]), filename: basename(MANUAL_TEXTBOOKS[slug]) } : null),
  };
}

// ---------------------------------------------------------------
//  Site chrome
// ---------------------------------------------------------------
function nav(root, active) {
  const a = (href, label, cls = '') => `<a href="${href}"${cls ? ` class="${cls}"` : ''}>${label}</a>`;
  return `<nav>
  <div class="logo" onclick="window.location.href='${root}index.html'">TAO Academy<small>by Binary Blender</small></div>
  <button class="nav-toggle" aria-label="Toggle navigation">&#9776;</button>
  <div class="nav-links">
    ${a(`${root}index.html`, 'Courses', active === 'home' ? 'active' : '')}
    ${a(APPS_URL, 'Free Apps')}
    ${a(MAIN_SITE, 'Binary Blender ↗')}
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
    BOOKS[course.slug] = {
      title: `${course.title} <em>&mdash; the textbook</em>`,
      rawTitle: course.title,
      file: `courses/${course.slug}/book/${course.textbook.filename}`,
      back: { href: `courses/${course.slug}/index.html`, label: course.title },
      fontSize: '110%',
    };
    textbookCard = `<div class="textbook-card">
    <div class="tb-icon">📖</div>
    <div class="tb-meta">
      <span class="tb-label">Companion textbook</span>
      <span class="tb-title">${course.title} &mdash; The Complete Textbook</span>
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
  const startHere = `<section class="section start-here" id="start">
  <h2>New here? Start with these three.</h2>
  <p class="section-subtitle">A foundational track, in order &mdash; prompt craft, then strategy, then getting the work off your plate. Do them in sequence, then branch into the full library below.</p>
  <div class="path-row">
    ${FEATURED_PATH.map((s, i) => pathStep(s, i + 1)).join('\n    ')}
  </div>
</section>`;

  const programSection = (p) => {
    const courses = (byProgram.get(p.label) || []).slice()
      .sort((a, b) => featuredRank(a.slug) - featuredRank(b.slug) || a.level.rank - b.level.rank || a.title.localeCompare(b.title));
    if (!courses.length) return '';
    return `<div class="program-block">
    <div class="program-label">${p.label}</div>
    <p class="program-blurb">${p.blurb}</p>
    <div class="course-grid">
      ${courses.map(card).join('\n      ')}
    </div>
  </div>`;
  };

  const main = `<section class="hero">
  <span class="hero-eyebrow">Free Training from Binary Blender</span>
  <h1><span class="highlight">TAO Academy</span></h1>
  <p>The complete Tactical AI Orchestration library &mdash; ${totals.courses} courses and ${totals.lessons} lessons on building, creating, and shipping with AI. No signup. No paywall. No email gate. Just open one and start.</p>
  <div class="cta-buttons">
    <a href="#start" class="cta-button">Start here</a>
    <a href="#library" class="cta-button outline">Browse all courses</a>
  </div>
</section>

${startHere}

<section class="section" id="library">
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

  for (const p of PROGRAMS) {
    const courses = discover(p, usedSlugs).sort((a, b) => a.level.rank - b.level.rank || a.title.localeCompare(b.title));
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
