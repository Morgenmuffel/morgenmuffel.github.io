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
    <a class="micro link" href="/">Yulia Vilensky</a>
    <div class="nav-links micro">
      <a class="link hide-sm" href="/#about">About</a>
      <a class="link" href="/#work">Work</a>
      <a class="link nav-cta" href="/#contact">Let’s create</a>
    </div>
  </nav>`;
const LOCK = `<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M2.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="currentColor"/><rect x="1" y="5" width="8" height="6.5" fill="currentColor"/></svg>`;

/* ---------- protected body ---------- */
function sealFragment(slug, cipher, used) {
  const dir = at("_private/dyver");
  let html = readFileSync(join(dir, slug + ".html"), "utf8");
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
  return cipher.seal(Buffer.from(html)).toString("base64");
}

/* ---------- page ---------- */
function casePage(c, next, sealed) {
  const details = [["Company", c.company], ["Year", c.year], ["Role", c.role], ["Contents", c.contents]]
    .filter(([, v]) => v).map(([k, v]) => `<div><p class="micro">${k}</p><p>${esc(v)}</p></div>`).join("\n      ");
  const body = sealed
    ? `<div class="gate" id="gate" hidden>
        <h2>This case study is password protected.</h2>
        <p>It shows unreleased product work. Enter the password you received with my application, or <a href="/#contact">ask me for it</a>.</p>
        <form autocomplete="off">
          <label class="field"><span class="micro">Password</span><input name="password" type="password" autocomplete="current-password" required></label>
          <p class="gate-err" role="alert"></p>
          <button class="submit" type="submit">UNLOCK</button>
        </form>
      </div>
      <div id="protected" hidden></div>
      <noscript><p>This case study needs JavaScript to unlock.</p></noscript>
      <script type="application/json" id="sealed">${JSON.stringify(sealed)}</script>`
    : readFileSync(at("content/cases", c.slug + ".html"), "utf8").trim();
  return `${HEAD(c.title + " · Yulia Vilensky", c.summary, sealed ? '<meta name="robots" content="noindex">\n' : "")}
<body>
<header class="case-header">
  ${NAV}
</header>
<section class="case-intro">
  <h1 class="case-title reveal-words" data-mount>${esc(c.title)}</h1>
  <p class="case-cap">${esc(c.capability)}</p>
  <p class="case-sum">${esc(c.summary)}</p>
</section>
${c.cover ? `<figure class="case-cover"><img src="${c.cover}" alt="${esc(c.title)}: cover image"></figure>\n` : ""}<main class="case-main">
  <aside class="details" aria-label="Project details">
      ${details}
  </aside>
  <article class="prose">
      ${body}
  </article>
</main>
${next ? `<section class="next-case">
  <p class="micro">Next case study</p>
  <a href="/work/${next.slug}">${esc(next.title)}</a>
</section>\n` : ""}<footer class="case-foot micro">
  <a class="link" href="/#work">All work</a>
  <a class="link" href="/#contact">Let’s create</a>
</footer>
<script src="/assets/site/site.js" defer></script>
<script src="/assets/site/case.js" defer></script>
</body>
</html>
`;
}

function workRow(c, i) {
  const n = String(i + 1).padStart(2, "0");
  const cover = (c.cover ? `<img src="${c.cover}" alt="" loading="lazy">` : `<span class="micro">Screens to add</span>`)
    + (c.protected ? `<span class="lock-tag micro">${LOCK}Password protected</span>` : "");
  return `      <a class="wrow" href="/work/${c.slug}">
        <div class="wrow-a"><p class="wrow-n">${n}</p><span class="btn-line micro">View project${c.protected ? " " + LOCK : ""}</span></div>
        <div class="wrow-cover">${cover}<div class="squares trail" data-grid="hover" data-cols="8" aria-hidden="true"></div></div>
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
  writeFileSync(target, casePage(c, cases[i + 1], sealed));
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
