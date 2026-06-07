const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json({ limit: '2mb' }));

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

// Fichiers statiques — démos générées (volume) puis démos bundlées (git repo)
const staticOpts = { setHeaders: (res) => res.setHeader('X-Frame-Options', 'SAMEORIGIN') };
app.use('/demo', express.static(path.join(__dirname, 'output'), staticOpts));
app.use('/demo', express.static(path.join(__dirname, 'demos'),  staticOpts));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

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
