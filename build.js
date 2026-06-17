#!/usr/bin/env node
// Generates index.html from content.md.
// Re-run after editing content.md:  node build.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'content.md');
const OUT = path.join(__dirname, 'index.html');

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

// --- Parse content.md into a tree of sections ---
const lines = fs.readFileSync(SRC, 'utf8').split('\n');

const sections = [];      // { title, subs: [{ title, items: [...] }], intro: [lines] }
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

  if (line.startsWith('# ')) continue;            // doc title — skip

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
    curItem = { name: line.slice(5).trim(), parts: [] }; // parts: {kind, text}
    continue;
  }
  if (line.startsWith('> ')) {
    // blockquote callout — attach to sub (or section intro if no sub yet)
    const text = line.slice(2).trim();
    if (curSub) curSub.items.push({ callout: text });
    else if (curSection) curSection.intro.push({ quote: text });
    continue;
  }

  // bullet lines belonging to an item
  if (curItem && /^\s*-\s+/.test(line)) {
    const body = line.replace(/^\s*-\s+/, '');
    const m = body.match(/^\*\*(Effect[^:]*|Type|Hexapod)[:\*]*\*\*\s*:?\s*(.*)$/);
    if (m) {
      const label = m[1];
      const kind = label === 'Type' ? 'type'
        : label === 'Hexapod' ? 'note'
        : 'effect';
      curItem.parts.push({ kind, label, text: m[2] });
    } else {
      // continuation of previous part
      if (curItem.parts.length) curItem.parts[curItem.parts.length - 1].text += ' ' + body;
    }
    continue;
  }

  // Non-item content -> section intro (Disclaimer, General Info, Outro)
  if (curSection && !curSub && line.trim() !== '' && line.trim() !== '---') {
    curSection.intro.push({ text: line });
  }
}
pushSub();

// --- Render helpers ---
function renderIntro(intro) {
  // Render a simple markdown subset: paragraphs, "- " lists (with nesting), quotes.
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
  for (const p of item.parts) {
    if (p.kind === 'type') continue;
    if (p.kind === 'effect') {
      const label = p.label !== 'Effect' ? `<span class="eff-label">${esc(p.label.replace(/^Effect\s*/, '').replace(/[()]/g, '').trim())}</span> ` : '';
      effects += `<p class="effect">${label}${inline(p.text)}</p>`;
    } else if (p.kind === 'note') {
      notes.push(inline(p.text));
    }
  }

  // Note sits inline in the card, hidden until the weapon-level button reveals
  // every note in that weapon at once.
  const noteBlock = notes.length
    ? `<div class="note"><span class="note__who">Hexapod</span>${notes.join('<br><br>')}</div>`
    : '';

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

// --- Build page ---
const intro = sections.find((s) => /general info/i.test(s.title));
const disclaimer = sections.find((s) => /disclaimer/i.test(s.title));
const outro = sections.find((s) => /outro|closing/i.test(s.title));
const weaponSections = WEAPONS.map((w) => sections.find((s) => s.title === w)).filter(Boolean);

const navLinks = weaponSections.map((s) => {
  const isNew = NEW_WEAPONS.has(s.title);
  return `<a href="#${slug(s.title)}" class="nav__link${isNew ? ' nav__link--new' : ''}">${esc(s.title.replace(' (SnS)', ''))}${isNew ? '<span class="dot" title="New weapon"></span>' : ''}</a>`;
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
          ${isNew ? '<span class="new-tag">NEW WEAPON</span>' : ''}
        </div>
        <button class="hexa-toggle" type="button" aria-pressed="false">
          <span class="hexa-toggle__on">Show Hexapod’s takes</span>
          <span class="hexa-toggle__off">Hide Hexapod’s takes</span>
        </button>
      </div>
      ${introHtml}
      ${subs}
    </section>`;
}).join('\n');

const counts = weaponSections.reduce((n, s) => n + s.subs.reduce((m, sub) => m + sub.items.filter(i => i.name).length, 0), 0);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NIX · Throne and Liberty — Everything New</title>
<meta name="description" content="All the datamined content coming in the Nix expansion for Throne and Liberty: new weapon, gear items, enchantments, Archboss weapons.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="hero">
  <div class="hero__inner">
    <p class="hero__eyebrow">Throne and Liberty · Datamine</p>
    <h1 class="hero__title">NIX</h1>
    <p class="hero__sub">Everything new: Archboss weapons, gear items, enchantments &amp; field items — across all 10 weapons.</p>
    <div class="hero__meta">
      <span>${weaponSections.length} weapons</span>
      <span>${counts}+ items</span>
      <span>Drops the 25th</span>
    </div>
  </div>
</header>

<div class="disclaimer">
  <div class="disclaimer__inner">${renderIntro(disclaimer ? disclaimer.intro : [])}</div>
</div>

<nav class="nav" id="nav">
  <div class="nav__inner">
    <span class="nav__brand">NIX</span>
    <div class="nav__links">
        <a href="#info" class="nav__link">How It Works</a>
        ${navLinks}
    </div>
  </div>
</nav>

<main class="main">
  <section class="info" id="info">
    <h2>How It Works</h2>
    <div class="info__body">${renderIntro(intro ? intro.intro : [])}</div>
  </section>

  ${weaponHtml}

  ${outro ? `<section class="outro" id="outro">
    <h2>Closing Thoughts</h2>
    <div class="info__body">${renderIntro(outro.intro)}</div>
  </section>` : ''}
</main>

<footer class="footer">
  <p>Datamined content — <strong>everything is subject to change</strong>. Source: video by <a href="https://www.youtube.com/watch?v=FYPSsX68J8E" target="_blank" rel="noopener">Hexapod</a>, in collaboration with K9 Beat &amp; Gros.</p>
  <p class="footer__small">Unofficial fan page. Throne and Liberty © NCSOFT / Amazon Games.</p>
</footer>

<button class="totop" id="totop" aria-label="Back to top">↑</button>
<script src="script.js"></script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Wrote ${OUT} — ${weaponSections.length} weapons, ${counts} items.`);
