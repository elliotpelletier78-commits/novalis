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
    const result = generateCinematic({ ...data, baseUrl: base });

    const dest = path.join(outputDir, `${result.slug}.html`);
    fs.writeFileSync(dest, result.html, 'utf8');

    const demoUrl = `${base}/demo/${result.slug}.html`;

    // Persist prospect
    const city = (data.address || '').split(',').slice(-2)[0]?.trim() || '';
    db.prepare(`
      INSERT INTO prospects (slug,name,industry,phone,address,city,color,demo_url)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(slug) DO UPDATE SET
        name=excluded.name, industry=excluded.industry,
        phone=excluded.phone, address=excluded.address,
        city=excluded.city, color=excluded.color, demo_url=excluded.demo_url
    `).run(result.slug, data.name, data.industry||'restaurant', data.phone||'', data.address||'', city, data.color||'', demoUrl);

    console.log(`[cinematic] ${result.slug} → ${demoUrl}`);
    res.json({ success: true, url: demoUrl, slug: result.slug });
  } catch (err) {
    console.error('[generate-cinematic]', err);
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
