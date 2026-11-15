#!/usr/bin/env node
/*
 * Generates the case-study pages and the Work list on the home page.
 *
 *   PROTECTED_PAGES_PASSWORD=… npm run build     (or put it in .env.local)
 *
 * Public studies:    content/cases/<slug>.html          → work/<slug>.html
 * Protected studies: _private/dyver/<slug>.html + media → work/<slug>.html with an encrypted body,
 *                    media encrypted to assets/protected/<hash>.bin
 *
 * _private/ is git-ignored: the repository is public, so only ciphertext is committed.
 * Encryption: PBKDF2-SHA256 → AES-256-GCM. IVs are derived from the plaintext (HMAC), so an unchanged
 * file produces identical ciphertext and rebuilds don't churn the repo. Run this locally and commit
 * the output; Vercel serves the committed files as they are.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITER = 600000;
const at = (...p) => join(ROOT, ...p);
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".svg": "image/svg+xml" };

function password() {
  if (process.env.PROTECTED_PAGES_PASSWORD) return process.env.PROTECTED_PAGES_PASSWORD;
  const f = at(".env.local");
  if (!existsSync(f)) return "";
  const m = /^PROTECTED_PAGES_PASSWORD=(.*)$/m.exec(readFileSync(f, "utf8"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

/* ---------- crypto ---------- */
function makeCipher(pw) {
  const keyFile = at("assets/protected/key.json");
  const derive = (salt) => pbkdf2Sync(pw, salt, ITER, 32, "sha256");
  let salt, key;
  if (existsSync(keyFile)) {
    const info = JSON.parse(readFileSync(keyFile, "utf8"));
    const s = Buffer.from(info.salt, "base64"), k = derive(s);
    try { openBytes(k, Buffer.from(info.check, "base64")); salt = s; key = k; } catch { /* password changed: new salt */ }
  }
  if (!key) { salt = randomBytes(16); key = derive(salt); }
  const ivKey = createHash("sha256").update(key).update("iv").digest();
  const seal = (plain) => {
    const iv = createHmac("sha256", ivKey).update(plain).digest().subarray(0, 12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
  };
  mkdirSync(at("assets/protected"), { recursive: true });
  writeFileSync(keyFile, JSON.stringify({ salt: salt.toString("base64"), iter: ITER, check: seal(Buffer.from("yv-ok")).toString("base64") }, null, 2) + "\n");
  return { seal, salt: salt.toString("base64") };
}
function openBytes(key, bytes) {
  const d = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  d.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([d.update(bytes.subarray(12, bytes.length - 16)), d.final()]);
}

/* ---------- partials ---------- */
const HEAD = (title, description, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500&family=Valley+Sans:wght@400..900&display=swap">
<link rel="stylesheet" href="/assets/site/site.css">
${extra}<script async src="https://www.googletagmanager.com/gtag/js?id=G-FSBYY0WW99"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","G-FSBYY0WW99");</script>
</head>`;
const NAV = `<nav class="nav appear" data-mount style="--ay:-12px" aria-label="Main">
    <a class="hero-name link" href="/">Yulia Vilensky</a>
    <div class="nav-links micro">
      <a class="link" href="/#work">Work</a>
      <a class="link hide-sm" href="/#about">What I do</a>
      <a class="link nav-cta" href="#contact">Contact</a>
    </div>
  </nav>`;
const LOCK = `<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M2.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="currentColor"/><rect x="1" y="5" width="8" height="6.5" fill="currentColor"/></svg>`;

/* The hills and the night footer are the home page's own markup, so the two never drift apart. */
const HOME = readFileSync(at("index.html"), "utf8");
const HILLS = (/<div class="hills" aria-hidden="true">[\s\S]*?<\/div>/.exec(HOME) || [""])[0];
// on case studies only the top edge of each hill carries the ink line: the fill shapes lose their stroke
// (which ran down the sides and along the bottom) and a separate open path draws the ridge
const HILLS_CASE = HILLS.replace(/<path class="(back|front)" d="M0 200V(\d+)(C[^"]*?)V200Z"\/>/g,
  (all, k, y, curve) => k === "back"
    ? `<g class="far">${all}<path class="ridge" d="M0 ${y}${curve}"/></g>` // the far hill and its line rise together on scroll
    : `${all}<path class="ridge" d="M0 ${y}${curve}"/>`);
// the full site header: the role, the focus and the intro sit under the navigation, as on the home page
const HERO_INFO = (/<div class="hero-info appear" data-mount>[\s\S]*?<\/div>/.exec(HOME) || [""])[0];
// the sky of the home scene in flat shapes, no outlines: long pale-gold streaks and white clouds with a flat gold underside
const STREAK = (k) => `<svg class="cs-streak ${k}" viewBox="0 0 600 40" preserveAspectRatio="none"><path d="M0 22C120 6 300 0 420 8C520 14 580 20 600 24C500 34 330 40 200 36C110 33 40 28 0 22Z"/></svg>`;
const PUFF = (k) => `<svg class="cs-puff ${k}" viewBox="0 0 240 70"><ellipse class="u" cx="120" cy="52" rx="118" ry="15"/><ellipse cx="122" cy="34" rx="60" ry="27"/><ellipse cx="62" cy="45" rx="50" ry="16"/><ellipse cx="182" cy="46" rx="50" ry="14"/></svg>`;
const SKY = `<div class="cs-sky" aria-hidden="true">
    ${STREAK("s1")}${STREAK("s2")}${STREAK("s3")}${PUFF("p1")}${PUFF("p2")}
    <svg class="cs-birds" viewBox="0 0 68 30"><path d="M2 14q8-10 14 0q6-10 14 0M40 24q6-8 11 0q5-8 11 0"/></svg>
  </div>`;
const FOOTER = ((/<div class="hills dark"[\s\S]*?<\/footer>/.exec(HOME) || [""])[0])
  .replace(/href="#(?!top")/g, 'href="/#');
if (!HILLS || !FOOTER || !HERO_INFO) throw new Error("index.html: hills or footer markup not found");

/* ---------- image sizes ----------
   Every <img> gets its real width and height, so the page keeps its length while pictures load. */
function imgSize(file) {
  try {
    const b = readFileSync(file);
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
      if (kind === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
      if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length;) {
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + len;
      }
    }
  } catch { /* unknown or missing: leave the tag as it is */ }
  return null;
}
const sized = (html, resolve) => html.replace(/<img\b([^>]*?)\ssrc="([^"]+)"([^>]*)>/g, (all, a, src, b) => {
  if (/\swidth=/.test(a + b)) return all;
  const s = imgSize(resolve(src));
  if (!s) return all;
  const tall = s[1] / s[0] > 1.2 ? ' style="width:min(100%, 880px)"' : ""; // tall screens at reading width: narrower would make them illegible
  return `<img${a} src="${src}" width="${s[0]}" height="${s[1]}"${tall}${b}>`;
});
const sizedSite = (html) => sized(html, (src) => at(src.replace(/^\//, "")));

/* ---------- body: split into sections ----------
   A body is a flat run of elements. Each h2 starts a section: the heading sits in the left columns,
   text runs in the right ones, and wide pieces (journeys, films, screens) take the full width. */
const VOID = new Set(["img", "br", "hr", "input", "source", "meta", "link", "wbr", "col", "embed", "track"]);
function topLevel(html) {
  const out = [], re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let m, depth = 0, start = 0, end = 0;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    const closing = m[1] === "/", single = m[3] === "/" || VOID.has(m[2].toLowerCase());
    if (depth === 0 && !closing) {
      if (html.slice(end, m.index).trim()) throw new Error("loose text between elements: " + html.slice(end, m.index).trim().slice(0, 60));
      start = m.index;
    }
    if (closing) depth--; else if (!single) depth++;
    if (depth === 0) { out.push(html.slice(start, re.lastIndex)); end = re.lastIndex; }
  }
  return out;
}
const isWide = (n) => /^<(div class="(board|routes)|figure(?! class="merge"))/.test(n);
function sectionize(html) {
  // Each h2 starts a numbered section. Before it goes a slim bar (number, name, title) that holds at the top of
  // the window once its section has been scrolled past, so the read sections stack up as an index.
  // The title is the h2's data-title, or the lead sentence that opens the section.
  const two = (n) => String(n).padStart(2, "0"), plain = (h) => h.replace(/<[^>]+>/g, "").trim();
  let out = "", open = false, staged = false, text = [], head = "", idx = 0; // staged: inside the wrapper the bars hold within
  const flush = () => {
    if (text.length || head) out += `<div class="cs-row">\n${head}${text.length ? `<div class="cs-text">\n${text.join("\n")}\n</div>\n` : ""}</div>\n`;
    text = []; head = "";
  };
  const nodes = topLevel(html);
  let skip = -1;
  nodes.forEach((n, k) => {
    if (k === skip) return;
    if (/^<h2[\s>]/.test(n)) {
      flush();
      const name = n.replace(/^<h2[^>]*>|<\/h2>$/g, "");
      const own = (/^<h2[^>]*\sdata-title="([^"]*)"/.exec(n) || [])[1];
      const lead = (/^<p class="lead">([\s\S]*?)<\/p>$/.exec(nodes[k + 1] || "") || [])[1];
      const title = own || (lead ? plain(lead) : "");
      if (/^<div class="board/.test(nodes[k + 1] || "")) { // a heading straight over a journey announces it: no number, no bar
        out += (open ? "</section>\n" : "") + (staged ? "</div>\n" : "");
        out = out.replace("__N__", idx); // how many headings stack here, so they can leave together
        out += `<section class="cs-sec cs-plain" style="--i:${idx - 1}">\n`;
        head = `<div class="cs-head"><h2 class="cs-h">${name}</h2>${own ? `<p class="cs-sub">${own}</p>` : ""}</div>\n`;
        open = true; staged = false; // the stack of bars ends here and scrolls away with the sections
        return;
      }
      idx++;
      // the heading is one element in both states: number, name and title. Expanded it opens the section; once
      // the section is scrolled past it holds at the top as a bar, the same three pieces only smaller.
      out += (open ? "</section>\n" : "") + (staged ? "" : `<div class="cs-stages" style="--n:__N__">\n`)
        + `<header class="cs-bar" style="--i:${idx - 1}"><span class="cs-bar-n" aria-hidden="true">${two(idx)}</span><h2 class="cs-bar-name">${name}</h2>${title ? `<p class="cs-bar-t">${title}</p>` : ""}</header>\n`
        + `<section class="cs-sec" id="s${idx}" style="--i:${idx - 1}">\n`;
      staged = true;
      if (!own && lead) skip = k + 1; // the lead sentence is the title now, so it is not repeated in the text
      open = true;
    } else {
      if (!open) { out += `<section class="cs-sec cs-open">\n`; open = true; }
      if (isWide(n)) { flush(); out += `<div class="cs-wide${/^<div class="board/.test(n) ? " cs-band" : ""}">\n${n}\n</div>\n`; } else text.push(n);
    }
  });
  flush();
  return (out + (open ? "</section>\n" : "") + (staged ? "</div>\n" : "")).replace("__N__", idx);
}

/* ---------- protected body ---------- */
function sealFragment(slug, cipher, used) {
  const dir = at("_private/dyver");
  let html = sized(readFileSync(join(dir, slug + ".html"), "utf8"), (src) => join(dir, src));
  const sealFile = (rel) => {
    const file = join(dir, rel);
    const bytes = cipher.seal(readFileSync(file));
    const name = createHash("sha256").update(bytes).digest("hex").slice(0, 20) + ".bin";
    used.add(name);
    const out = at("assets/protected", name);
    if (!existsSync(out)) writeFileSync(out, bytes);
    return { url: "/assets/protected/" + name, type: MIME[extname(rel).toLowerCase()] || "application/octet-stream", size: statSync(file).size };
  };
  html = html.replace(/<img([^>]*?)\ssrc="(media\/[^"]+)"([^>]*)>/g, (_, a, src, b) => {
    const m = sealFile(src);
    return `<img${a} data-enc="${m.url}" data-type="${m.type}"${b}>`;
  });
  html = html.replace(/<div class="video" data-video="(media\/[^"]+)" data-poster="(media\/[^"]+)"/g, (_, v, p) => {
    const mv = sealFile(v), mp = sealFile(p);
    return `<div class="video" data-enc="${mv.url}" data-size="${Math.round(mv.size / 1e6)} MB" data-poster="${mp.url}" data-poster-type="${mp.type}"`;
  });
  if (/(src|data-video|data-poster)="media\//.test(html)) throw new Error(slug + ": unconverted media reference");
  return cipher.seal(Buffer.from(sectionize(html))).toString("base64");
}

/* ---------- page ---------- */
function casePage(c, next, sealed) {
  // "Short title: the claim" splits into the display title and the line under it
  const cut = c.title.indexOf(": ");
  const short = cut > 0 ? c.title.slice(0, cut) : c.title, claim = cut > 0 ? c.title.slice(cut + 2) : (c.outcome || ""); // no claim in the title: the study's stated outcome
  const facts = [["Company", c.company], ["Year", c.year], ["Role", c.role], ["Focus", c.capability]]
    .filter(([, v]) => v).map(([k, v]) => `<div><dt class="micro">${k}</dt><dd>${esc(v)}</dd></div>`).join("\n      ");
  const raw = sealed ? "" : sizedSite(readFileSync(at("content/cases", c.slug + ".html"), "utf8").trim());
  // A body that opens on a film already leads with a picture, so the cover would only repeat it.
  const cover = c.cover && !/^<figure class="film"/.test(raw)
    ? sizedSite(`<figure class="cs-cover"${sealed ? " data-cover" : ""}><img src="${c.cover}" alt="${esc(short)}: the main screen"></figure>\n`) : "";
  const body = sealed
    ? `<section class="cs-sec cs-gate" id="gate" hidden><div class="cs-row">
    <div class="cs-head"><h2 class="cs-h">Unreleased work</h2></div>
    <div class="cs-text">
      <p>This case study shows product work that is not public yet. Enter the password you received with my application, or <a href="#contact">ask me for it</a>.</p>
      <form autocomplete="off">
        <label class="field"><span class="micro">Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <p class="gate-err" role="alert"></p>
        <button class="submit" type="submit">UNLOCK</button>
      </form>
    </div>
  </div></section>
  <div id="protected" hidden></div>
  <noscript><p class="cs-noscript">This case study needs JavaScript to unlock.</p></noscript>
  <script type="application/json" id="sealed">${JSON.stringify(sealed)}</script>`
    : sectionize(raw);
  return `${HEAD(c.title + " · Yulia Vilensky", c.summary, sealed ? '<meta name="robots" content="noindex">\n' : "")}
<body class="case">
<header class="cs-hero" id="top">
  ${SKY}
  ${NAV}
  ${HERO_INFO}
  <div class="cs-hero-body">
    <h1 class="cs-title reveal-words${short.length > 30 ? " long" : ""}" data-mount>${esc(short)}</h1>
    <div class="cs-lede appear" data-mount style="--ay:14px">
      ${claim ? `<p class="cs-claim">${esc(claim)}</p>\n      ` : ""}<p class="cs-sum">${esc(c.summary)}</p>
    </div>
    <dl class="cs-facts appear" data-mount style="--ay:10px">
      ${facts}
    </dl>
  </div>
  ${HILLS_CASE}
</header>
<main class="cs-main">
  ${cover}${body}
</main>
${next ? `<a class="cs-next" href="/work/${next.slug}">
  <span class="cs-next-txt"><span class="cs-next-t">Next: ${esc(next.listTitle)}</span><svg class="cs-next-arrow" viewBox="0 0 40 24" aria-hidden="true"><path d="M0 12h37M27 2l10 10-10 10" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
  ${next.cover ? sizedSite(`<img src="${next.cover}" alt="" loading="lazy">`) : ""}
</a>\n` : ""}${FOOTER}
<script src="/assets/site/site.js" defer></script>
<script src="/assets/site/case.js" defer></script>
<script type="module" src="/assets/site/valley.js"></script>
</body>
</html>
`;
}

function workRow(c, i) {
  const n = String(i + 1).padStart(2, "0");
  const cover = (c.cover ? `<img src="${c.cover}" alt="" loading="lazy">` : `<span class="micro">Screens to add</span>`)
    + (c.protected ? `<span class="lock-tag micro">${LOCK}Password protected</span>` : "");
  return `      <a class="wrow" href="/work/${c.slug}">
        <div class="wrow-a"><p class="wrow-n">${n}</p><span class="btn-line micro">View case study${c.protected ? " " + LOCK : ""}</span></div>
        <div class="wrow-cover">${cover}</div>
        <div class="wrow-c"><div class="wrow-head"><h3 class="wrow-title">${esc(c.listTitle)}</h3><p class="micro">${esc(c.capability)}</p></div><p>${esc(c.summary)}</p></div>
      </a>`;
}

/* ---------- run ---------- */
const cases = JSON.parse(readFileSync(at("content/cases.json"), "utf8"));
const pw = password();
const hasPrivate = existsSync(at("_private/dyver"));
const cipher = pw && hasPrivate ? makeCipher(pw) : null;
const used = new Set();
mkdirSync(at("work"), { recursive: true });

cases.forEach((c, i) => {
  const target = at("work", c.slug + ".html");
  if (c.protected && !cipher) {
    console.warn(`! ${c.slug}: skipped (needs PROTECTED_PAGES_PASSWORD and _private/dyver). Existing page kept.`);
    return;
  }
  const sealed = c.protected ? { salt: cipher.salt, iter: ITER, body: sealFragment(c.slug, cipher, used) } : null;
  writeFileSync(target, casePage(c, cases[(i + 1) % cases.length], sealed));
  console.log(`✓ work/${c.slug}.html${c.protected ? " (encrypted)" : ""}`);
});

if (cipher) {
  for (const f of readdirSync(at("assets/protected"))) if (f.endsWith(".bin") && !used.has(f)) { unlinkSync(at("assets/protected", f)); console.log(`− removed stale ${f}`); }
}

const indexFile = at("index.html");
const index = readFileSync(indexFile, "utf8");
const rows = cases.map(workRow).join("\n");
const updated = index.replace(/(<!-- work:start -->)[\s\S]*?(\s*<!-- work:end -->)/, `$1\n${rows}$2`);
if (updated === index && !index.includes(rows)) throw new Error("index.html: work markers not found");
writeFileSync(indexFile, updated);
console.log(`✓ index.html work list (${cases.length} rows)`);
