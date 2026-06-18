#!/usr/bin/env node
// Generates index.html (EN) and tr.html (TR) from content.md / content-tr.md.
// Re-run after editing content:  node build.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Short content hash for cache-busting CSS/JS so updates show immediately.
const assetV = (file) => crypto
  .createHash('md5')
  .update(fs.readFileSync(path.join(__dirname, file)))
  .digest('hex')
  .slice(0, 8);

const WEAPONS = [
  'Longbow', 'Crossbow', 'Daggers', 'Gauntlets', 'Greatsword',
  'Orb', 'Spear', 'Staff', 'Sword and Shield (SnS)', 'Wand',
];
const NEW_WEAPONS = new Set(['Gauntlets']);

const esc = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline markdown: **bold** only (after escaping).
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const slug = (s) => s.toLowerCase()
  .replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// --- Parse a content markdown file into a tree of sections ---
function parseContent(srcPath) {
  const lines = fs.readFileSync(srcPath, 'utf8').split('\n');
  const sections = []; // { title, subs: [{ title, items }], intro: [...] }
  let curSection = null;
  let curSub = null;
  let curItem = null;

  function pushItem() {
    if (curItem && curSub) curSub.items.push(curItem);
    curItem = null;
  }
  function pushSub() {
    pushItem();
    if (curSub && curSection) curSection.subs.push(curSub);
    curSub = null;
  }

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (line.startsWith('# ')) continue; // doc title — skip

    if (line.startsWith('## ')) {
      pushSub();
      curSection = { title: line.slice(3).trim(), subs: [], intro: [] };
      sections.push(curSection);
      continue;
    }
    if (line.startsWith('### ')) {
      pushSub();
      curSub = { title: line.slice(4).trim(), items: [] };
      continue;
    }
    if (line.startsWith('#### ')) {
      pushItem();
      curItem = { name: line.slice(5).trim(), parts: [] };
      continue;
    }
    if (line.startsWith('> ')) {
      const text = line.slice(2).trim();
      if (curSub) curSub.items.push({ callout: text });
      else if (curSection) curSection.intro.push({ quote: text });
      continue;
    }

    if (curItem && /^\s*-\s+/.test(line)) {
      const body = line.replace(/^\s*-\s+/, '');
      const m = body.match(/^\*\*(Effect[^:]*|Type|Hexapod|Özet)[:\*]*\*\*\s*:?\s*(.*)$/);
      if (m) {
        const label = m[1];
        const kind = label === 'Type' ? 'type'
          : label === 'Hexapod' ? 'note'
          : label === 'Özet' ? 'summary'
          : 'effect';
        curItem.parts.push({ kind, label, text: m[2] });
      } else if (curItem.parts.length) {
        curItem.parts[curItem.parts.length - 1].text += ' ' + body;
      }
      continue;
    }

    // Non-item content -> section intro (Disclaimer, General Info, Outro)
    if (curSection && !curSub && line.trim() !== '' && line.trim() !== '---') {
      curSection.intro.push({ text: line });
    }
  }
  pushSub();
  return sections;
}

// --- Render helpers ---
function renderIntro(intro) {
  let html = '';
  let listDepth = 0;
  const closeLists = (to = 0) => { while (listDepth > to) { html += '</ul>'; listDepth--; } };

  for (const node of intro) {
    if (node.quote) {
      closeLists();
      html += `<blockquote class="callout">${inline(node.quote)}</blockquote>`;
      continue;
    }
    const line = node.text;
    const indent = (line.match(/^\s*/)[0].length);
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      const depth = indent >= 2 ? 2 : 1;
      while (listDepth < depth) { html += '<ul>'; listDepth++; }
      while (listDepth > depth) { html += '</ul>'; listDepth--; }
      html += `<li>${inline(bullet[1])}</li>`;
    } else {
      closeLists();
      const t = line.trim();
      if (t) html += `<p>${inline(t)}</p>`;
    }
  }
  closeLists();
  return html;
}

function typeBadge(text) {
  const t = text.toLowerCase();
  let cls = 'badge';
  if (t.includes('archboss')) cls += ' badge--archboss';
  else if (t.includes('field')) cls += ' badge--field';
  else if (t.includes('crack') || t.includes('event')) cls += ' badge--crack';
  return `<span class="${cls}">${inline(text)}</span>`;
}

function renderItem(item) {
  if (item.callout) {
    return `<div class="callout callout--inline">${inline(item.callout)}</div>`;
  }
  const typePart = item.parts.find((p) => p.kind === 'type');
  const badge = typePart ? typeBadge(typePart.text) : '';

  let effects = '';
  const notes = [];
  const summaries = [];
  for (const p of item.parts) {
    if (p.kind === 'type') continue;
    if (p.kind === 'effect') {
      const label = p.label !== 'Effect' ? `<span class="eff-label">${esc(p.label.replace(/^Effect\s*/, '').replace(/[()]/g, '').trim())}</span> ` : '';
      effects += `<p class="effect">${label}${inline(p.text)}</p>`;
    } else if (p.kind === 'note') {
      notes.push(inline(p.text));
    } else if (p.kind === 'summary') {
      summaries.push(inline(p.text));
    }
  }

  // Note block (hidden until the weapon button reveals all of them at once).
  // On TR pages it leads with the Turkish "Özet" summary, then Hexapod's EN take.
  let inner = '';
  if (summaries.length) {
    inner += `<div class="note-summary"><span class="note__who">Özet</span>${summaries.join(' ')}</div>`;
  }
  if (notes.length) {
    inner += `<div class="note-en"><span class="note__who">Hexapod</span>${notes.join('<br><br>')}</div>`;
  }
  const noteBlock = inner ? `<div class="note">${inner}</div>` : '';

  return `<article class="item">
      <header class="item__head"><h4>${inline(item.name)}</h4>${badge}</header>
      ${effects}
      ${noteBlock}
    </article>`;
}

function renderSub(sub) {
  const items = sub.items.map(renderItem).join('\n');
  return `<div class="subsection">
      <h3 class="sub-title">${inline(sub.title)}</h3>
      <div class="items">${items}</div>
    </div>`;
}

// Renders the PD Talk source (intro paragraph + ### sub-topics + bullets +
// `![desc @ ~M:SS](images/x.jpg)` image markers). EN page only.
function renderPdTalk(srcPath) {
  if (!fs.existsSync(srcPath)) return '';
  const lines = fs.readFileSync(srcPath, 'utf8').split('\n');
  let html = '';
  let inList = false;
  let seenSub = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('## ')) continue; // section title handled in the template
    if (line.startsWith('### ')) {
      closeList();
      seenSub = true;
      html += `<h3 class="pd-sub">${inline(line.slice(4).trim())}</h3>`;
      continue;
    }
    const img = line.match(/^!\[(.+?)\s*@\s*([^\]]+?)\]\(([^)]+)\)\s*$/);
    if (img) {
      closeList();
      const desc = img[1].trim(), ts = img[2].trim(), src = img[3].trim();
      // Image shows normally; a missing file (404) flips to a dashed placeholder.
      html += `<figure class="pd-shot">`
        + `<img src="${esc(src)}" alt="${esc(desc)}" loading="lazy"`
        + ` onerror="this.closest('.pd-shot').classList.add('is-missing')">`
        + `<figcaption><span class="pd-ts">${esc(ts)}</span> ${inline(desc)}</figcaption>`
        + `</figure>`;
      continue;
    }
    const bullet = line.match(/^-\s+(.*)$/);
    if (bullet) {
      if (!inList) { html += '<ul class="pd-list">'; inList = true; }
      html += `<li>${inline(bullet[1])}</li>`;
      continue;
    }
    if (line.trim() === '') continue;
    closeList();
    html += `<p class="${seenSub ? 'pd-p' : 'pd-intro'}">${inline(line.trim())}</p>`;
  }
  closeList();
  return html;
}

// --- Per-language UI strings (content terms stay in the markdown) ---
const STRINGS = {
  en: {
    htmlLang: 'en',
    title: 'NIX · Throne and Liberty — Everything New',
    metaDesc: 'All the datamined content coming in the Nix expansion for Throne and Liberty: new weapon, gear items, enchantments, Archboss weapons.',
    eyebrow: 'Throne and Liberty · Datamine',
    heroSub: 'Everything new: Archboss weapons, gear items, enchantments &amp; field items — across all 10 weapons.',
    metaWeapons: (n) => `${n} weapons`,
    metaItems: (n) => `${n}+ items`,
    metaDrop: 'Drops the 25th',
    navHow: 'How It Works',
    infoTitle: 'How It Works',
    outroTitle: 'Closing Thoughts',
    newTag: 'NEW WEAPON',
    newDot: 'New weapon',
    showTakes: 'Show Hexapod’s takes',
    hideTakes: 'Hide Hexapod’s takes',
    footer: 'Datamined content — <strong>everything is subject to change</strong>. Source: video by <a href="https://www.youtube.com/watch?v=FYPSsX68J8E" target="_blank" rel="noopener">Hexapod</a>, in collaboration with K9 Beat &amp; Gros.',
    footerSmall: 'Unofficial fan page. Throne and Liberty © NCSOFT / Amazon Games.',
    toTop: 'Back to top',
  },
  tr: {
    htmlLang: 'tr',
    title: 'NIX · Throne and Liberty — Gelen Tüm Yenilikler',
    metaDesc: 'Throne and Liberty Nix güncellemesiyle gelecek tüm datamine içeriği: yeni silah, gear items, enchantments ve Archboss silahları.',
    eyebrow: 'Throne and Liberty · Datamine',
    heroSub: 'Gelen tüm yenilikler: Archboss silahları, gear items, enchantments ve field items — 10 silahın tamamı için.',
    metaWeapons: (n) => `${n} silah`,
    metaItems: (n) => `${n}+ item`,
    metaDrop: 'Ayın 25’inde geliyor',
    navHow: 'Nasıl çalışıyor',
    infoTitle: 'Nasıl çalışıyor',
    outroTitle: 'Kapanış',
    newTag: 'YENİ SİLAH',
    newDot: 'Yeni silah',
    showTakes: 'Hexapod’un yorumlarını göster',
    hideTakes: 'Hexapod’un yorumlarını gizle',
    footer: 'Datamine içeriği — <strong>her şey değişebilir</strong>. Kaynak: <a href="https://www.youtube.com/watch?v=FYPSsX68J8E" target="_blank" rel="noopener">Hexapod</a> videosu, K9 Beat &amp; Gros ile birlikte hazırlandı.',
    footerSmall: 'Resmi olmayan hayran sayfası. Throne and Liberty © NCSOFT / Amazon Games.',
    toTop: 'Yukarı dön',
  },
};

// --- Build one page ---
function buildPage(lang, srcPath, outPath) {
  const t = STRINGS[lang];
  const sections = parseContent(srcPath);

  const intro = sections.find((s) => /general info/i.test(s.title));
  const disclaimer = sections.find((s) => /disclaimer/i.test(s.title));
  const outro = sections.find((s) => /outro|closing/i.test(s.title));
  const weaponSections = WEAPONS.map((w) => sections.find((s) => s.title === w)).filter(Boolean);

  const navLinks = weaponSections.map((s) => {
    const isNew = NEW_WEAPONS.has(s.title);
    return `<a href="#${slug(s.title)}" class="nav__link${isNew ? ' nav__link--new' : ''}">${esc(s.title.replace(' (SnS)', ''))}${isNew ? `<span class="dot" title="${esc(t.newDot)}"></span>` : ''}</a>`;
  }).join('\n        ');

  const weaponHtml = weaponSections.map((s) => {
    const wslug = slug(s.title);
    const isNew = NEW_WEAPONS.has(s.title);
    const introHtml = s.intro.length ? `<div class="weapon__intro">${renderIntro(s.intro)}</div>` : '';
    const subs = s.subs.map(renderSub).join('\n');
    return `<section class="weapon" id="${wslug}">
      <div class="weapon__head">
        <div class="weapon__head-left">
          <h2>${esc(s.title)}</h2>
          ${isNew ? `<span class="new-tag">${esc(t.newTag)}</span>` : ''}
        </div>
        <button class="hexa-toggle" type="button" aria-pressed="false">
          <span class="hexa-toggle__on">${esc(t.showTakes)}</span>
          <span class="hexa-toggle__off">${esc(t.hideTakes)}</span>
        </button>
      </div>
      ${introHtml}
      ${subs}
    </section>`;
  }).join('\n');

  const counts = weaponSections.reduce((n, s) => n + s.subs.reduce((m, sub) => m + sub.items.filter((i) => i.name).length, 0), 0);

  const langSwitch = `<div class="lang-switch">
      <a href="index.html"${lang === 'en' ? ' class="is-current"' : ''}>EN</a>
      <a href="tr.html"${lang === 'tr' ? ' class="is-current"' : ''}>TR</a>
    </div>`;

  // PD Talk lives on its own page (pdtalk.html); the hero shows a big CTA — EN only.
  const pdCta = lang === 'en' ? `<a class="pd-cta" href="pdtalk.html">
        <span class="pd-cta__kicker">Official video</span>
        <span class="pd-cta__title">PD Talk</span>
        <span class="pd-cta__sub">The Frozen Divide: Nix — fully broken down</span>
        <span class="pd-cta__arrow">Read it →</span>
      </a>` : '';

  const html = `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.metaDesc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=${assetV('style.css')}">
</head>
<body>
<header class="hero">
  ${langSwitch}
  <div class="hero__inner">
    <div class="hero__main">
      <p class="hero__eyebrow">${t.eyebrow}</p>
      <h1 class="hero__title">NIX</h1>
      <p class="hero__sub">${t.heroSub}</p>
      <div class="hero__meta">
        <span>${t.metaWeapons(weaponSections.length)}</span>
        <span>${t.metaItems(counts)}</span>
        <span>${t.metaDrop}</span>
      </div>
    </div>
    ${pdCta}
  </div>
</header>

<div class="disclaimer">
  <div class="disclaimer__inner">${renderIntro(disclaimer ? disclaimer.intro : [])}</div>
</div>

<nav class="nav" id="nav">
  <div class="nav__inner">
    <span class="nav__brand">NIX</span>
    <div class="nav__links">
        <a href="#info" class="nav__link">${esc(t.navHow)}</a>
        ${navLinks}
    </div>
  </div>
</nav>

<main class="main">
  <section class="info" id="info">
    <h2>${esc(t.infoTitle)}</h2>
    <div class="info__body">${renderIntro(intro ? intro.intro : [])}</div>
  </section>

  ${weaponHtml}

  ${outro ? `<section class="outro" id="outro">
    <h2>${esc(t.outroTitle)}</h2>
    <div class="info__body">${renderIntro(outro.intro)}</div>
  </section>` : ''}
</main>

<footer class="footer">
  <p>${t.footer}</p>
  <p class="footer__small">${t.footerSmall}</p>
</footer>

<button class="totop" id="totop" aria-label="${esc(t.toTop)}">↑</button>
<script src="script.js?v=${assetV('script.js')}"></script>
</body>
</html>
`;

  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${outPath} — ${weaponSections.length} weapons, ${counts} items (${lang}).`);
}

// Standalone PD Talk page (EN only) — full breakdown of the official video.
function buildPdTalkPage() {
  const body = renderPdTalk(path.join(__dirname, 'pdtalk.md'));
  const shots = (body.match(/pd-shot/g) || []).length;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PD Talk — The Frozen Divide: Nix · NIX</title>
<meta name="description" content="Full breakdown of the official Throne and Liberty PD Talk for The Frozen Divide: Nix — everything Producer Park Geon-su announced.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=${assetV('style.css')}">
</head>
<body>
<header class="hero hero--pd">
  <div class="hero__inner">
    <div class="hero__main">
      <p class="hero__eyebrow">Throne and Liberty · Official PD Talk</p>
      <h1 class="hero__title">PD TALK</h1>
      <p class="hero__sub">The Frozen Divide: Nix — a full breakdown of everything Producer Park Geon-su (“Sentry”) announced.</p>
      <div class="hero__cta-row">
        <a class="hero__back" href="index.html">← Back to datamine</a>
        <a class="hero__watch" href="https://www.youtube.com/watch?v=8PfPJwRlylE" target="_blank" rel="noopener">Watch the video ↗</a>
      </div>
    </div>
  </div>
</header>

<main class="main pd-main">
  ${body}
</main>

<footer class="footer">
  <p>Breakdown of the official <a href="https://www.youtube.com/watch?v=8PfPJwRlylE" target="_blank" rel="noopener">PD Talk</a> video. Throne and Liberty © NCSOFT / Amazon Games.</p>
  <p class="footer__small"><a href="index.html">← Back to the NIX datamine</a></p>
</footer>

<button class="totop" id="totop" aria-label="Back to top">↑</button>
<script src="script.js?v=${assetV('script.js')}"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(__dirname, 'pdtalk.html'), html);
  console.log(`Wrote pdtalk.html — ${shots} screenshot slots.`);
}

buildPage('en', path.join(__dirname, 'content.md'), path.join(__dirname, 'index.html'));
buildPage('tr', path.join(__dirname, 'content-tr.md'), path.join(__dirname, 'tr.html'));
buildPdTalkPage();
