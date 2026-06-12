const express = require('express');
const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json({ limit: '20mb' }));

// ── SQLite — prospects & tracking ────────────────────────────
const dbPath = path.join(__dirname, 'output', 'novalis.db');
if (!fs.existsSync(path.join(__dirname, 'output'))) fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS prospects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    UNIQUE NOT NULL,
    name        TEXT,
    industry    TEXT,
    phone       TEXT,
    address     TEXT,
    city        TEXT,
    color       TEXT,
    status      TEXT DEFAULT 'nouveau',
    views       INTEGER DEFAULT 0,
    last_viewed INTEGER,
    created_at  INTEGER DEFAULT (strftime('%s','now')),
    demo_url    TEXT
  );
`);
// Migration — colonne data (JSON de génération, permet la régénération)
try { db.exec('ALTER TABLE prospects ADD COLUMN data TEXT'); } catch(e) { /* existe déjà */ }

// ── Admin auth middleware ─────────────────────────────────────
const ADMIN_PASS = process.env.ADMIN_PASS || 'novalis2025';
function requireAdmin(req, res, next) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth === ADMIN_PASS) return next();
  return res.status(401).json({ success: false, error: 'Non autorisé' });
}

// CORS — permet au CRM Python (novalisia.ca) d'appeler ce service
app.use((req, res, next) => {
  const allowed = [
    'https://novalisia.ca',
    'https://www.novalisia.ca',
    process.env.CRM_ORIGIN,  // override via env si besoin
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (!origin || allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Au démarrage : copier les démos bundlées (demos/) dans le volume (output/)
const outputDir = path.join(__dirname, 'output');
const demosDir  = path.join(__dirname, 'demos');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (fs.existsSync(demosDir)) {
  for (const f of fs.readdirSync(demosDir).filter(f => f.endsWith('.html'))) {
    const dest = path.join(outputDir, f);
    fs.copyFileSync(path.join(demosDir, f), dest);
    console.log(`[seed] ${f} → output/`);
  }
}

// Seeder les métadonnées des démos bundlées dans la DB (seulement si NULL)
const BUNDLED_META = [
  { slug:'pmc-mecanique',            name:'PMC Mécanique',               industry:'garage',       phone:'819 791-0717', address:'2850 Rue King Est, Sherbrooke, QC', city:'Sherbrooke' },
  { slug:'chez-boulay-bistro-boreal',name:'Chez Boulay — Bistro Boréal', industry:'restaurant',   phone:'418 380-8166', address:'1110 Rue Saint-Jean, Québec, QC',   city:'Québec' },
  { slug:'oasis-coiffure',           name:'Oasis Coiffure',              industry:'salon',        phone:'450 628-8686', address:'655 Boul. Curé-Labelle, Laval, QC',  city:'Laval' },
  { slug:'clinique-cmi',             name:'Clinique CMI',                industry:'clinique',     phone:'450 442-1018', address:'1215 Chemin du Tremblay, Longueuil, QC', city:'Longueuil' },
  { slug:'construction-cma',         name:'Construction CMA',            industry:'construction', phone:'819 840-3349', address:'4540 Rue Charles-Malhiot, Trois-Rivières, QC', city:'Trois-Rivières' },
  { slug:'pub-le-vieux',             name:'Pub Le Vieux',                industry:'restaurant',   phone:'450 655-9117', address:'650 Boul. du Fort-Saint-Louis, Boucherville, QC', city:'Boucherville' },
];
const _seedMeta = db.prepare(`
  INSERT INTO prospects (slug,name,industry,phone,address,city)
  VALUES (?,?,?,?,?,?)
  ON CONFLICT(slug) DO UPDATE SET
    name     = COALESCE(name,     excluded.name),
    industry = COALESCE(industry, excluded.industry),
    phone    = COALESCE(phone,    excluded.phone),
    address  = COALESCE(address,  excluded.address),
    city     = COALESCE(city,     excluded.city)
`);
for (const m of BUNDLED_META) {
  if (fs.existsSync(path.join(outputDir, `${m.slug}.html`)))
    _seedMeta.run(m.slug, m.name, m.industry, m.phone, m.address, m.city);
}

// Fichiers statiques — volume output/ (inclut maintenant les démos seedées)
const staticOpts = { setHeaders: (res) => res.setHeader('X-Frame-Options', 'SAMEORIGIN') };
app.use('/demo', express.static(outputDir, staticOpts));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Upload d'images (base64 JSON) ────────────────────────────
// POST /upload-image  { filename: "exterior.jpg", data: "base64..." }
app.post('/upload-image', (req, res) => {
  const { filename, data } = req.body || {};
  if (!filename || !data) return res.status(400).json({ error: 'filename + data requis' });
  const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const imagesDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const buf = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(imagesDir, safe), buf);
  res.json({ ok: true, url: `/demo/images/${safe}` });
});

// ── Page d'upload ─────────────────────────────────────────────
app.get('/upload', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Upload photos — Novalis</title>
<style>
  body{font-family:system-ui,sans-serif;background:#07090F;color:#F1F5FF;padding:40px;max-width:700px;margin:0 auto}
  h1{font-size:22px;margin-bottom:8px}
  p{color:#64748B;font-size:14px;margin-bottom:32px}
  .slots{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
  .slot{background:#111827;border:2px dashed rgba(255,255,255,0.1);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:border-color .2s;position:relative;min-height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
  .slot:hover{border-color:#3B82F6}
  .slot.done{border-color:#10B981;border-style:solid}
  .slot img{width:100%;height:120px;object-fit:cover;border-radius:6px;display:none}
  .slot.done img{display:block}
  .slot.done .placeholder{display:none}
  .slot-name{font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.1em}
  .slot-status{font-size:12px;color:#10B981;display:none}
  .slot.done .slot-status{display:block}
  input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
  .btn{background:#3B82F6;color:#fff;border:none;padding:14px 36px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600;transition:background .2s}
  .btn:hover{background:#2563EB}
  .btn:disabled{background:#374151;cursor:not-allowed}
  .log{margin-top:20px;font-size:13px;color:#64748B;line-height:1.6}
  .ok{color:#10B981}
  .err{color:#EF4444}
</style>
</head>
<body>
<h1>Upload des photos — Taverne 1855</h1>
<p>Glisse ou clique sur chaque zone pour choisir la photo correspondante.</p>
<div class="slots">
  <div class="slot" id="slot-exterior" data-name="exterior.jpg">
    <input type="file" accept="image/*" onchange="handleFile(this,'exterior.jpg','slot-exterior')">
    <img id="prev-exterior">
    <div class="placeholder">
      <div style="font-size:28px">🏠</div>
      <div class="slot-name">Extérieur nuit</div>
    </div>
    <div class="slot-status">✓ Prêt</div>
  </div>
  <div class="slot" id="slot-bar" data-name="bar.jpg">
    <input type="file" accept="image/*" onchange="handleFile(this,'bar.jpg','slot-bar')">
    <img id="prev-bar">
    <div class="placeholder">
      <div style="font-size:28px">🍷</div>
      <div class="slot-name">Intérieur / Bar</div>
    </div>
    <div class="slot-status">✓ Prêt</div>
  </div>
  <div class="slot" id="slot-chef" data-name="chef.jpg">
    <input type="file" accept="image/*" onchange="handleFile(this,'chef.jpg','slot-chef')">
    <img id="prev-chef">
    <div class="placeholder">
      <div style="font-size:28px">👨‍🍳</div>
      <div class="slot-name">Chef / Cuisine</div>
    </div>
    <div class="slot-status">✓ Prêt</div>
  </div>
  <div class="slot" id="slot-logo" data-name="logo.png">
    <input type="file" accept="image/*" onchange="handleFile(this,'logo.png','slot-logo')">
    <img id="prev-logo">
    <div class="placeholder">
      <div style="font-size:28px">🔵</div>
      <div class="slot-name">Logo</div>
    </div>
    <div class="slot-status">✓ Prêt</div>
  </div>
</div>
<button class="btn" id="uploadBtn" onclick="uploadAll()" disabled>Uploader les photos</button>
<div class="log" id="log"></div>
<script>
  const files = {};
  function handleFile(input, name, slotId) {
    const file = input.files[0];
    if (!file) return;
    files[name] = file;
    const prev = document.getElementById('prev-' + slotId.replace('slot-',''));
    const reader = new FileReader();
    reader.onload = e => { prev.src = e.target.result; document.getElementById(slotId).classList.add('done'); };
    reader.readAsDataURL(file);
    document.getElementById('uploadBtn').disabled = false;
  }
  async function uploadAll() {
    const btn = document.getElementById('uploadBtn');
    btn.disabled = true; btn.textContent = 'Upload en cours...';
    const log = document.getElementById('log');
    log.innerHTML = '';
    for (const [name, file] of Object.entries(files)) {
      const b64 = await toB64(file);
      try {
        const r = await fetch('/upload-image', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({filename: name, data: b64})
        });
        const j = await r.json();
        if (j.ok) log.innerHTML += '<div class="ok">✓ ' + name + ' → ' + j.url + '</div>';
        else log.innerHTML += '<div class="err">✗ ' + name + ': ' + j.error + '</div>';
      } catch(e) { log.innerHTML += '<div class="err">✗ ' + name + ': ' + e.message + '</div>'; }
    }
    btn.textContent = 'Voir la démo';
    btn.onclick = () => location.href = '/demo/taverne-1855.html';
    btn.disabled = false;
  }
  function toB64(file) {
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.readAsDataURL(file);
    });
  }
</script>
</body>
</html>`);
});

// ── Debug — lister les fichiers dans output/ et demos/ ───────
app.get('/debug', (req, res) => {
  const out   = fs.existsSync(outputDir) ? fs.readdirSync(outputDir).filter(f => f.endsWith('.html')) : [];
  const demos = fs.existsSync(demosDir)  ? fs.readdirSync(demosDir).filter(f => f.endsWith('.html'))  : [];
  res.json({ output: out, demos, version: 'seed-v2' });
});

// ── Accueil — liste des démos ─────────────────────────────────
app.get('/', (req, res) => {
  const dir = path.join(__dirname, 'output');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort()
    : [];

  const base = `${req.protocol}://${req.get('host')}`;
  const items = files.map(f => {
    const slug = f.replace('.html', '');
    const name = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `<div class="item">
      <span>${name}</span>
      <a href="${base}/demo/${f}" target="_blank">Voir la démo →</a>
    </div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Novalis IA — Démos</title>
<style>
  body{font-family:system-ui,sans-serif;background:#07090F;color:#F1F5FF;padding:40px;max-width:860px;margin:0 auto}
  h1{font-size:28px;margin-bottom:6px;font-weight:600}
  p{color:#64748B;margin-bottom:36px;font-size:14px}
  .item{background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .item span{font-size:14px;color:#CBD5E1}
  .item a{color:#3B82F6;text-decoration:none;font-size:13px;font-weight:500}
  .item a:hover{text-decoration:underline}
  .empty{color:#374151;font-style:italic;font-size:14px}
</style>
</head>
<body>
  <h1>Novalis IA</h1>
  <p>${files.length} démo${files.length !== 1 ? 's' : ''} générée${files.length !== 1 ? 's' : ''}</p>
  ${items || '<div class="empty">Aucune démo pour l\'instant.</div>'}
</body>
</html>`);
});

// ── Générer un site ───────────────────────────────────────────
// Protégé par clé API (variable d'env PREVIEW_API_KEY)
app.post('/generate', async (req, res) => {
  const apiKey = process.env.PREVIEW_API_KEY;
  if (apiKey) {
    const auth = req.headers.authorization || '';
    if (auth.replace('Bearer ', '') !== apiKey) {
      return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
  }

  try {
    const { generate, extractSitePhotos } = require('./generate');
    const data = { ...req.body };

    // Scraper le site existant pour extraire les vraies photos
    if (data.siteExistant && !data.sitePhotos) {
      try {
        const https = require('https');
        const http  = require('http');
        const siteHtml = await new Promise((resolve, reject) => {
          const mod = data.siteExistant.startsWith('https') ? https : http;
          const req2 = mod.get(data.siteExistant, { timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovalisBot/1.0)' }
          }, (r) => {
            let body = '';
            r.on('data', c => body += c);
            r.on('end', () => resolve(body));
          });
          req2.on('error', reject);
          req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
        });
        const photos = extractSitePhotos(siteHtml);
        if (photos.length > 0) {
          data.sitePhotos = photos;
          console.log(`[scrape] ${photos.length} photos extraites de ${data.siteExistant}`);
        }
      } catch (scrapeErr) {
        console.warn(`[scrape] impossible d'accéder à ${data.siteExistant}: ${scrapeErr.message}`);
      }
    }

    const result = await generate(data);
    const base = `${req.protocol}://${req.get('host')}`;
    const demoUrl = `${base}/demo/${result.slug}.html`;
    console.log(`[generate] ${result.slug} → ${demoUrl}`);
    res.json({ success: true, url: demoUrl, slug: result.slug });
  } catch (err) {
    console.error('[generate error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Photo scraper — extrait et télécharge les vraies photos du site PME ──────
async function scrapePhotos(websiteUrl, slug, logoUrl) {
  const imagesDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const KEYS = ['exterior', 'interior', 'service', 'about'];
  let saved = 0;

  const { fetchHtml, fetchSiteHtml } = require('./discover');

  function downloadBuf(url, timeout = 6000) {
    const https_ = require('https'), http_ = require('http');
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https_ : http_;
      const timer = setTimeout(() => reject(new Error('timeout')), timeout);
      const chunks = [];
      mod.get(url, { headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        'Accept-Language': 'fr-CA,fr;q=0.9',
      }, timeout }, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          clearTimeout(timer);
          return resolve(downloadBuf(res.headers.location, timeout));
        }
        if (res.statusCode !== 200) { clearTimeout(timer); return reject(new Error(`HTTP ${res.statusCode}`)); }
        res.on('data', c => chunks.push(c));
        res.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      }).on('error', e => { clearTimeout(timer); reject(e); });
    });
  }

  // Indices sémantiques — pour assigner chaque photo au bon rôle
  const HINTS = {
    exterior: /ext[ée]rieur|fa[cç]ade|devanture|enseigne|building|storefront|exterior|front|aerial|drone/i,
    interior: /int[ée]rieur|salle|dining|interior|ambiance|d[ée]cor|lobby|accueil|r[ée]ception|salon(?!-)/i,
    service:  /plat|food|menu-|cuisine|assiette|dish|service|atelier|soin|treatment|coupe|coiffure|chantier|projet|m[ée]canique|repair|travaux|work/i,
    about:    /[ée]quipe|team|staff|portrait|chef|propri[ée]taire|owner|personnel|fondateur/i,
  };

  function extractImages(html, baseUrl) {
    const seen = new Set(), images = [];
    function normalise(src) {
      if (!src) return '';
      try {
        return src.startsWith('//') ? 'https:' + src
          : src.startsWith('/') ? new URL(baseUrl).origin + src
          : src.startsWith('http') ? src
          : new URL(src, baseUrl).href;
      } catch(e) { return ''; }
    }
    function add(src, hintText, bypassFilter = false) {
      const u = normalise(src);
      if (!u.startsWith('http')) return;
      if (/\.(svg|gif|ico)(\?|$)/i.test(u)) return;
      if (!bypassFilter && /icon|logo|badge|pixel|1x1|sprite|arrow|favicon|btn-|loading/i.test(u)) return;
      if (seen.has(u)) return;
      seen.add(u); images.push({ url: u, text: (hintText || '') + ' ' + u });
    }
    // og:image / twitter:image : photo principale choisie par le propriétaire du site —
    // bypass du filtre logo/icon car certains CDN ont "logo" dans le chemin
    const ogM = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogM) add(ogM[1], 'exterior facade og', true);
    const twM = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twM) add(twM[1], '', true);
    // All img tags — alt + class servent d'indices sémantiques.
    // Gère le lazy-loading moderne : data-src, data-lazy-src, srcset.
    const imgRe = /<img[^>]+>/gi;
    let m;
    while ((m = imgRe.exec(html)) !== null) {
      const tag = m[0];
      const wm = tag.match(/width=["']?(\d+)/i);
      if (wm && parseInt(wm[1]) < 150) continue;
      const altM = tag.match(/alt=["']([^"']*)["']/i);
      const clsM = tag.match(/class=["']([^"']*)["']/i);
      const hint = `${altM ? altM[1] : ''} ${clsM ? clsM[1] : ''}`;
      // Priorité au lazy-load (le src est souvent un placeholder vide)
      const lazyM = tag.match(/data-(?:lazy-)?src=["']([^"'#][^"']+)["']/i);
      const srcsetM = tag.match(/(?:data-)?srcset=["']([^"']+)["']/i);
      const srcM = tag.match(/\ssrc=["']([^"'#][^"']+)["']/i);
      if (srcsetM) {
        // Prendre la plus grande candidate du srcset
        const candidates = srcsetM[1].split(',').map(s => s.trim().split(/\s+/));
        const best = candidates.sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
        if (best && best[0]) add(best[0], hint);
      }
      if (lazyM) add(lazyM[1], hint);
      else if (srcM && !/data:image|blank|placeholder|spacer/i.test(srcM[1])) add(srcM[1], hint);
      if (images.length >= 18) break;
    }
    // Images de fond CSS inline — très courant sur les sites de restos
    const bgRe = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((m = bgRe.exec(html)) !== null) {
      add(m[1], 'background hero');
      if (images.length >= 22) break;
    }
    return images;
  }

  try {
    // Site direct, ou copie archive.org si le site bloque les robots
    const { html, effectiveUrl, viaArchive } = await fetchSiteHtml(websiteUrl);
    const images = extractImages(html, effectiveUrl);
    // Enrich with subpages for variety (inutile via archive — chemins différents)
    if (!viaArchive) {
      for (const sub of ['/a-propos', '/about', '/services', '/galerie', '/gallery']) {
        if (images.length >= 12) break;
        try {
          const origin = new URL(websiteUrl).origin;
          const subHtml = await fetchHtml(origin + sub, 4000);
          for (const img of extractImages(subHtml, origin + sub)) {
            if (!images.some(i => i.url === img.url)) images.push(img);
          }
        } catch(e) {}
      }
    }

    // Assigner chaque rôle à la photo qui lui correspond le mieux (alt/class/src),
    // puis combler les rôles restants avec les photos non utilisées, dans l'ordre.
    const assignment = {};
    const used = new Set();
    for (const key of KEYS) {
      const match = images.find(i => !used.has(i.url) && HINTS[key].test(i.text));
      if (match) { assignment[key] = match.url; used.add(match.url); }
    }
    for (const key of KEYS) {
      if (assignment[key]) continue;
      const next = images.find(i => !used.has(i.url));
      if (next) { assignment[key] = next.url; used.add(next.url); }
    }

    for (const key of KEYS) {
      if (!assignment[key]) continue;
      try {
        const buf = await downloadBuf(assignment[key], 5000);
        if (buf.length < 8192) continue; // trop petit ou placeholder
        // Validation magic bytes — évite de sauvegarder une page HTML comme .jpg
        const isImage =
          (buf[0] === 0x89 && buf[1] === 0x50) ||          // PNG
          (buf[0] === 0xFF && buf[1] === 0xD8) ||          // JPEG
          (buf.slice(0,4).toString('ascii') === 'RIFF') || // WEBP
          (buf.slice(0,3).toString('ascii') === 'GIF');    // GIF
        if (!isImage) {
          console.warn(`[photos] skip ${key}: pas une image (${buf.slice(0,4).toString('hex')})`);
          continue;
        }
        fs.writeFileSync(path.join(imagesDir, `${slug}-${key}.jpg`), buf);
        console.log(`[photos] ${key}: ${assignment[key].slice(0, 70)} (${Math.round(buf.length/1024)}kb)`);
        saved++;
      } catch(e) {
        console.warn(`[photos] skip ${key}: ${e.message}`);
      }
    }

    // Logo de l'entreprise → affiché dans le splash
    if (logoUrl) {
      try {
        const buf = await downloadBuf(logoUrl, 5000);
        const isRaster = buf.length > 800 && (
          (buf[0] === 0x89 && buf[1] === 0x50) ||
          (buf[0] === 0xFF && buf[1] === 0xD8) ||
          (buf.slice(0,4).toString('ascii') === 'RIFF') ||
          (buf.slice(0,3).toString('ascii') === 'GIF')
        );
        const isSvg = buf.length > 100 && (
          buf.slice(0,5).toString().includes('<svg') ||
          buf.slice(0,6).toString().includes('<?xml')
        );
        if (isRaster) {
          fs.writeFileSync(path.join(imagesDir, `${slug}-logo.png`), buf);
          console.log(`[photos] logo raster: ${logoUrl.slice(0, 70)}`);
          saved++;
        } else if (isSvg) {
          fs.writeFileSync(path.join(imagesDir, `${slug}-logo.svg`), buf);
          console.log(`[photos] logo SVG: ${logoUrl.slice(0, 70)}`);
          saved++;
        } else {
          console.warn(`[photos] logo format inconnu, utilisation URL directe`);
        }
      } catch(e) { console.warn(`[photos] logo skip: ${e.message}`); }
    }
  } catch(e) {
    console.warn(`[photos] scrape error: ${e.message}`);
  }
  return saved;
}

// ── Enrichissement marque — la démo reflète la vraie entreprise ──────────────
// Complète les champs manquants avec ce que dit LEUR site : slogan, couleur,
// services réels, année, téléphone, adresse. Retourne les infos brutes (logo).
async function enrichWithBrand(data) {
  if (!data.website) return null;
  try {
    const { researchBrand } = require('./brand-research');
    const brand = await researchBrand(data.website);
    if (!brand) return null;
    const { CONFIGS } = require('./generate-cinematic');
    const cfg = CONFIGS[data.industry] || CONFIGS.restaurant;
    if (!data.tagline && brand.description) data.tagline = brand.description.slice(0, 140);
    if (!data.aboutText && brand.description && brand.description.length > 60) data.aboutText = brand.description;
    if (brand.color && (!data.color || data.color.toLowerCase() === cfg.palette.primary.toLowerCase())) {
      data.color = brand.color;
    }
    if ((!data.services || !data.services.length) && brand.services && brand.services.length >= 2) {
      data.services = brand.services.slice(0, 4);
    }
    if (!data.founded && brand.founded) data.founded = brand.founded;
    if (!data.phone && brand.phone) data.phone = brand.phone;
    if (!data.address && brand.address) data.address = brand.address;
    if (!data.hours && brand.hours) data.hours = brand.hours;
    console.log(`[brand] ${data.website} → desc:${brand.description?'oui':'non'} couleur:${brand.color||'non'} services:${brand.services.length} logo:${brand.logoUrl?'oui':'non'} pages:${brand.pagesScraped}`);
    return brand;
  } catch(e) {
    console.warn('[brand]', e.message);
    return null;
  }
}

// ── Admin auth check ─────────────────────────────────────────
app.post('/admin-auth', (req, res) => {
  const { key } = req.body || {};
  res.json({ ok: key === ADMIN_PASS });
});

// ── Admin panel ───────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Générer démo cinématique personnalisée ────────────────────
app.post('/generate-cinematic', requireAdmin, async (req, res) => {
  try {
    const { generateCinematic } = require('./generate-cinematic');
    const data   = { ...req.body };
    const base   = `${req.protocol}://${req.get('host')}`;

    // Si un site existe : extraire leur identité (slogan, couleur, services, logo)
    const brand = await enrichWithBrand(data);

    const result = generateCinematic({
      ...data,
      logoUrl: data.logoUrl || (brand && brand.logoUrl) || '',
      baseUrl: base,
    });

    const dest = path.join(outputDir, `${result.slug}.html`);
    fs.writeFileSync(dest, result.html, 'utf8');

    const demoUrl = `${base}/demo/${result.slug}.html`;

    // Persist prospect — incluant les données complètes pour régénération
    const city = (data.address || '').split(',').slice(-2)[0]?.trim() || '';
    const genData = JSON.stringify({ ...data, logoUrl: data.logoUrl || (brand && brand.logoUrl) || '' });
    db.prepare(`
      INSERT INTO prospects (slug,name,industry,phone,address,city,color,demo_url,data)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(slug) DO UPDATE SET
        name=excluded.name, industry=excluded.industry,
        phone=excluded.phone, address=excluded.address,
        city=excluded.city, color=excluded.color, demo_url=excluded.demo_url,
        data=excluded.data
    `).run(result.slug, data.name, data.industry||'restaurant', data.phone||'', data.address||'', city, data.color||'', demoUrl, genData);

    // Télécharger les photos via brand-research si un site est fourni
    let photosFound = 0;
    if (data.website && brand && brand.photoAssignment) {
      try {
        const { downloadBrandPhotos } = require('./brand-research');
        const imagesDir2 = path.join(outputDir, 'images');
        const dlResult = await downloadBrandPhotos(brand.photoAssignment, brand.logoUrl || '', result.slug, imagesDir2);
        photosFound = dlResult.saved;
        // Re-générer avec les chemins locaux confirmés
        if (photosFound > 0) {
          const logoExt2   = fs.existsSync(path.join(imagesDir2, `${result.slug}-logo.svg`)) ? 'svg' : 'png';
          const logoLocal2 = fs.existsSync(path.join(imagesDir2, `${result.slug}-logo.${logoExt2}`))
            ? `/demo/images/${result.slug}-logo.${logoExt2}` : '';
          const result2 = generateCinematic({ ...data, photos: dlResult.photos, logoUrl: logoLocal2 || (brand && brand.logoUrl) || data.logoUrl || '' });
          fs.writeFileSync(dest, result2.html, 'utf8');
          console.log(`[cinematic] HTML régénéré avec ${Object.keys(dlResult.photos).length} photos locales`);
        }
      } catch(e) { console.warn('[photos]', e.message); }
    } else if (data.website) {
      // Fallback: ancien scraper si brand-research échoue
      try {
        photosFound = await scrapePhotos(data.website, result.slug, brand && brand.logoUrl);
      } catch(e) { console.warn('[photos fallback]', e.message); }
    }

    console.log(`[cinematic] ${result.slug} → ${demoUrl}`);
    res.json({ success: true, url: demoUrl, slug: result.slug, photosFound });
  } catch (err) {
    console.error('[generate-cinematic]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Découverte de PME — recherche DuckDuckGo ──────────────────
// POST /discover-search { query } → liste de sites candidats
app.post('/discover-search', requireAdmin, async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, error: 'query requis' });
    }
    const { ddgSearch } = require('./discover');
    const results = await ddgSearch(query.trim() + ' Québec', 10);
    // Marquer les sites dont une démo existe déjà (par domaine)
    const existing = db.prepare('SELECT slug, name FROM prospects').all();
    res.json({ success: true, results, existingCount: existing.length });
  } catch (err) {
    console.error('[discover-search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /discover-generate { url, industry, city, title } →
// Recherche de marque approfondie (multi-pages, JSON-LD, sémantique),
// génère la démo cinématique personnalisée + photos, ajoute le prospect.
app.post('/discover-generate', requireAdmin, async (req, res) => {
  try {
    const { url, industry, city, title } = req.body || {};
    if (!url) return res.status(400).json({ success: false, error: 'url requis' });

    const { researchBrand, downloadBrandPhotos } = require('./brand-research');
    const { extractName } = require('./discover');
    const { generateCinematic, CONFIGS } = require('./generate-cinematic');

    const base      = `${req.protocol}://${req.get('host')}`;
    const imagesDir = path.join(outputDir, 'images');
    const cfg       = CONFIGS[industry] || CONFIGS.restaurant;

    // ── 1. Recherche approfondie ───────────────────────────────
    const brand = await researchBrand(url);

    // ── 2. Dériver nom + slug ──────────────────────────────────
    const slugify = s => s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);

    const name = (brand && brand.name) || extractName(title, '') || 'Mon Entreprise';
    const slug = slugify(name);

    // ── 3. Télécharger les photos ──────────────────────────────
    let dlResult = { photos: {}, saved: 0 };
    if (brand && brand.photoAssignment) {
      dlResult = await downloadBrandPhotos(brand.photoAssignment, brand.logoUrl || '', slug, imagesDir);
    }

    // ── 4. Vérifier logo local ─────────────────────────────────
    const logoExt   = fs.existsSync(path.join(imagesDir, `${slug}-logo.svg`)) ? 'svg' : 'png';
    const logoLocal = fs.existsSync(path.join(imagesDir, `${slug}-logo.${logoExt}`))
      ? `/demo/images/${slug}-logo.${logoExt}` : '';

    // ── 5. Stats enrichies avec le vrai rating Google ──────────
    let stats;
    if (brand && brand.rating) {
      const reviewLabel = brand.reviewCount ? ` · ${brand.reviewCount} avis` : '';
      stats = [
        ...cfg.defaultStats.slice(0, 3),
        { num: brand.rating, label: `note Google${reviewLabel}` },
      ];
    }

    // ── 6. Générer le HTML personnalisé ───────────────────────
    const genData = {
      industry: industry || 'restaurant',
      name,
      slug,
      phone:     (brand && brand.phone)   || '',
      address:   (brand && brand.address) || (city ? `${city}, QC` : ''),
      city:      city || '',
      founded:   (brand && brand.founded) || '',
      tagline:   (brand && brand.description) ? brand.description.slice(0, 140) : '',
      aboutText: (brand && brand.description && brand.description.length > 60) ? brand.description : '',
      color:     (brand && brand.color)   || '',
      services:  (brand && brand.services && brand.services.length >= 2) ? brand.services.slice(0, 4) : undefined,
      stats,
      hours:     (brand && brand.hours)   || undefined,
      website:   url,
      logoUrl:   (brand && brand.logoUrl) || '',
      baseUrl:   base,
    };
    const result = generateCinematic({
      ...genData,
      photos:  dlResult.photos,
      logoUrl: logoLocal || genData.logoUrl,
    });

    fs.writeFileSync(path.join(outputDir, `${result.slug}.html`), result.html, 'utf8');
    const demoUrl = `${base}/demo/${result.slug}.html`;

    db.prepare(`
      INSERT INTO prospects (slug,name,industry,phone,address,city,color,demo_url,data)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(slug) DO UPDATE SET
        name=excluded.name, industry=excluded.industry,
        phone=excluded.phone, address=excluded.address,
        city=excluded.city, color=excluded.color, demo_url=excluded.demo_url,
        data=excluded.data
    `).run(result.slug, name, industry || 'restaurant',
       (brand && brand.phone) || '',
       (brand && brand.address) || '',
       city || '', (brand && brand.color) || '',
       demoUrl, JSON.stringify(genData));

    console.log(`[discover] ${name} → ${demoUrl} (${brand ? brand.pagesScraped : 0} pages, ${dlResult.saved} photos)`);
    res.json({
      success: true, url: demoUrl, slug: result.slug,
      photosFound: dlResult.saved,
      name,
      phone:   (brand && brand.phone)   || '',
      address: (brand && brand.address) || '',
    });
  } catch (err) {
    console.error('[discover-generate]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Tracking pixel ────────────────────────────────────────────
// Pixel 1×1 GIF transparent — compté à chaque vue de démo
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/t/:slug', (req, res) => {
  const { slug } = req.params;
  try {
    db.prepare(`
      INSERT INTO prospects (slug, views, last_viewed) VALUES (?, 1, strftime('%s','now'))
      ON CONFLICT(slug) DO UPDATE SET
        views = views + 1,
        last_viewed = strftime('%s','now')
    `).run(slug);
  } catch(e) { /* ignore */ }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store');
  res.send(PIXEL);
});

// ── Régénération d'une démo depuis les données stockées ──────
// Re-scanne les photos locales (incluant celles remplacées manuellement)
// et reconstruit le HTML.
function regenerateDemo(slug, baseUrl) {
  const row = db.prepare('SELECT data FROM prospects WHERE slug=?').get(slug);
  if (!row || !row.data) throw new Error('Données de génération introuvables pour ' + slug);
  const data = JSON.parse(row.data);
  const imagesDir = path.join(outputDir, 'images');
  const photos = {};
  for (const k of ['exterior','interior','service','about']) {
    if (fs.existsSync(path.join(imagesDir, `${slug}-${k}.jpg`)))
      photos[k] = `/demo/images/${slug}-${k}.jpg?v=${Date.now()}`;
  }
  const logoExt = fs.existsSync(path.join(imagesDir, `${slug}-logo.svg`)) ? 'svg' : 'png';
  const logoLocal = fs.existsSync(path.join(imagesDir, `${slug}-logo.${logoExt}`))
    ? `/demo/images/${slug}-logo.${logoExt}` : '';
  const { generateCinematic } = require('./generate-cinematic');
  const result = generateCinematic({
    ...data, slug, photos,
    logoUrl: logoLocal || data.logoUrl || '',
    baseUrl: baseUrl || data.baseUrl || '',
  });
  fs.writeFileSync(path.join(outputDir, `${result.slug}.html`), result.html, 'utf8');
  return result;
}

// ── Photos d'une démo — état actuel des 5 emplacements ───────
app.get('/prospects/:slug/photos', requireAdmin, (req, res) => {
  const { slug } = req.params;
  const imagesDir = path.join(outputDir, 'images');
  const photos = {};
  for (const k of ['exterior','interior','service','about']) {
    const f = path.join(imagesDir, `${slug}-${k}.jpg`);
    photos[k] = fs.existsSync(f) ? `/demo/images/${slug}-${k}.jpg?v=${fs.statSync(f).mtimeMs}` : null;
  }
  let logo = null;
  for (const ext of ['svg','png']) {
    const f = path.join(imagesDir, `${slug}-logo.${ext}`);
    if (fs.existsSync(f)) { logo = `/demo/images/${slug}-logo.${ext}?v=${fs.statSync(f).mtimeMs}`; break; }
  }
  const row = db.prepare('SELECT data FROM prospects WHERE slug=?').get(slug);
  res.json({ success: true, photos, logo, canRegenerate: !!(row && row.data) });
});

// ── Remplacer une photo (base64) et régénérer la démo ────────
app.post('/prospects/:slug/photo', requireAdmin, (req, res) => {
  try {
    const { slug } = req.params;
    const { role, data } = req.body || {};
    if (!role || !data) return res.status(400).json({ success: false, error: 'role + data requis' });
    if (!['exterior','interior','service','about','logo'].includes(role)) {
      return res.status(400).json({ success: false, error: 'role invalide' });
    }
    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    const buf = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (buf.length < 1024) return res.status(400).json({ success: false, error: 'image trop petite' });
    const filename = role === 'logo' ? `${slug}-logo.png` : `${slug}-${role}.jpg`;
    // Un logo remplacé manuellement écrase aussi l'éventuel SVG
    if (role === 'logo') {
      const svgPath = path.join(imagesDir, `${slug}-logo.svg`);
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
    fs.writeFileSync(path.join(imagesDir, filename), buf);

    // Régénérer le HTML avec la nouvelle photo
    let regenerated = false;
    try {
      const base = `${req.protocol}://${req.get('host')}`;
      regenerateDemo(slug, base);
      regenerated = true;
    } catch(e) { console.warn('[photo-replace] regen:', e.message); }

    console.log(`[photo-replace] ${slug}/${role} (${Math.round(buf.length/1024)}kb) regen:${regenerated}`);
    res.json({ success: true, regenerated, url: `/demo/images/${filename}?v=${Date.now()}` });
  } catch (err) {
    console.error('[photo-replace]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Régénérer une démo manuellement ───────────────────────────
app.post('/prospects/:slug/regenerate', requireAdmin, (req, res) => {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const result = regenerateDemo(req.params.slug, base);
    res.json({ success: true, url: `${base}/demo/${result.slug}.html` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Supprimer une démo + son prospect ────────────────────────
app.delete('/prospects/:slug', requireAdmin, (req, res) => {
  const { slug } = req.params;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ success: false, error: 'slug invalide' });
  }
  // Supprimer le HTML
  const htmlPath = path.join(outputDir, `${slug}.html`);
  if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
  // Supprimer les images associées
  const imagesDir = path.join(outputDir, 'images');
  for (const role of ['exterior', 'interior', 'service', 'about']) {
    const f = path.join(imagesDir, `${slug}-${role}.jpg`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  for (const ext of ['png', 'svg']) {
    const f = path.join(imagesDir, `${slug}-logo.${ext}`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // Supprimer de la DB
  db.prepare('DELETE FROM prospects WHERE slug=?').run(slug);
  console.log(`[delete] ${slug}`);
  res.json({ success: true });
});

// ── Liste des prospects ───────────────────────────────────────
app.get('/prospects', requireAdmin, (req, res) => {
  const prospects = db.prepare('SELECT * FROM prospects ORDER BY created_at DESC').all();
  res.json({ prospects });
});

// ── Mettre à jour statut prospect ────────────────────────────
app.post('/prospects/:slug/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  db.prepare('UPDATE prospects SET status=? WHERE slug=?').run(status, req.params.slug);
  res.json({ ok: true });
});

// ── Récupérer l'URL d'une démo existante ─────────────────────
app.get('/demo-url/:slug', (req, res) => {
  const file = path.join(__dirname, 'output', `${req.params.slug}.html`);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: 'Démo introuvable' });
  }
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ success: true, url: `${base}/demo/${req.params.slug}.html` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Novalis Preview en ligne → http://0.0.0.0:${PORT}`);
});
