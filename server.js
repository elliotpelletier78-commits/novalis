const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const Database = require('better-sqlite3');

const app = express();
// Railway place un proxy devant l'app : sans ceci, req.ip vaut l'IP du proxy et
// les limiteurs de débit se fient au premier élément (client-contrôlé) de
// X-Forwarded-For — un attaquant le change à chaque requête et n'est jamais
// étranglé. « 1 » = un seul proxy de confiance devant nous ; req.ip prend alors
// le dernier saut avant ce proxy, non falsifiable par le client.
app.set('trust proxy', 1);
app.use(express.json({ limit: '20mb' }));

// ── SQLite — prospects & tracking ────────────────────────────
// DATABASE_PATH permet de pointer la base sur le volume persistant Railway
// explicitement. Défaut historique : output/. Si la base n'existait pas au
// démarrage EN PRODUCTION, on crie : soit c'est le tout premier lancement, soit
// — bien plus grave — le volume n'est pas monté et on repart sur un disque
// éphémère qui sera perdu au prochain déploiement, sans le moindre signal.
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'output', 'novalis.db');
const dbExistait = fs.existsSync(dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (!dbExistait && process.env.NODE_ENV === 'production') {
  console.warn(`[db] ⚠️ base absente à ${dbPath} au démarrage — premier lancement, OU volume non monté (données perdues au prochain deploy). Vérifier le montage du volume Railway.`);
}
const db = new Database(dbPath);
// Réglages SQLite appliqués UNE fois à l'ouverture. Le README et core/queue.js
// supposent le mode WAL, mais rien ne l'activait : la base tournait en mode
// « delete », où chaque écriture verrouille toute la base en exclusif (un simple
// dump de sauvegarde se heurtait à SQLITE_BUSY). WAL est aussi le prérequis de
// toute réplication (Litestream). busy_timeout évite qu'un accès concurrent
// échoue brutalement au lieu d'attendre. foreign_keys applique les contraintes
// déclarées dans les migrations.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL'); // sûr avec WAL, nettement plus rapide
db.pragma('foreign_keys = ON');
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

// ── Admin auth ────────────────────────────────────────────────
// Aucune valeur par défaut : un mot de passe écrit en dur dans un dépôt
// public n'est pas un mot de passe. Si ADMIN_PASS est absent, toute la
// surface admin refuse l'accès (fail-closed) — mais la vitrine continue
// de servir, parce qu'un site muet ne protège personne.
const ADMIN_PASS = process.env.ADMIN_PASS || null;
if (!ADMIN_PASS) {
  console.error('[auth] ADMIN_PASS absent — surface admin VERROUILLÉE. Définir la variable d\'environnement.');
}

/**
 * Comparaison à temps constant. On hache les deux côtés avant de comparer :
 * timingSafeEqual exige des tampons de même longueur, et hacher évite de
 * révéler la longueur du secret attendu via une erreur ou un temps de retour.
 */
function memeSecret(fourni, attendu) {
  if (typeof fourni !== 'string' || !fourni || !attendu) return false;
  const a = crypto.createHash('sha256').update(fourni, 'utf8').digest();
  const b = crypto.createHash('sha256').update(attendu, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Session par cookie signé (HMAC) — remplace le mot de passe dans l'URL ──
// La clé de signature vient du MASTER_KEY (secret d'exploitation) ; à défaut,
// du mot de passe admin. Le jeton ne porte aucune donnée sensible, juste une
// preuve « authentifié » horodatée et infalsifiable.
const SESS_KEY = process.env.MASTER_KEY || ADMIN_PASS || 'novalis-session-fallback';
const SESS_TTL = 30 * 24 * 3600 * 1000; // 30 jours
function signSession() {
  const payload = 'a.' + (Date.now() + SESS_TTL);
  const sig = crypto.createHmac('sha256', SESS_KEY).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifySession(token) {
  if (typeof token !== 'string' || token.length > 512) return false;
  const i = token.lastIndexOf('.');
  if (i <= 0) return false;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  const attendu = crypto.createHmac('sha256', SESS_KEY).update(payload).digest('base64url');
  let ok = false;
  try { ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(attendu)); } catch { return false; }
  if (!ok) return false;
  const exp = parseInt(payload.split('.')[1], 10);
  return Number.isFinite(exp) && exp > Date.now();
}
function lireCookie(req, nom) {
  const h = req.headers.cookie;
  if (!h) return null;
  for (const part of h.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === nom) return part.slice(idx + 1).trim();
  }
  return null;
}
function poserSession(req, res) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  let c = 'nv_session=' + signSession() + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + (SESS_TTL / 1000);
  if (secure) c += '; Secure';
  res.setHeader('Set-Cookie', c);
}
function effacerSession(res) {
  res.setHeader('Set-Cookie', 'nv_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}
// Authentifié = session valide OU (compat) en-tête/paramètre pass correct.
function estAuthentifie(req) {
  if (!ADMIN_PASS) return false;
  const c = lireCookie(req, 'nv_session');
  if (c && verifySession(c)) return true;
  const given = req.headers['x-admin-pass'] || req.query.pass || (req.body && req.body.pass);
  return memeSecret(given, ADMIN_PASS);
}
function cheminLocal(n) {
  n = String(n || '');
  return (n.startsWith('/') && !n.startsWith('//')) ? n.slice(0, 300) : '';
}

// Étranglement des tentatives ratées par IP : sans ça, un mot de passe
// unique sans session est cassable par force brute en quelques heures.
const ADMIN_MAX_ESSAIS = 8;
const ADMIN_FENETRE_MS = 15 * 60 * 1000;
const essaisAdmin = new Map(); // ip → { n, jusqua }

function ipDe(req) {
  // req.ip est fiable grâce à app.set('trust proxy', 1) — non falsifiable par
  // le client, contrairement à la lecture directe de X-Forwarded-For.
  return req.ip || 'inconnue';
}
function adminBloque(req) {
  const e = essaisAdmin.get(ipDe(req));
  return !!(e && e.n >= ADMIN_MAX_ESSAIS && Date.now() < e.jusqua);
}
function noterEchecAdmin(req) {
  const ip = ipDe(req);
  const e = essaisAdmin.get(ip);
  if (e && Date.now() < e.jusqua) e.n += 1;
  else essaisAdmin.set(ip, { n: 1, jusqua: Date.now() + ADMIN_FENETRE_MS });
}
function noterSuccesAdmin(req) { essaisAdmin.delete(ipDe(req)); }
// Purge périodique : la Map ne doit pas grossir indéfiniment.
setInterval(() => {
  const t = Date.now();
  for (const [ip, e] of essaisAdmin) if (t >= e.jusqua) essaisAdmin.delete(ip);
}, 10 * 60 * 1000).unref();

function requireAdmin(req, res, next) {
  if (!ADMIN_PASS) return res.status(503).json({ success: false, error: 'Administration non configurée' });
  if (adminBloque(req)) return res.status(429).json({ success: false, error: 'Trop de tentatives — réessayer plus tard' });
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (memeSecret(auth, ADMIN_PASS)) { noterSuccesAdmin(req); return next(); }
  noterEchecAdmin(req);
  return res.status(401).json({ success: false, error: 'Non autorisé' });
}

// Accès à /generate : la clé d'aperçu (utilisée par le CRM) OU l'admin. Ne
// tombe JAMAIS en accès libre — l'ancienne version était publique quand
// PREVIEW_API_KEY n'était pas défini, ce qui laissait n'importe qui écrire du
// HTML arbitraire servi depuis l'origine de production (hameçonnage, XSS).
function requireGenerate(req, res, next) {
  const fourni = (req.headers.authorization || '').replace('Bearer ', '');
  const cle = process.env.PREVIEW_API_KEY;
  if (cle && memeSecret(fourni, cle)) return next();
  return requireAdmin(req, res, next);
}

// Extensions d'image autorisées à l'écriture dans le volume. Sans ça, un
// « nom de fichier » comme evil.html s'écrivait dans /demo/images/ et se
// servait en text/html depuis l'origine de production.
const EXT_IMAGE_OK = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg']);
function nomImageSur(filename) {
  const safe = path.basename(String(filename)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(safe).toLowerCase();
  return EXT_IMAGE_OK.has(ext) ? safe : null;
}

// Garde-fou SSRF : refuse les URL qui pointent vers le réseau interne. Même
// derrière l'admin, un opérateur ne doit pas pouvoir faire sonder le réseau
// privé de Railway par le serveur. On bloque les schémas non-http(s), les
// hôtes littéraux privés/loopback, et les noms d'hôte évidents de métadonnées.
function urlPubliqueSure(brut) {
  let u;
  try { u = new URL(String(brut)); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === 'metadata.google.internal') return false;
  if (/^127\./.test(h) || h === '0.0.0.0' || h === '::1' || h === '[::1]') return false;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false; // CGNAT 100.64/10
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return false; // ULA / lien-local IPv6
  return true;
}

// CORS — permet au CRM Python (novalisia.ca) d'appeler ce service
app.use((req, res, next) => {
  const allowed = [
    'https://novalisia.ca',
    'https://www.novalisia.ca',
    process.env.CRM_ORIGIN,  // override via env si besoin
  ].filter(Boolean);
  const origin = req.headers.origin;
  // Liste blanche stricte. L'ancienne version ouvrait à TOUTE origine dès que
  // NODE_ENV n'était pas exactement 'production' — variable facile à oublier
  // sur Railway, et « oubliée » voulait dire « API lisible par n'importe quel
  // site ». Le développement local est autorisé explicitement, pas par défaut.
  const localDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  if (origin && (allowed.includes(origin) || localDev)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
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

// ── Purge des faux sites d'entreprises réelles ────────────────
// Ces commerces existent vraiment (nom, adresse, téléphone réels) et n'ont
// jamais consenti à ce qu'on publie une copie de leur marque. Les fichiers
// ont été retirés du dépôt ; ce nettoyage efface aussi ceux qui restent dans
// le volume persistant d'un déploiement antérieur — sinon ils survivraient à
// la mise à jour du code. Un fichier généré pour un vrai prospect qui n'est
// pas encore devenu client n'a rien à faire en ligne publiquement.
const SLUGS_A_PURGER = [
  'chez-boulay-bistro-boreal', 'clinique-cmi', 'construction-cma', 'oasis-coiffure',
  'pmc-mecanique', 'pub-le-vieux', 'taverne-1855', 'garage-magella-beaulieu', 'bistro-koz',
];
for (const slug of SLUGS_A_PURGER) {
  const f = path.join(outputDir, `${slug}.html`);
  try {
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`[purge] ${slug}.html retiré du volume`); }
  } catch (e) { console.warn(`[purge] ${slug}: ${e.message}`); }
  try { db.prepare('DELETE FROM prospects WHERE slug = ?').run(slug); } catch (e) { /* table jeune */ }
}
// L'ancien BUNDLED_META inscrivait en dur, dans un dépôt PUBLIC, le nom,
// l'adresse et le téléphone de six vraies entreprises. Supprimé : ces données
// personnelles n'ont pas à vivre dans le code source.

// Fichiers statiques — volume output/ (inclut maintenant les démos seedées)
const staticOpts = { setHeaders: (res) => res.setHeader('X-Frame-Options', 'SAMEORIGIN') };

// Les démos portent le nom, le téléphone et l'adresse d'entreprises RÉELLES
// qui n'ont rien demandé. Les laisser indexer, c'est publier un faux site à
// leur nom dans Google — risque réputationnel et juridique, et contenu
// dupliqué qui peut nuire à leur vrai référencement. Interdiction explicite
// par en-tête (robots.txt seul ne suffit pas : une URL partagée reste indexable).
const demoNoIndex = {
  setHeaders: (res) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  },
};

// robots.txt à la racine — l'accueil et la vitrine sont indexables, tout ce
// qui touche aux prospects et à l'administration ne l'est pas.
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /demo/',
    'Disallow: /t/',
    'Disallow: /admin',
    'Disallow: /core/',
    'Disallow: /prospects',
    'Disallow: /upload',
    'Allow: /',
    '',
    `Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`,
    '',
  ].join('\n'));
});
// La base SQLite et ses fichiers WAL vivent dans output/ : ils ne doivent
// JAMAIS être servis (fuite de données sinon — prospects, credentials).
app.use('/demo', (req, res, next) => {
  if (/\.(db|sqlite3?|db-wal|db-shm|jsonl?)$/i.test(req.path) || /(^|\/)\./.test(req.path)) {
    return res.status(404).end();
  }
  next();
});
app.use('/demo', express.static(outputDir, demoNoIndex));
// Vitrine — fichiers bespoke servis depuis le code déployé (hors volume).
// /showcase/progain est la démo du PRODUIT de Novalis : indexable. Les autres
// (bistro-koz, le-tour-du-chef) sont des maquettes de prospects tiers réels :
// noindex, comme les démos, tant qu'ils ne sont pas des clients consentants.
app.use('/showcase', (req, res, next) => {
  if (!/^\/progain(\/|$)/.test(req.path)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  }
  next();
});
app.use('/showcase', express.static(path.join(__dirname, 'showcase'), staticOpts));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Upload d'images (base64 JSON) ────────────────────────────
// POST /upload-image  { filename: "exterior.jpg", data: "base64..." }
app.post('/upload-image', requireAdmin, (req, res) => {
  const { filename, data } = req.body || {};
  if (!filename || !data) return res.status(400).json({ error: 'filename + data requis' });
  const safe = nomImageSur(filename);
  if (!safe) return res.status(415).json({ error: 'extension d\'image non autorisée' });
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

// ── Import d'une image depuis une URL (téléchargement côté serveur) ──
// POST /fetch-image { filename, url }  → le serveur Railway télécharge l'image
app.post('/fetch-image', requireAdmin, async (req, res) => {
  const { filename, url } = req.body || {};
  if (!filename || !url) return res.status(400).json({ error: 'filename + url requis' });
  const safe = nomImageSur(filename);
  if (!safe) return res.status(415).json({ error: 'extension d\'image non autorisée' });
  if (!urlPubliqueSure(url)) return res.status(400).json({ error: 'URL non autorisée (réseau interne ou schéma invalide)' });
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*',
        'Referer': 'https://www.google.com/',
      },
      redirect: 'follow',
    });
    if (!r.ok) return res.status(502).json({ error: `source HTTP ${r.status}` });
    const ct = r.headers.get('content-type') || '';
    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length < 1000 || !/image\//.test(ct)) return res.status(415).json({ error: `pas une image (${ct || 'type inconnu'}, ${buf.length}o)` });
    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, safe), buf);
    res.json({ ok: true, url: `/demo/images/${safe}`, size: buf.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Outil photos — Bistro Kóz (showcase bespoke) ──────────────
app.get('/koz-photos', (req, res) => {
  const slots = [
    { id: 'facade',    emoji: '🏛️', label: 'Façade / bâtiment au bord du lac' },
    { id: 'terrasse',  emoji: '🌅', label: 'Terrasse animée (coucher de soleil)' },
    { id: 'interieur', emoji: '🪑', label: 'Intérieur / salle à manger' },
    { id: 'dome',      emoji: '❄️', label: 'Un dôme chauffé sur la neige' },
    { id: 'mezze',     emoji: '🫓', label: 'Table de mezzes / plats colorés (vue de haut)' },
    { id: 'plat',      emoji: '🍢', label: 'Un plat signature en gros plan (kebab, kefta…)' },
  ];
  const slotHtml = slots.map(s => `
    <div class="slot" id="slot-${s.id}">
      <div class="prevwrap"><img id="prev-${s.id}" alt=""></div>
      <div class="meta">
        <div class="emoji">${s.emoji}</div>
        <div class="lab">${s.label}</div>
        <div class="status" id="st-${s.id}"></div>
        <div class="row">
          <label class="file-btn">Choisir un fichier<input type="file" accept="image/*" onchange="pickFile(this,'${s.id}')"></label>
        </div>
        <div class="row url-row">
          <input type="url" id="url-${s.id}" placeholder="…ou colle l'adresse d'une image">
          <button onclick="importUrl('${s.id}')">Importer</button>
        </div>
      </div>
    </div>`).join('');
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photos — Bistro Kóz</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:#081E22;color:#F2E7D3;padding:32px 20px;max-width:780px;margin:0 auto}
  h1{font-size:24px;margin-bottom:6px}
  h1 .o{color:#D6A24B;font-style:italic}
  p{color:#A9B0A0;font-size:14px;margin-bottom:8px;line-height:1.6}
  .tip{background:#10353A;border:1px solid rgba(214,162,75,.3);border-radius:10px;padding:14px 16px;font-size:13px;color:#CBB48E;margin:18px 0 28px;line-height:1.6}
  .slot{display:flex;gap:16px;background:#0C2E33;border:1px solid rgba(242,231,211,.08);border-radius:12px;padding:14px;margin-bottom:14px}
  .slot.done{border-color:#7A8450}
  .prevwrap{width:120px;height:90px;flex-shrink:0;border-radius:8px;overflow:hidden;background:#10353A;display:flex;align-items:center;justify-content:center}
  .prevwrap img{width:100%;height:100%;object-fit:cover;display:none}
  .slot.done .prevwrap img{display:block}
  .meta{flex:1;min-width:0}
  .emoji{font-size:18px}
  .lab{font-size:14px;font-weight:600;margin:2px 0 8px}
  .status{font-size:12px;margin-bottom:8px;min-height:14px}
  .status.ok{color:#9BB36A}.status.err{color:#E0805A}.status.load{color:#D6A24B}
  .row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
  .file-btn{position:relative;overflow:hidden;display:inline-block;background:#D6A24B;color:#081E22;font-size:12px;font-weight:600;padding:8px 16px;border-radius:6px;cursor:pointer}
  .file-btn input{position:absolute;inset:0;opacity:0;cursor:pointer}
  .url-row input{flex:1;min-width:0;background:#081E22;border:1px solid rgba(242,231,211,.15);color:#F2E7D3;padding:8px 10px;border-radius:6px;font-size:12px}
  .url-row button{background:#10353A;border:1px solid rgba(242,231,211,.2);color:#F2E7D3;font-size:12px;padding:8px 14px;border-radius:6px;cursor:pointer;white-space:nowrap}
  .url-row button:hover{background:#16545C}
  .done-bar{margin-top:24px;text-align:center}
  .view{display:inline-block;background:#C8623A;color:#F2E7D3;text-decoration:none;font-size:14px;font-weight:600;padding:14px 40px;border-radius:100px}
</style></head><body>
<h1>Photos — Bistro K<span class="o">ó</span>z</h1>
<p>Pour chaque emplacement : <b>choisis un fichier</b> sur ton appareil, OU <b>colle l'adresse d'une image</b> (clic droit sur une photo Google → « Copier l'adresse de l'image »).</p>
<div class="tip">💡 L'import par URL est téléchargé par le serveur — ça contourne les blocages. Si une URL échoue (site protégé), enregistre la photo sur ton appareil puis utilise « Choisir un fichier ».</div>
${slotHtml}
<div class="done-bar"><a class="view" href="/showcase/bistro-koz.html?v=${Date.now()}" target="_blank">Voir le site mis à jour →</a></div>
<script>
function setStatus(id,msg,cls){const e=document.getElementById('st-'+id);e.textContent=msg;e.className='status '+(cls||'');}
function markDone(id,url){document.getElementById('slot-'+id).classList.add('done');const img=document.getElementById('prev-'+id);img.src=url+'?t='+Date.now();}
async function pickFile(input,id){
  const f=input.files[0];if(!f)return;
  setStatus(id,'Envoi…','load');
  const b64=await new Promise(r=>{const fr=new FileReader();fr.onload=e=>r(e.target.result);fr.readAsDataURL(f);});
  try{
    const res=await fetch('/upload-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'koz-'+id+'.jpg',data:b64})});
    const j=await res.json();
    if(j.ok){setStatus(id,'✓ Ajoutée','ok');markDone(id,j.url);}else setStatus(id,'✗ '+(j.error||'erreur'),'err');
  }catch(e){setStatus(id,'✗ '+e.message,'err');}
}
async function importUrl(id){
  const url=document.getElementById('url-'+id).value.trim();
  if(!url){setStatus(id,'Colle une adresse d\\'image d\\'abord','err');return;}
  setStatus(id,'Téléchargement par le serveur…','load');
  try{
    const res=await fetch('/fetch-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'koz-'+id+'.jpg',url})});
    const j=await res.json();
    if(j.ok){setStatus(id,'✓ Importée ('+Math.round(j.size/1024)+' ko)','ok');markDone(id,j.url);}else setStatus(id,'✗ '+(j.error||'échec'),'err');
  }catch(e){setStatus(id,'✗ '+e.message,'err');}
}
</script></body></html>`);
});

// ── Debug — lister les fichiers dans output/ et demos/ ───────
// Énumère le contenu du volume : c'est de la reconnaissance offerte à un
// inconnu (et la liste des prospects de l'entreprise). Derrière l'admin.
app.get('/debug', requireAdmin, (req, res) => {
  const out   = fs.existsSync(outputDir) ? fs.readdirSync(outputDir).filter(f => f.endsWith('.html')) : [];
  const demos = fs.existsSync(demosDir)  ? fs.readdirSync(demosDir).filter(f => f.endsWith('.html'))  : [];
  res.json({ output: out, demos, version: 'seed-v2' });
});

// ── Accueil — la vraie page de vente ──────────────────────────
// Avant : cette route listait publiquement TOUTES les démos du volume,
// c'est-à-dire les noms et les sites de prospects réels, à quiconque
// visitait novalisia.ca. C'était à la fois une fuite et un très mauvais
// visage commercial. Elle sert désormais landing.html.
//
// Deux jetons sont substitués au rendu plutôt que codés en dur : sans
// GA_ID pas de script d'analytique, sans WHATSAPP_NUMERO pas de bouton
// flottant. Un faux numéro sur une page de vente est pire qu'aucun bouton.
const LANDING_PATH = path.join(__dirname, 'landing.html');
let _landingCache = null;

function rendreLanding() {
  if (_landingCache) return _landingCache;
  let html = fs.readFileSync(LANDING_PATH, 'utf8');

  const gaId = process.env.GA_ID;
  html = html.replace('<!--#ANALYTIQUE#-->', gaId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');</script>`
    : '');

  const wa = (process.env.WHATSAPP_NUMERO || '').replace(/[^0-9]/g, '');
  if (wa) {
    html = html.replace('WHATSAPP_NUMERO', wa)
               .replace('<!--#WHATSAPP_DEBUT#-->', '')
               .replace('<!--#WHATSAPP_FIN#-->', '');
  } else {
    // Retirer le bloc complet entre les deux marqueurs.
    const d = html.indexOf('<!--#WHATSAPP_DEBUT#-->');
    const f = html.indexOf('<!--#WHATSAPP_FIN#-->');
    if (d !== -1 && f > d) html = html.slice(0, d) + html.slice(f + '<!--#WHATSAPP_FIN#-->'.length);
  }

  _landingCache = html;
  return html;
}

// Pages légales — servies en dur. La Loi 25 exige d'une entreprise québécoise
// qui recueille des renseignements personnels (le formulaire de contact) qu'elle
// publie une politique de confidentialité accessible ; le pied de page y renvoyait
// vers une URL qui répondait 404.
const LEGAL_DIR = path.join(__dirname, 'legal');
for (const slug of ['politique-confidentialite', 'conditions-utilisation']) {
  app.get('/' + slug, (req, res) => {
    try { res.type('html').send(fs.readFileSync(path.join(LEGAL_DIR, slug + '.html'), 'utf8')); }
    catch { res.status(404).type('text/plain').send('Introuvable'); }
  });
}

// Page publique de confiance / sécurité (atout de crédibilité, honnête).
app.get('/confiance', (req, res) => {
  res.type('html').send(renderConfiance());
});

// ── Acceptation de devis en ligne (page publique client) ────────────
function statutClientDevis(p) {
  try { const d = p && p.detail ? JSON.parse(p.detail) : null; return d && d.client ? d.client : null; } catch { return null; }
}
app.get('/devis/:source/:id/:token', (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  const id = parseInt(req.params.id, 10);
  if (!/^[a-z0-9-]{2,40}$/.test(source) || !Number.isInteger(id)
    || !branchement.jetonPropValide(source, id, req.params.token, process.env.MASTER_KEY)) {
    return res.status(404).type('text/plain').send('Introuvable');
  }
  const p = propositions.get(db, id);
  if (!p || p.source !== source || p.type !== 'devis') return res.status(404).type('text/plain').send('Introuvable');
  res.setHeader('X-Frame-Options', 'DENY');
  res.type('html').send(renderDevisAccept({
    source, nom: branchement.etat(db, source).identite.nom, brouillon: p.brouillon,
    statutClient: statutClientDevis(p),
    actionBase: `/devis/${encodeURIComponent(source)}/${id}/${req.params.token}`,
  }));
});
app.post('/devis/:source/:id/:token/:action', express.json({ limit: '2kb' }), (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  const id = parseInt(req.params.id, 10);
  const action = req.params.action === 'accepter' ? 'accepte' : req.params.action === 'refuser' ? 'refuse' : null;
  if (!action || !/^[a-z0-9-]{2,40}$/.test(source) || !Number.isInteger(id)
    || !branchement.jetonPropValide(source, id, req.params.token, process.env.MASTER_KEY)) {
    return res.status(404).json({ error: 'Introuvable' });
  }
  const p = propositions.get(db, id);
  if (!p || p.source !== source || p.type !== 'devis') return res.status(404).json({ error: 'Introuvable' });
  if (statutClientDevis(p)) return res.json({ ok: true, deja: true });
  try {
    const nom = branchement.etat(db, source).identite.nom || source;
    const qui = p.client || p.destinataire || 'client';
    db.prepare('UPDATE propositions SET detail = ?, maj_le = datetime(\'now\') WHERE id = ?')
      .run(JSON.stringify({ client: action, le: new Date().toISOString() }), id);
    const accepte = action === 'accepte';
    const titre = accepte ? `Devis accepté — ${qui}` : `Devis décliné — ${qui}`;
    const apercu = accepte ? 'Le client a accepté la soumission en ligne.' : 'Le client a décliné la soumission.';
    const brouillon = accepte
      ? `Bonjour,\n\nMerci d'avoir accepté la soumission. On planifie les travaux — je vous propose une date sous peu.\n\n${nom}`
      : `Bonjour,\n\nMerci de votre retour. Si vous souhaitez ajuster la soumission, dites-le-moi, je m'adapte.\n\n${nom}`;
    db.prepare(`INSERT OR IGNORE INTO propositions (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite, statut)
      VALUES (?, 'reponse', 'devis_reponse', ?, ?, ?, ?, ?, ?, 'en_attente')`)
      .run(source, id, titre, apercu, brouillon, p.destinataire || null, accepte ? 10 : 5);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Confirmation de rendez-vous en ligne (page publique client) ─────
app.get('/rdv/:source/confirmer/:id/:token', (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  const id = parseInt(req.params.id, 10);
  if (!/^[a-z0-9-]{2,40}$/.test(source) || !Number.isInteger(id)
    || !branchement.jetonRdv || !branchement.jetonRdvValide(source, id, req.params.token, process.env.MASTER_KEY)) {
    return res.status(404).type('text/plain').send('Introuvable');
  }
  let row = null;
  try { row = db.prepare('SELECT * FROM rendezvous WHERE id = ? AND source = ?').get(id, source); } catch { row = null; }
  if (!row) return res.status(404).type('text/plain').send('Introuvable');
  res.setHeader('X-Frame-Options', 'DENY');
  res.type('html').send(renderRdvConfirm({
    source, nom: branchement.etat(db, source).identite.nom,
    quand: rdv.formatQuand(row.debut), service: row.service,
    statutClient: row.statut !== 'prevu' ? 'reporter' : (row.client_reponse || null),
    actionBase: `/rdv/${encodeURIComponent(source)}/confirmer/${id}/${req.params.token}`,
  }));
});
app.post('/rdv/:source/confirmer/:id/:token/:reponse', express.json({ limit: '2kb' }), (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  const id = parseInt(req.params.id, 10);
  const reponse = req.params.reponse === 'confirme' ? 'confirme' : req.params.reponse === 'reporter' ? 'reporter' : null;
  if (!reponse || !/^[a-z0-9-]{2,40}$/.test(source) || !Number.isInteger(id)
    || !branchement.jetonRdvValide(source, id, req.params.token, process.env.MASTER_KEY)) {
    return res.status(404).json({ error: 'Introuvable' });
  }
  const r = rdv.confirmerClient(db, id, reponse);
  if (!r.ok) return res.status(400).json({ error: r.raison || 'Impossible' });
  // « Reporter » → déposer une demande de reprogrammation au poste de commande.
  if (reponse === 'reporter' && !r.deja && r.rdv) {
    try {
      const nom = branchement.etat(db, source).identite.nom || source;
      const qui = r.rdv.client_nom || r.rdv.client_courriel || 'un client';
      db.prepare(`INSERT OR IGNORE INTO propositions (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite, statut)
        VALUES (?, 'reponse', 'rdv_report', ?, ?, ?, ?, ?, 9, 'en_attente')`)
        .run(source, id, `Reprogrammation demandée — ${qui}`,
          `${qui} demande à reporter le RDV du ${rdv.formatQuand(r.rdv.debut)}.`,
          `Bonjour,\n\nPas de souci pour reporter. Quelles seraient vos disponibilités ? Je m'adapte.\n\n${nom}`,
          r.rdv.client_courriel || null);
    } catch (e) { console.error('[rdv/report]', e.message); }
  }
  res.json({ ok: true });
});

// ── Prise de rendez-vous en ligne (page publique client) ────────────
// Le client demande un RDV lui-même ; la demande arrive dans la Réception du
// commerçant (via l'accusé instantané existant). Honnête : c'est une demande à
// confirmer, pas un créneau garanti. Seulement pour les entreprises connues.
app.get('/rdv/:source', (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source) || !sourcesConnues().includes(source)) {
    return res.status(404).type('text/plain').send('Introuvable');
  }
  const et = branchement.etat(db, source);
  let services = [];
  try { services = devis.listerServices(db, source); } catch { /* base jeune */ }
  res.setHeader('X-Frame-Options', 'DENY');
  res.type('html').send(renderBooking({ source, nom: et.identite.nom, services }));
});

// ── PWA : manifeste, service worker, icônes (publics) ───────────────
const PWA_DIR = path.join(__dirname, 'core', 'pwa');
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=86400').send(JSON.stringify({
    name: 'Novalis — espace d\'exploitation',
    short_name: 'Novalis',
    description: 'Le back-office opéré de votre commerce.',
    start_url: '/core/aujourdhui',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: '#1E3A5F',
    background_color: '#F1EFE8',
    lang: 'fr-CA',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }));
});
app.get(['/icon-192.png', '/icon-512.png'], (req, res) => {
  const f = req.path === '/icon-512.png' ? 'icon-512.png' : 'icon-192.png';
  try { res.type('image/png').set('Cache-Control', 'public, max-age=604800').send(fs.readFileSync(path.join(PWA_DIR, f))); }
  catch { res.status(404).end(); }
});
app.get('/sw.js', (req, res) => {
  // Service worker minimal : suffit à rendre l'app installable, ne met RIEN en
  // cache (aucun risque de contenu périmé) — le navigateur fait le fetch par défaut.
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(
    'self.addEventListener("install",function(e){self.skipWaiting();});'
    + 'self.addEventListener("activate",function(e){e.waitUntil(self.clients.claim());});'
    + 'self.addEventListener("fetch",function(){});');
});

// ── Connexion / déconnexion (session par cookie signé) ──────────────
app.get('/login', (req, res) => {
  if (estAuthentifie(req)) return res.redirect(302, cheminLocal(req.query.next) || '/core/aujourdhui');
  res.type('html').send(renderLogin({ next: cheminLocal(req.query.next), erreur: req.query.e ? String(req.query.e) : '' }));
});
app.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
  if (!ADMIN_PASS) return res.status(503).type('text/plain').send('Administration non configurée');
  const next = cheminLocal(req.body && req.body.next);
  if (adminBloque(req)) return res.redirect(302, '/login?e=2' + (next ? '&next=' + encodeURIComponent(next) : ''));
  const mdp = String((req.body && req.body.password) || '');
  if (!memeSecret(mdp, ADMIN_PASS)) {
    noterEchecAdmin(req);
    return res.redirect(302, '/login?e=1' + (next ? '&next=' + encodeURIComponent(next) : ''));
  }
  noterSuccesAdmin(req);
  poserSession(req, res);
  res.redirect(302, next || '/core/aujourdhui');
});
app.get('/logout', (req, res) => {
  effacerSession(res);
  res.redirect(302, '/login');
});

app.get('/', (req, res) => {
  try {
    res.type('html').send(rendreLanding());
  } catch (e) {
    console.error('[accueil] landing.html illisible:', e.message);
    res.status(500).type('html').send('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Novalis</title></head><body style="font-family:system-ui;padding:40px"><h1>Novalis</h1><p>Site temporairement indisponible.</p></body></html>');
  }
});
// ── Générer un site ───────────────────────────────────────────
// Protégé par clé API (variable d'env PREVIEW_API_KEY)
app.post('/generate', requireGenerate, async (req, res) => {
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
  if (!ADMIN_PASS) return res.status(503).json({ ok: false, error: 'Administration non configurée' });
  if (adminBloque(req)) return res.status(429).json({ ok: false, error: 'Trop de tentatives' });
  const bon = memeSecret(key, ADMIN_PASS);
  if (bon) noterSuccesAdmin(req); else noterEchecAdmin(req);
  res.json({ ok: bon });
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
    let hasVideo = false;
    if (data.website && brand && brand.photoAssignment) {
      try {
        const { downloadBrandPhotos } = require('./brand-research');
        const imagesDir2 = path.join(outputDir, 'images');
        const dlResult = await downloadBrandPhotos(brand.photoAssignment, brand.logoUrl || '', result.slug, imagesDir2);
        photosFound = dlResult.saved;

        // Higgsfield — animer la photo hero si configuré
        const { isEnabled: hfEnabled, animatePhoto, downloadVideo: dlVideo } = require('./higgsfield');
        if (hfEnabled() && brand.photoAssignment?.exterior?.length > 0) {
          try {
            const videoUrl = await animatePhoto(brand.photoAssignment.exterior[0], data.industry || 'restaurant');
            const videoBuf = await dlVideo(videoUrl);
            if (videoBuf.length > 10_000) {
              fs.writeFileSync(path.join(imagesDir2, `${result.slug}-hero.mp4`), videoBuf);
              dlResult.photos.heroVideo = `/demo/images/${result.slug}-hero.mp4`;
              hasVideo = true;
              console.log(`[higgsfield] ✓ ${result.slug}-hero.mp4 (${Math.round(videoBuf.length/1024)}kb)`);
            }
          } catch(e) { console.warn(`[higgsfield] skip: ${e.message}`); }
        }

        // Re-générer avec les chemins locaux confirmés (photos + éventuelle vidéo)
        if (photosFound > 0 || hasVideo) {
          const logoExt2   = fs.existsSync(path.join(imagesDir2, `${result.slug}-logo.svg`)) ? 'svg' : 'png';
          const logoLocal2 = fs.existsSync(path.join(imagesDir2, `${result.slug}-logo.${logoExt2}`))
            ? `/demo/images/${result.slug}-logo.${logoExt2}` : '';
          const result2 = generateCinematic({ ...data, photos: dlResult.photos, logoUrl: logoLocal2 || (brand && brand.logoUrl) || data.logoUrl || '' });
          fs.writeFileSync(dest, result2.html, 'utf8');
          console.log(`[cinematic] HTML régénéré avec ${Object.keys(dlResult.photos).length} photos${hasVideo ? ' + vidéo hero' : ''}`);
        }
      } catch(e) { console.warn('[photos]', e.message); }
    } else if (data.website) {
      // Fallback: ancien scraper si brand-research échoue
      try {
        photosFound = await scrapePhotos(data.website, result.slug, brand && brand.logoUrl);
      } catch(e) { console.warn('[photos fallback]', e.message); }
    }

    console.log(`[cinematic] ${result.slug} → ${demoUrl} (photos:${photosFound}, video:${hasVideo})`);
    res.json({ success: true, url: demoUrl, slug: result.slug, photosFound, hasVideo });
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

    // ── 3b. Higgsfield — animer la photo hero en vidéo cinématique ─
    let heroVideo = null;
    const { isEnabled: hfEnabled, animatePhoto, downloadVideo: dlVideo } = require('./higgsfield');
    if (hfEnabled() && brand?.photoAssignment?.exterior?.length > 0) {
      const exteriorUrl = brand.photoAssignment.exterior[0];
      try {
        const videoUrl = await animatePhoto(exteriorUrl, industry || 'restaurant');
        const videoBuf = await dlVideo(videoUrl);
        if (videoBuf.length > 10_000) {
          if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
          fs.writeFileSync(path.join(imagesDir, `${slug}-hero.mp4`), videoBuf);
          heroVideo = `/demo/images/${slug}-hero.mp4`;
          console.log(`[higgsfield] ✓ ${slug}-hero.mp4 (${Math.round(videoBuf.length/1024)}kb)`);
        }
      } catch(e) { console.warn(`[higgsfield] skip: ${e.message}`); }
    }
    if (heroVideo) dlResult.photos.heroVideo = heroVideo;

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

    console.log(`[discover] ${name} → ${demoUrl} (${brand ? brand.pagesScraped : 0} pages, ${dlResult.saved} photos, video:${!!heroVideo})`);
    res.json({
      success: true, url: demoUrl, slug: result.slug,
      photosFound: dlResult.saved,
      hasVideo: !!heroVideo,
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
    // UPDATE seulement, jamais INSERT : la version précédente créait une ligne
    // prospect pour n'importe quel slug appelé. Un simple boucle sur /t/xxx
    // faisait grossir la base indéfiniment, sans authentification.
    db.prepare(`
      UPDATE prospects SET views = views + 1, last_viewed = strftime('%s','now')
      WHERE slug = ?
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
  // Inclure la vidéo hero Higgsfield si elle existe
  const heroMp4 = path.join(imagesDir, `${slug}-hero.mp4`);
  if (fs.existsSync(heroMp4)) photos.heroVideo = `/demo/images/${slug}-hero.mp4?v=${Date.now()}`;
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

// ── Import automatique des vraies photos de Bistro Kóz (côté serveur) ──
// Crawle bistrokoz.ca, télécharge les meilleures photos par rôle et les place
// dans les 6 emplacements du site bespoke. S'exécute une fois (volume persistant).
const KOZ_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const KOZ_SLOTS = ['facade', 'terrasse', 'interieur', 'dome', 'mezze', 'plat'];

async function kozDownload(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': KOZ_UA, 'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*', 'Referer': 'https://bistrokoz.ca/' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 3000) throw new Error('trop petit (' + buf.length + 'o)');
  const jpg = buf[0] === 0xFF && buf[1] === 0xD8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (!jpg && !png && !webp) throw new Error('pas une image');
  return buf;
}

// Pages clés à crawler pour Kóz (multi-pages pour plus de photos)
const KOZ_PAGES = [
  'https://bistrokoz.ca/',
  'https://bistrokoz.ca/galerie/',
  'https://bistrokoz.ca/a-propos/',
  'https://bistrokoz.ca/menus/',
  'https://bistrokoz.ca/les-domes/',
  'https://bistrokoz.ca/terrasse/',
  'https://bistrokoz.ca/contact/',
];

// Version — incrémenter pour forcer un reimport à chaque déploiement majeur
const KOZ_PHOTO_VERSION = '3';

async function importKozPhotos({ force = false } = {}) {
  const imagesDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const file = s => path.join(imagesDir, `koz-${s}.jpg`);
  const vFile = path.join(imagesDir, '.koz-version');

  // Fichier valide = existe ET > 80 Ko (une vraie photo, pas un placeholder)
  const isValid = s => { const f=file(s); return fs.existsSync(f) && fs.statSync(f).size > 80_000; };

  // Skip uniquement si: pas force, bonne version ET tous les fichiers sont valides
  const savedVer = fs.existsSync(vFile) ? fs.readFileSync(vFile,'utf8').trim() : '';
  if (!force && savedVer === KOZ_PHOTO_VERSION && KOZ_SLOTS.every(s => isValid(s))) {
    return { skipped: true };
  }

  // Crawl multi-pages en parallèle — collecte toutes les photos candidates
  const { fetchSiteHtml, fetchHtml } = require('./discover');
  const allCandidates = []; // {url, score, slot}
  const seen = new Set();

  async function crawlPage(pageUrl) {
    try {
      const { html } = await fetchSiteHtml(pageUrl);
      // Extraire toutes les images de la page
      const imgRe = /(?:src|data-src|data-lazy-src|data-original)=["']([^"'#\s]{8,}\.(?:jpe?g|png|webp)(?:\?[^"']*)?)/gi;
      const bgRe  = /url\(["']?(https?:[^"')]+\.(?:jpe?g|png|webp)[^"')]*)/gi;
      const vidRe = /poster=["']([^"']+)/gi;
      for (const re of [imgRe, bgRe, vidRe]) {
        let m;
        while ((m = re.exec(html)) !== null) {
          const u = m[1].startsWith('//') ? 'https:' + m[1] : m[1];
          if (!u.startsWith('http')) continue;
          if (seen.has(u)) continue;
          if (/icon|logo|badge|pixel|1x1|sprite|favicon|arrow|thumb-\d+x\d+/i.test(u)) continue;
          seen.add(u);
          // Scoring sémantique basé sur l'URL
          let score = 10;
          if (/terrasse|terrace/i.test(u)) score += 40;
          if (/interieur|interior|salle|dining/i.test(u)) score += 35;
          if (/facade|exterior|outside|devanture/i.test(u)) score += 35;
          if (/dome/i.test(u)) score += 30;
          if (/mezze|plat|food|dish|menu/i.test(u)) score += 30;
          if (/\d{4}x\d{4}|\d{3,}w|large|full|hero|banner|cover/i.test(u)) score += 20;
          if (re === vidRe) score += 50; // poster d'une vidéo = image hero choisie par le proprio
          allCandidates.push({ url: u, score, pageUrl });
        }
      }
      console.log(`[koz-crawl] ${pageUrl} → ${seen.size} URLs vues`);
    } catch(e) {
      console.log(`[koz-crawl] ${pageUrl} → ${e.message}`);
    }
  }

  await Promise.allSettled(KOZ_PAGES.map(p => crawlPage(p)));

  // Si moins de 3 candidats, utiliser brand-research en fallback
  let pa = null;
  if (allCandidates.length < 3) {
    try {
      const { researchBrand } = require('./brand-research');
      const research = await researchBrand('https://bistrokoz.ca/');
      if (research?.photoAssignment) pa = research.photoAssignment;
    } catch(e) { console.warn('[koz-import] brand-research:', e.message); }
  }

  // Triées par score décroissant
  allCandidates.sort((a, b) => b.score - a.score);

  const paPool = pa ? [].concat(pa.exterior||[], pa.interior||[], pa.service||[], pa.about||[]) : [];
  const allPool = [...new Set([...allCandidates.map(c=>c.url), ...paPool])];

  const wanted = {
    facade:    allCandidates.find(c=>/facade|exterior|outside|devanture|building/i.test(c.url))?.url || (pa?.exterior?.[0]),
    terrasse:  allCandidates.find(c=>/terrasse|terrace/i.test(c.url))?.url || (pa?.exterior?.[1]),
    interieur: allCandidates.find(c=>/interieur|interior|salle|dining|inside/i.test(c.url))?.url || (pa?.interior?.[0]),
    dome:      allCandidates.find(c=>/dome/i.test(c.url))?.url || (pa?.about?.[0]) || (pa?.interior?.[1]),
    mezze:     allCandidates.find(c=>/mezze|mezz/i.test(c.url))?.url || (pa?.service?.[0]),
    plat:      allCandidates.find(c=>/plat|food|dish|assiette/i.test(c.url))?.url || (pa?.service?.[1]) || (pa?.service?.[0]),
  };

  // Phase 3 : photo-search.js — si crawl n'a pas assez de résultats
  // Cherche des photos parfaites via Unsplash/Pexels API selon le contexte de l'entreprise
  const slotsStillNeeded = KOZ_SLOTS.filter(s => !force && !fs.existsSync(file(s)) && !wanted[s]);
  let searchPhotos = {};
  if (slotsStillNeeded.length > 0 || allCandidates.length < 3) {
    try {
      const { findPhotosForBusiness, getApiStatus } = require('./photo-search');
      const apiStatus = getApiStatus();
      console.log(`[koz-import] photo-search mode: ${apiStatus.mode}`);
      searchPhotos = await findPhotosForBusiness({
        industry:  'restaurant',
        slots:     KOZ_SLOTS,
        specialty: ['mediterranean', 'lakeside'],
        name:      'Bistro Kóz',
        location:  'Magog Quebec',
      });
      console.log(`[koz-import] photo-search trouvé: ${Object.keys(searchPhotos).length} slots`);
    } catch(e) {
      console.warn('[koz-import] photo-search:', e.message);
    }
  }

  const result = {};
  const usedUrls = new Set();
  for (const s of KOZ_SLOTS) {
    if (!force && fs.existsSync(file(s))) { result[s] = 'déjà présente'; continue; }

    // Priorité: 1) crawl bistrokoz.ca, 2) pool général, 3) photo-search (Unsplash/Pexels/fallback)
    let url = wanted[s];
    if (!url || usedUrls.has(url)) url = allPool.find(u => u && !usedUrls.has(u));
    if (!url && searchPhotos[s]) url = searchPhotos[s].url;

    if (!url) { result[s] = 'aucune candidate'; continue; }

    const source = allCandidates.some(c=>c.url===url) ? 'bistrokoz.ca'
                 : searchPhotos[s]?.url === url        ? (searchPhotos[s]?.source || 'search')
                 : 'pool';
    try {
      const buf = await kozDownload(url);
      fs.writeFileSync(file(s), buf);
      usedUrls.add(url);
      result[s] = `ok ${Math.round(buf.length/1024)}ko [${source}]`;
    } catch(e) {
      // Dernier recours: fallback photo-search direct
      const fallback = searchPhotos[s]?.url;
      if (fallback && fallback !== url) {
        try {
          const buf = await kozDownload(fallback);
          fs.writeFileSync(file(s), buf);
          result[s] = `ok fallback ${Math.round(buf.length/1024)}ko`;
        } catch(e2) { result[s] = 'échec total: ' + e.message; }
      } else {
        result[s] = 'échec: ' + e.message;
      }
      usedUrls.add(url);
    }
  }
  // Sauvegarder la version si tous les slots valides
  if (KOZ_SLOTS.every(s => isValid(s))) {
    fs.writeFileSync(vFile, KOZ_PHOTO_VERSION);
  }
  return { result, candidates: allCandidates.length, searchMode: Object.keys(searchPhotos).length > 0 };
}

// ── Statut des APIs photo ─────────────────────────────────────────
app.get('/photo-api-status', (req, res) => {
  const { getApiStatus } = require('./photo-search');
  res.json(getApiStatus());
});

// ── Test de recherche photo (admin) ──────────────────────────────
app.get('/photo-search-test', async (req, res) => {
  const { findPhotosForBusiness } = require('./photo-search');
  const industry = req.query.industry || 'restaurant';
  const slot     = req.query.slot || 'facade';
  const specialty = (req.query.specialty || 'mediterranean lakeside').split(' ');
  try {
    const results = await findPhotosForBusiness({ industry, slots: [slot], specialty, name: 'Test', location: 'Quebec' });
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint d'état / re-déclenchement manuel (filet de sécurité)
app.get('/koz-import-status', async (req, res) => {
  const imagesDir = path.join(outputDir, 'images');
  const status = {};
  for (const s of KOZ_SLOTS) {
    const f = path.join(imagesDir, `koz-${s}.jpg`);
    status[s] = fs.existsSync(f) ? `${Math.round(fs.statSync(f).size / 1024)}ko` : 'absente';
  }
  if (req.query.run === '1') {
    const run = await importKozPhotos({ force: req.query.force === '1' });
    return res.json({ status, run });
  }
  res.json({ status });
});

// ── Admin : coller une URL de photo pour un slot spécifique ──────
app.post('/koz-photos/set', async (req, res) => {
  const { slot, url, pass } = req.body;
  if (!memeSecret(pass || req.headers['x-admin-pass'], ADMIN_PASS)) return res.status(401).json({ error: 'Non autorisé' });
  if (!KOZ_SLOTS.includes(slot)) return res.status(400).json({ error: `Slot invalide. Valides: ${KOZ_SLOTS.join(', ')}` });
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'URL invalide' });
  try {
    const buf = await kozDownload(url);
    const dest = path.join(outputDir, 'images', `koz-${slot}.jpg`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    res.json({ ok: true, slot, size: Math.round(buf.length / 1024) + 'ko' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Page admin photos Kóz (UI pour coller des URLs) ──────────────
// NOTE : une seconde définition de app.get('/koz-photos') vivait ici — 89
// lignes de code inatteignable. Express sert la PREMIÈRE route qui
// correspond, définie plus haut, donc celle-ci n'a jamais répondu.
// Retirée pour que la surface de la démo Kóz reflète ce qui tourne vraiment.

// ── Import automatique des vraies photos de Le Tour du Chef (côté serveur) ──
// Même logique que Kóz : crawle letourduchef.com, télécharge les meilleures
// photos par rôle et les place dans les 6 emplacements du site bespoke.
const LTC_SLOTS = ['arrivee', 'cuisine', 'table', 'plat', 'reception', 'portrait'];

async function ltcDownload(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': KOZ_UA, 'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*', 'Referer': 'https://letourduchef.com/' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 3000) throw new Error('trop petit (' + buf.length + 'o)');
  const jpg = buf[0] === 0xFF && buf[1] === 0xD8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (!jpg && !png && !webp) throw new Error('pas une image');
  return buf;
}

const LTC_PAGES = [
  'https://letourduchef.com/',
  'https://letourduchef.com/menus/',
  'https://letourduchef.com/galerie/',
  'https://letourduchef.com/a-propos/',
  'https://letourduchef.com/evenements/',
  'https://letourduchef.com/contact/',
];

const LTC_PHOTO_VERSION = '2';

// ── Compression des photos : les PNG 2K générés par IA pèsent 8-9 Mo
//    pièce — injouable en web. On les ramène à ~300-500 ko (JPEG q82,
//    max 2000px), soit ~20× moins, sans perte visible en fond de page. ──
async function compressPhoto(buf) {
  const sharp = require('sharp');
  return sharp(buf).rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function compressExistingImages() {
  const dir = path.join(outputDir, 'images');
  if (!fs.existsSync(dir)) return { skipped: true };
  const result = {};
  for (const f of fs.readdirSync(dir)) {
    if (!/\.jpe?g$/i.test(f)) continue;
    const p = path.join(dir, f);
    const size = fs.statSync(p).size;
    if (size < 1_500_000) continue; // déjà raisonnable
    try {
      const out = await compressPhoto(fs.readFileSync(p));
      if (out.length < size) {
        fs.writeFileSync(p, out);
        result[f] = `${Math.round(size/1024)}ko → ${Math.round(out.length/1024)}ko`;
      }
    } catch(e) { result[f] = 'échec: ' + e.message; }
  }
  return result;
}

// Visuels IA générés sur mesure (Higgsfield/Nano Banana) — source prioritaire.
// Le serveur les télécharge et s'en fait une copie locale permanente.
const LTC_AI_PHOTOS = {
  arrivee:   'https://d8j0ntlcm91z4.cloudfront.net/user_3F2nqARsy1FsulepE1Njuilz5Px/hf_20260701_041701_8bd1067c-1442-4116-a9de-102d4f042adf.png',
  cuisine:   'https://d8j0ntlcm91z4.cloudfront.net/user_3F2nqARsy1FsulepE1Njuilz5Px/hf_20260701_041705_0c23e977-0e40-46ab-a2b2-8875ea594ec6.png',
  table:     'https://d8j0ntlcm91z4.cloudfront.net/user_3F2nqARsy1FsulepE1Njuilz5Px/hf_20260701_041707_127a426d-ae60-4d82-ace2-6c111f1d3a49.png',
  plat:      'https://d8j0ntlcm91z4.cloudfront.net/user_3F2nqARsy1FsulepE1Njuilz5Px/hf_20260701_041709_3bba1d46-9b9f-40cf-8e5e-4d4f26827494.png',
  reception: 'https://d8j0ntlcm91z4.cloudfront.net/user_3F2nqARsy1FsulepE1Njuilz5Px/hf_20260701_041710_0d6c8d11-fa29-4d3b-b220-6a17e7b9b72f.png',
};

async function importLtcPhotos({ force = false } = {}) {
  const imagesDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const file = s => path.join(imagesDir, `ltc-${s}.jpg`);
  const vFile = path.join(imagesDir, '.ltc-version');

  const isValid = s => { const f=file(s); return fs.existsSync(f) && fs.statSync(f).size > 80_000; };

  const savedVer = fs.existsSync(vFile) ? fs.readFileSync(vFile,'utf8').trim() : '';
  if (!force && savedVer === LTC_PHOTO_VERSION && LTC_SLOTS.every(s => isValid(s))) {
    return { skipped: true };
  }
  // Version obsolète → on remplace les fichiers existants (ils datent d'un ancien import)
  if (savedVer !== LTC_PHOTO_VERSION) force = true;

  const { fetchSiteHtml } = require('./discover');
  const allCandidates = [];
  const seen = new Set();

  async function crawlPage(pageUrl) {
    try {
      const { html } = await fetchSiteHtml(pageUrl);
      const imgRe = /(?:src|data-src|data-lazy-src|data-original)=["']([^"'#\s]{8,}\.(?:jpe?g|png|webp)(?:\?[^"']*)?)/gi;
      const bgRe  = /url\(["']?(https?:[^"')]+\.(?:jpe?g|png|webp)[^"')]*)/gi;
      const vidRe = /poster=["']([^"']+)/gi;
      for (const re of [imgRe, bgRe, vidRe]) {
        let m;
        while ((m = re.exec(html)) !== null) {
          const u = m[1].startsWith('//') ? 'https:' + m[1] : m[1];
          if (!u.startsWith('http')) continue;
          if (seen.has(u)) continue;
          if (/icon|logo|badge|pixel|1x1|sprite|favicon|arrow|thumb-\d+x\d+/i.test(u)) continue;
          seen.add(u);
          let score = 10;
          if (/arriv|entree|exterior|outside|porte|door/i.test(u)) score += 35;
          if (/cuisine|kitchen|prep|mise.?en.?place|cooking/i.test(u)) score += 35;
          if (/table|dining|salle|dress/i.test(u)) score += 35;
          if (/plat|food|dish|assiette|plating/i.test(u)) score += 30;
          if (/reception|event|cocktail|mariage|wedding/i.test(u)) score += 30;
          if (/antoine|chef|portrait/i.test(u)) score += 25;
          if (/\d{4}x\d{4}|\d{3,}w|large|full|hero|banner|cover/i.test(u)) score += 20;
          if (re === vidRe) score += 50;
          allCandidates.push({ url: u, score, pageUrl });
        }
      }
      console.log(`[ltc-crawl] ${pageUrl} → ${seen.size} URLs vues`);
    } catch(e) {
      console.log(`[ltc-crawl] ${pageUrl} → ${e.message}`);
    }
  }

  await Promise.allSettled(LTC_PAGES.map(p => crawlPage(p)));

  let pa = null;
  if (allCandidates.length < 3) {
    try {
      const { researchBrand } = require('./brand-research');
      const research = await researchBrand('https://letourduchef.com/');
      if (research?.photoAssignment) pa = research.photoAssignment;
    } catch(e) { console.warn('[ltc-import] brand-research:', e.message); }
  }

  allCandidates.sort((a, b) => b.score - a.score);

  const paPool = pa ? [].concat(pa.exterior||[], pa.interior||[], pa.service||[], pa.about||[]) : [];
  const allPool = [...new Set([...allCandidates.map(c=>c.url), ...paPool])];

  const wanted = {
    arrivee:   allCandidates.find(c=>/arriv|entree|exterior|outside|porte|door/i.test(c.url))?.url || (pa?.exterior?.[0]),
    cuisine:   allCandidates.find(c=>/cuisine|kitchen|prep|cooking/i.test(c.url))?.url || (pa?.interior?.[0]),
    table:     allCandidates.find(c=>/table|dining|salle|dress/i.test(c.url))?.url || (pa?.interior?.[1]),
    plat:      allCandidates.find(c=>/plat|food|dish|assiette|plating/i.test(c.url))?.url || (pa?.service?.[0]),
    reception: allCandidates.find(c=>/reception|event|cocktail|mariage|wedding/i.test(c.url))?.url || (pa?.service?.[1]) || (pa?.service?.[0]),
    portrait:  allCandidates.find(c=>/antoine|chef|portrait/i.test(c.url))?.url || (pa?.about?.[0]),
  };

  const slotsStillNeeded = LTC_SLOTS.filter(s => !force && !fs.existsSync(file(s)) && !wanted[s]);
  let searchPhotos = {};
  if (slotsStillNeeded.length > 0 || allCandidates.length < 3) {
    try {
      const { findPhotosForBusiness, getApiStatus } = require('./photo-search');
      const apiStatus = getApiStatus();
      console.log(`[ltc-import] photo-search mode: ${apiStatus.mode}`);
      searchPhotos = await findPhotosForBusiness({
        industry:  'catering',
        slots:     LTC_SLOTS,
        specialty: ['private chef', 'french gastronomy', 'fine dining'],
        name:      'Le Tour du Chef',
        location:  'Montreal Quebec',
      });
      console.log(`[ltc-import] photo-search trouvé: ${Object.keys(searchPhotos).length} slots`);
    } catch(e) {
      console.warn('[ltc-import] photo-search:', e.message);
    }
  }

  const result = {};
  const usedUrls = new Set();
  for (const s of LTC_SLOTS) {
    if (!force && fs.existsSync(file(s))) { result[s] = 'déjà présente'; continue; }

    let url = LTC_AI_PHOTOS[s] || wanted[s];
    if (!url || usedUrls.has(url)) url = allPool.find(u => u && !usedUrls.has(u));
    if (!url && searchPhotos[s]) url = searchPhotos[s].url;

    if (!url) { result[s] = 'aucune candidate'; continue; }

    const source = LTC_AI_PHOTOS[s] === url             ? 'ia-novalis'
                 : allCandidates.some(c=>c.url===url) ? 'letourduchef.com'
                 : searchPhotos[s]?.url === url        ? (searchPhotos[s]?.source || 'search')
                 : 'pool';
    try {
      const buf = await ltcDownload(url);
      fs.writeFileSync(file(s), buf);
      usedUrls.add(url);
      result[s] = `ok ${Math.round(buf.length/1024)}ko [${source}]`;
    } catch(e) {
      const fallback = searchPhotos[s]?.url;
      if (fallback && fallback !== url) {
        try {
          const buf = await ltcDownload(fallback);
          fs.writeFileSync(file(s), buf);
          result[s] = `ok fallback ${Math.round(buf.length/1024)}ko`;
        } catch(e2) { result[s] = 'échec total: ' + e.message; }
      } else {
        result[s] = 'échec: ' + e.message;
      }
      usedUrls.add(url);
    }
  }
  if (LTC_SLOTS.every(s => isValid(s))) {
    fs.writeFileSync(vFile, LTC_PHOTO_VERSION);
  }
  return { result, candidates: allCandidates.length, searchMode: Object.keys(searchPhotos).length > 0 };
}

// Endpoint d'état / re-déclenchement manuel (filet de sécurité)
app.get('/ltc-import-status', async (req, res) => {
  const imagesDir = path.join(outputDir, 'images');
  const status = {};
  for (const s of LTC_SLOTS) {
    const f = path.join(imagesDir, `ltc-${s}.jpg`);
    status[s] = fs.existsSync(f) ? `${Math.round(fs.statSync(f).size / 1024)}ko` : 'absente';
  }
  if (req.query.run === '1') {
    const run = await importLtcPhotos({ force: req.query.force === '1' });
    return res.json({ status, run });
  }
  res.json({ status });
});

// ── Vidéos d'ambiance (Pexels, licence libre) — téléchargées et
//    auto-hébergées au démarrage, comme les photos ──────────────────
// URLs exactes vérifiées (import test réussi le 2026-07-02) — paysage 1080p.
const LTC_VIDEO_SLOTS = {
  cuisine: [ // flamme de wok au ralenti, cinématique
    'https://videos.pexels.com/video-files/2882090/2882090-hd_1920_1080_24fps.mp4',
  ],
  table: [ // vin versé au verre, gros plan élégant ; repas au jardin en secours
    'https://videos.pexels.com/video-files/1003928/1003928-hd_1920_1080_25fps.mp4',
    'https://videos.pexels.com/video-files/5617252/5617252-hd_1920_1080_25fps.mp4',
  ],
  // Plan-séquence POV cuisine→table (scrubbing au scroll). Aucun stock
  // convenable n'existe : à filmer (gimbal) ou générer, puis brancher
  // via POST /ltc-videos/set {slot:'pov', url, pass}.
  pov: [],
};
const LTC_VIDEO_VERSION = '2';

async function ltcDownloadVideo(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': KOZ_UA, 'Accept': 'video/mp4,video/*,*/*' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 300_000) throw new Error('trop petit (' + Math.round(buf.length/1024) + 'ko)');
  if (buf.slice(4, 8).toString('ascii') !== 'ftyp') throw new Error('pas un mp4');
  return buf;
}

async function importLtcVideos({ force = false } = {}) {
  const videosDir = path.join(outputDir, 'videos');
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
  const file = s => path.join(videosDir, `ltc-${s}.mp4`);
  const vFile = path.join(videosDir, '.ltc-vid-version');
  const savedVer = fs.existsSync(vFile) ? fs.readFileSync(vFile,'utf8').trim() : '';
  if (savedVer !== LTC_VIDEO_VERSION) force = true;

  const result = {};
  for (const [slot, urls] of Object.entries(LTC_VIDEO_SLOTS)) {
    if (!urls.length) { // slot manuel (via /ltc-videos/set), jamais écrasé
      result[slot] = fs.existsSync(file(slot)) ? 'présente (manuelle)' : 'en attente (manuel)';
      continue;
    }
    if (!force && fs.existsSync(file(slot)) && fs.statSync(file(slot)).size > 300_000) {
      result[slot] = 'déjà présente'; continue;
    }
    let saved = false;
    for (const url of urls) {
      try {
        const buf = await ltcDownloadVideo(url);
        fs.writeFileSync(file(slot), buf);
        result[slot] = `ok ${Math.round(buf.length/1024/1024*10)/10}Mo`;
        saved = true;
        break;
      } catch(e) { result[slot] = 'échec: ' + e.message; }
    }
    if (!saved && !result[slot]) result[slot] = 'aucun candidat téléchargeable';
  }
  const autoSlots = Object.entries(LTC_VIDEO_SLOTS).filter(([,u]) => u.length);
  if (autoSlots.every(([s]) => fs.existsSync(file(s)) && fs.statSync(file(s)).size > 300_000)) {
    fs.writeFileSync(vFile, LTC_VIDEO_VERSION);
  }
  return result;
}

app.get('/ltc-video-status', async (req, res) => {
  const videosDir = path.join(outputDir, 'videos');
  const status = {};
  for (const s of Object.keys(LTC_VIDEO_SLOTS)) {
    const f = path.join(videosDir, `ltc-${s}.mp4`);
    status[s] = fs.existsSync(f) ? `${Math.round(fs.statSync(f).size / 1024 / 1024 * 10) / 10}Mo` : 'absente';
  }
  if (req.query.run === '1') {
    const run = await importLtcVideos({ force: req.query.force === '1' });
    return res.json({ status, run });
  }
  res.json({ status });
});

// ── Admin : coller une URL de vidéo pour un slot spécifique ──────
app.post('/ltc-videos/set', async (req, res) => {
  const { slot, url, pass } = req.body;
  if (!memeSecret(pass || req.headers['x-admin-pass'], ADMIN_PASS)) return res.status(401).json({ error: 'Non autorisé' });
  if (!Object.keys(LTC_VIDEO_SLOTS).includes(slot)) return res.status(400).json({ error: `Slot invalide. Valides: ${Object.keys(LTC_VIDEO_SLOTS).join(', ')}` });
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'URL invalide' });
  try {
    const buf = await ltcDownloadVideo(url);
    const dest = path.join(outputDir, 'videos', `ltc-${slot}.mp4`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    res.json({ ok: true, slot, size: Math.round(buf.length / 1024 / 1024 * 10) / 10 + 'Mo' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin : coller une URL de photo pour un slot spécifique ──────
app.post('/ltc-photos/set', async (req, res) => {
  const { slot, url, pass } = req.body;
  if (!memeSecret(pass || req.headers['x-admin-pass'], ADMIN_PASS)) return res.status(401).json({ error: 'Non autorisé' });
  if (!LTC_SLOTS.includes(slot)) return res.status(400).json({ error: `Slot invalide. Valides: ${LTC_SLOTS.join(', ')}` });
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'URL invalide' });
  try {
    let buf = await ltcDownload(url);
    if (buf.length > 1_500_000) { try { buf = await compressPhoto(buf); } catch(e) {} }
    const dest = path.join(outputDir, 'images', `ltc-${slot}.jpg`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    res.json({ ok: true, slot, size: Math.round(buf.length / 1024) + 'ko' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Page admin photos Le Tour du Chef (UI pour coller des URLs) ──
app.get('/ltc-photos', (req, res) => {
  const imagesDir = path.join(outputDir, 'images');
  const slots = LTC_SLOTS.map(s => {
    const f = path.join(imagesDir, `ltc-${s}.jpg`);
    const exists = fs.existsSync(f);
    return { s, exists, size: exists ? Math.round(fs.statSync(f).size/1024)+'ko' : null };
  });
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photos Le Tour du Chef — Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#15110b;color:#f2e9da;padding:40px 24px}
h1{font-size:22px;margin-bottom:8px;color:#c9a24b}
.sub{font-size:13px;color:#8a8070;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:#221a10;border:1px solid #3a2d1c;border-radius:10px;padding:20px}
.card h3{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#b5651d;margin-bottom:12px}
.preview{width:100%;aspect-ratio:16/9;background:#1a140d;border-radius:6px;overflow:hidden;margin-bottom:12px;position:relative}
.preview img{width:100%;height:100%;object-fit:cover}
.preview .absent{display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;color:#60564a}
.status{font-size:12px;color:#5a8060;margin-bottom:12px}
input{width:100%;padding:10px 12px;background:#1a140d;border:1px solid #3a3020;border-radius:6px;color:#f2e9da;font-size:13px;margin-bottom:10px}
input:focus{outline:none;border-color:#c9a24b}
button{width:100%;padding:10px;background:#b5651d;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
button:hover{background:#d89759}
.msg{margin-top:8px;font-size:12px;min-height:18px}
.ok{color:#5a8060}.err{color:#c84040}
.actions{display:flex;gap:10px;margin-bottom:24px}
.btn-sm{padding:10px 20px;background:#2a2014;border:1px solid #4a3a24;color:#c9b89c;border-radius:6px;font-size:13px;cursor:pointer;text-decoration:none}
.btn-sm:hover{background:#3a2d1c;color:#f2e9da}
a.view{display:block;margin-top:8px;font-size:12px;color:#c9a24b;text-decoration:none}
a.view:hover{text-decoration:underline}
</style>
</head><body>
<h1>Photos Le Tour du Chef</h1>
<p class="sub">Colle l'URL de n'importe quelle photo — le serveur la télécharge et la sauvegarde. Mot de passe admin requis.</p>
<div class="actions">
  <a href="/showcase/le-tour-du-chef.html" class="btn-sm" target="_blank">Voir le site →</a>
  <button class="btn-sm" onclick="reimport()">Réimporter (crawl auto)</button>
  <button class="btn-sm" onclick="reimport(true)">Forcer réimport</button>
</div>
<div class="grid">
${slots.map(({s, exists, size}) => `
  <div class="card" id="card-${s}">
    <h3>${s}</h3>
    <div class="preview">
      ${exists
        ? `<img id="img-${s}" src="/demo/images/ltc-${s}.jpg?t=${Date.now()}" onerror="this.style.display='none'">`
        : `<div class="absent">absente</div>`}
    </div>
    <div class="status">${exists ? `✓ ${size}` : '✗ Manquante'}</div>
    <input id="url-${s}" placeholder="https://letourduchef.com/wp-content/uploads/...jpg" type="url">
    <input id="pass-${s}" placeholder="Mot de passe admin" type="password" value="">
    <button onclick="setPhoto('${s}')">Enregistrer cette photo</button>
    <div class="msg" id="msg-${s}"></div>
    ${exists ? `<a class="view" href="/demo/images/ltc-${s}.jpg" target="_blank">Voir la photo actuelle →</a>` : ''}
  </div>`).join('')}
</div>
<script>
async function setPhoto(slot){
  const url=document.getElementById('url-'+slot).value.trim();
  const pass=document.getElementById('pass-'+slot).value.trim();
  const msg=document.getElementById('msg-'+slot);
  if(!url){msg.className='msg err';msg.textContent='URL requise';return;}
  msg.className='msg';msg.textContent='Téléchargement...';
  try{
    const r=await fetch('/ltc-photos/set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot,url,pass})});
    const j=await r.json();
    if(j.ok){
      msg.className='msg ok';msg.textContent='✓ Enregistrée ('+j.size+')';
      const img=document.getElementById('img-'+slot);
      if(img)img.src='/demo/images/ltc-'+slot+'.jpg?t='+Date.now();
      else location.reload();
    } else {
      msg.className='msg err';msg.textContent='Erreur: '+j.error;
    }
  }catch(e){msg.className='msg err';msg.textContent='Erreur réseau';}
}
async function reimport(force){
  const r=await fetch('/ltc-import-status?run=1'+(force?'&force=1':''));
  const j=await r.json();
  alert(JSON.stringify(j.run,null,2));
  location.reload();
}
</script>
</body></html>`;
  res.send(html);
});

// ══ Noyau d'automatisation : file de jobs, coffre, passerelle LLM ══
// initCore applique les migrations et démarre le worker in-process.
// En cas d'échec (migration cassée), on log fort mais le site vitrine
// continue de servir — le noyau est dégradable, pas le site de vente.
const { initCore } = require('./core');
let core = null;
try {
  core = initCore(db);
  console.log('[core] prêt — pipelines:', core.pipelines.join(', '));
} catch (e) {
  console.error('[core] échec d\'initialisation:', e.message);
}

function adminOnly(req, res, next) {
  if (!ADMIN_PASS) return res.status(503).json({ error: 'Administration non configurée' });
  const veutHtml = req.method === 'GET' && String(req.headers.accept || '').includes('text/html');
  if (adminBloque(req)) {
    if (veutHtml) return res.redirect(302, '/login?e=2');
    return res.status(429).json({ error: 'Trop de tentatives — réessayer plus tard' });
  }
  if (estAuthentifie(req)) { noterSuccesAdmin(req); return next(); }
  // Des identifiants explicites mais faux → compter l'échec (anti-force brute).
  const creds = req.headers['x-admin-pass'] || req.query.pass || (req.body && req.body.pass);
  if (creds) noterEchecAdmin(req);
  // Navigation → page de connexion ; appel API → 401.
  if (veutHtml) return res.redirect(302, '/login?next=' + encodeURIComponent(req.originalUrl));
  return res.status(401).json({ error: 'Non autorisé' });
}
function coreReady(req, res, next) {
  if (!core) return res.status(503).json({ error: 'noyau non initialisé (voir logs serveur)' });
  next();
}

// Lancer un pipeline. Ex: {"type":"audit-prospect","clientId":1,"payload":{"url":"https://..."}}
app.post('/core/enqueue', adminOnly, coreReady, (req, res) => {
  try {
    const { type, clientId, payload, dedupeKey, priority } = req.body || {};
    const r = core.queue.enqueue({ type, clientId, payload, dedupeKey, priority });
    res.status(202).json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Liste des runs récents avec leur statut (l'outil d'exploitation).
app.get('/core/runs', adminOnly, coreReady, (req, res) => {
  res.json({ runs: core.queue.listRecent(Math.min(parseInt(req.query.limit, 10) || 50, 200)) });
});

// Détail d'un run : la timeline de ses steps — où exactement ça a échoué.
app.get('/core/runs/:id', adminOnly, coreReady, (req, res) => {
  const id = parseInt(req.params.id, 10);
  res.json({ steps: core.queue.stepsForJob(id) });
});

// Relance d'un job mort après correction de la cause.
app.post('/core/runs/:id/requeue', adminOnly, coreReady, (req, res) => {
  res.json({ ok: core.queue.requeue(parseInt(req.params.id, 10)) });
});

// Coûts/tokens LLM du mois courant, par client.
app.get('/core/costs', adminOnly, coreReady, (req, res) => {
  res.json({ mois_courant: core.llm.rollupMois() });
});

// ── Formulaire de contact des sites vitrines ─────────────────────
// Public par nécessité (un formulaire doit être soumissible), donc
// durci : limite de débit par IP, plafonds de taille, piège à robots
// côté client, et aucune donnée renvoyée dans la réponse.
const leadHits = new Map();
// Limiteur pour les beacons publics (pulse, tap) : généreux (usage légitime =
// plusieurs événements par visite) mais borne l'abus. Silencieux (204) : un
// beacon ne doit jamais afficher d'erreur.
const beaconHits = new Map();
function beaconRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'x';
  const now = Date.now();
  const win = 60 * 1000, max = 240;
  const hits = (beaconHits.get(ip) || []).filter(t => now - t < win);
  if (hits.length >= max) return res.status(204).end();
  hits.push(now);
  beaconHits.set(ip, hits);
  if (beaconHits.size > 10000) beaconHits.clear();
  next();
}

function leadRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'inconnue'; // fiable via trust proxy
  const now = Date.now();
  const win = 10 * 60 * 1000, max = 5;
  const hits = (leadHits.get(ip) || []).filter(t => now - t < win);
  if (hits.length >= max) return res.status(429).json({ error: 'Trop de soumissions, réessayez plus tard.' });
  hits.push(now);
  leadHits.set(ip, hits);
  if (leadHits.size > 5000) leadHits.clear(); // garde-fou mémoire
  req._leadIp = ip;
  next();
}

app.post('/api/:site/contact', leadRateLimit, express.json({ limit: '32kb' }), (req, res) => {
  const site = String(req.params.site || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(site)) return res.status(400).json({ error: 'Site invalide' });
  const b = req.body || {};
  const nom = String(b.name || '').trim().slice(0, 120);
  const courriel = String(b.email || '').trim().slice(0, 180);
  const message = String(b.message || '').trim().slice(0, 4000);
  const entreprise = String(b.company || '').trim().slice(0, 140) || null;
  const sujets = Array.isArray(b.topics) ? JSON.stringify(b.topics.slice(0, 12).map(s => String(s).slice(0, 40))) : null;
  const langue = /^(en|fr)$/.test(b.lang) ? b.lang : null;

  if (!nom || !message || message.length < 10) return res.status(400).json({ error: 'Champs requis manquants' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(courriel)) return res.status(400).json({ error: 'Courriel invalide' });

  try {
    const ipHash = require('crypto').createHash('sha256')
      .update(String(req._leadIp) + (process.env.MASTER_KEY || 'sel')).digest('hex').slice(0, 16);
    // Réception : marquer si le contact arrive hors des heures d'ouverture —
    // c'est le chiffre qui frappe le plus le commerçant (« reçu à 21h, perdu »).
    const horsHeures = reception.estHorsHeures(new Date(),
      reception.configDe(db, site).heures) ? 1 : 0;
    const info = db.prepare(`INSERT INTO leads (source, nom, courriel, entreprise, message, sujets, langue, ip_hash, hors_heures)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(site, nom, courriel, entreprise, message, sujets, langue, ipHash, horsHeures);
    console.log(`[lead:${site}] #${info.lastInsertRowid} ${nom} <${courriel}>`);
    // Alerte immédiate : un prospect qui écrit ne doit pas attendre.
    if (core && core.alerter) {
      core.alerter.alert(`Nouveau message — ${site}`,
        `${nom}${entreprise ? ' (' + entreprise + ')' : ''} · ${courriel}\n${message.slice(0, 400)}`);
    }
    // Poste de commande + Réponse Instantanée. Ne doit jamais casser
    // l'enregistrement du lead.
    try {
      const et = branchement.etat(db, site);
      const nomCommerce = et.identite.nom || reception.configDe(db, site).nomCommerce;
      // 1) Si l'entreprise a autorisé Novalis à rédiger, on PRÉPARE la vraie
      //    réponse (brouillon) et on la dépose dans la file — rien n'est envoyé,
      //    le commerçant dira oui.
      if (et.consent.rediger) {
        propositions.creerReponsePourLead(db,
          { id: info.lastInsertRowid, source: site, nom, courriel, message },
          { nomCommerce, telephone: et.identite.telephone, horsHeures: !!horsHeures });
      }
      // 2) Réponse Instantanée 24/7 : si l'entreprise l'a activée, un accusé de
      //    réception part IMMÉDIATEMENT au client. Il n'engage rien (aucun prix,
      //    aucun délai) — donc sûr sans approbation. C'est ce qui évite de perdre
      //    un client faute de réponse rapide. Envoi seulement si le courriel
      //    d'envoi est configuré ; sinon on n'enregistre aucun faux accusé.
      const cxCourriel = et.connexions.find(x => x.type === 'courriel' && x.statut === 'branche');
      const replyTo = et.identite.courriel
        || (cxCourriel && /@/.test(String(cxCourriel.compte_label || '')) ? cxCourriel.compte_label : undefined);
      if (et.consent.accuse && mailer.configured && courriel) {
        mailer.envoyer({
          to: courriel,
          subject: propositions.sujetAccuse({ nomCommerce }),
          text: propositions.accuseReception({ nom }, { nomCommerce, telephone: et.identite.telephone }),
          replyTo,
        }).then(r => {
          if (r.sent) {
            try { db.prepare('UPDATE leads SET accuse_le = ? WHERE id = ?')
              .run(new Date().toISOString().replace('T', ' ').slice(0, 19), info.lastInsertRowid); } catch { /* non bloquant */ }
          }
        }).catch(() => { /* un accusé qui échoue ne bloque jamais */ });
      }
    } catch (e) { console.error('[proposition/accusé] échec:', e.message); }
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[lead] erreur:', e.message);
    res.status(500).json({ error: 'Enregistrement impossible' });
  }
});

// Consultation des messages reçus (admin).
app.get('/core/leads', adminOnly, coreReady, (req, res) => {
  const site = req.query.site ? String(req.query.site).slice(0, 40) : null;
  const rows = site
    ? db.prepare('SELECT * FROM leads WHERE source = ? ORDER BY id DESC LIMIT 200').all(site)
    : db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 200').all();
  res.json({ leads: rows.map(r => ({ ...r, sujets: r.sujets ? JSON.parse(r.sujets) : [] })) });
});

// Coffre : écrire un credential client (la valeur n'est JAMAIS relisible
// via HTTP — get n'existe volontairement pas ici, seulement la liste des noms).
app.post('/core/credentials', adminOnly, coreReady, (req, res) => {
  try {
    const { clientId, name, value } = req.body || {};
    core.vault.set(clientId, name, value);
    res.json({ ok: true, clientId, name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get('/core/credentials/:clientId', adminOnly, coreReady, (req, res) => {
  res.json({ credentials: core.vault.list(parseInt(req.params.clientId, 10)) });
});

// Sites générés/gérés par le moteur IA (Novalis Studio).
app.get('/core/sites', adminOnly, coreReady, (req, res) => {
  const rows = db.prepare(`SELECT s.id, s.client_id, c.nom AS client_nom, s.slug, s.nom, s.statut, s.created_at, s.updated_at
    FROM sites s JOIN clients c ON c.id = s.client_id ORDER BY s.updated_at DESC LIMIT 100`).all();
  res.json({ sites: rows });
});

// ── Novalis Réception — cockpit de capture de leads ─────────────────
// Le produit récurrent : chaque contact (message + clic tél) capturé, chronométré,
// compté. Le cockpit est interne (admin) ; le rapport mensuel part au commerçant
// via une URL signée sans compte.
const reception = require('./core/reception');
const { renderReception, renderRapport } = require('./core/reception-page');
const pulse = require('./core/pulse');
const branchement = require('./core/branchement');
const { renderBranchement } = require('./core/branchement-page');
const propositions = require('./core/propositions');
const { renderPropositions } = require('./core/propositions-page');
const { renderAujourdhui } = require('./core/aujourdhui-page');
const { renderResultats } = require('./core/resultats-page');
const { renderConfiance } = require('./core/confiance-page');
const { renderLogin } = require('./core/login-page');
const { renderBooking } = require('./core/booking-page');
const { renderDevisAccept } = require('./core/devis-accept-page');
const { renderRdvConfirm } = require('./core/rdv-confirm-page');
const oauth = require('./core/oauth');
const { renderEntreprises } = require('./core/entreprises-page');
const devis = require('./core/devis');
const { renderDevis } = require('./core/devis-page');
const rdv = require('./core/rdv');
const { renderRdv } = require('./core/rdv-page');
const { renderPublications } = require('./core/publications-page');
const nova = require('./core/nova');
const { createMailer } = require('./core/alerts');
const mailer = createMailer(process.env);

function sourcesConnues() {
  const set = new Set();
  // Une entreprise BRANCHÉE (même sans aucun lead encore) doit apparaître dans
  // les sélecteurs — sinon on ne peut pas la piloter avant son premier contact.
  const tables = ['leads', 'taps', 'entreprises', 'reception_config', 'services', 'pulse_events'];
  for (const t of tables) {
    try { for (const r of db.prepare(`SELECT DISTINCT source FROM ${t}`).all()) set.add(r.source); } catch { /* table jeune */ }
  }
  return [...set].filter(Boolean).sort();
}

app.get('/core/reception', adminOnly, coreReady, (req, res) => {
  const sources = sourcesConnues();
  const source = String(req.query.source || sources[0] || 'novalis').slice(0, 40);
  const data = reception.apercu(db, source, { jours: 30 });
  const pouls = pulse.apercu(db, source, { jours: 30 });
  const token = reception.jetonRapport(source, process.env.MASTER_KEY);
  const base = `${req.protocol}://${req.get('host')}`;
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderReception(data, { sources, pulse: pouls, pass: req.query.pass ? String(req.query.pass) : undefined, alertes: propositions.compteurs(db, source).en_attente, rapportUrl: `${base}/r/${encodeURIComponent(source)}/${token}` }));
});

// ── Novalis Résultats — le relevé de valeur (chiffres réels) ────────
app.get('/core/resultats', adminOnly, coreReady, (req, res) => {
  const sources = sourcesConnues();
  const source = String(req.query.source || sources[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  const et = branchement.etat(db, source);
  const data = reception.apercu(db, source, { jours: 30 });
  const c = data.compteurs, rep = data.reponse;
  const prep = {};
  try {
    for (const row of db.prepare('SELECT type, statut, COUNT(*) n FROM propositions WHERE source = ? GROUP BY type, statut').all(source)) {
      const p = prep[row.type] || (prep[row.type] = { prepares: 0, traites: 0 });
      p.prepares += row.n;
      if (row.statut === 'approuve' || row.statut === 'envoye') p.traites += row.n;
    }
  } catch { /* base jeune */ }
  const clients = { gagne: 0, perdu: 0, contacte: 0, nouveau: 0 };
  try {
    for (const row of db.prepare('SELECT statut, COUNT(*) n FROM leads WHERE source = ? GROUP BY statut').all(source)) {
      if (row.statut && row.statut in clients) clients[row.statut] += row.n;
      else clients.nouveau += row.n;
    }
  } catch { /* base jeune */ }
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderResultats({
    source, nom: et.identite.nom, sources,
    pass: req.query.pass ? String(req.query.pass) : undefined,
    alertes: propositions.compteurs(db, source).en_attente, jours: data.fenetre_jours,
    recu: {
      contacts: c.contacts, leads: c.leads, taps: c.taps, hors_heures: c.hors_heures,
      valeur_captee_cents: c.valeur_captee_cents, en_attente: c.en_attente,
      pct_sous_1h: rep.pct_sous_1h, mediane_minutes: rep.mediane_minutes, repondus: rep.repondus,
      accuses: rep.accuses, accuses_hors_heures: rep.accuses_hors_heures,
    },
    prep, clients,
  }));
});

// Export CSV des contacts d'un commerce (pour Excel / comptable).
app.get('/core/reception/export.csv', adminOnly, coreReady, (req, res) => {
  const source = String(req.query.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  let rows = [];
  try {
    rows = db.prepare(`SELECT nom, courriel, entreprise, message, statut, hors_heures, created_at, repondu_le
      FROM leads WHERE source = ? ORDER BY created_at DESC LIMIT 5000`).all(source);
  } catch { rows = []; }
  const cell = (v) => {
    let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
    // Anti-injection de formule : un champ public commençant par = + - @ (ou
    // tab/retour) serait exécuté par Excel/Sheets. On le neutralise par une
    // apostrophe de tête (le tableur l'affiche en texte).
    if (/^[=+\-@\t\r]/.test(s)) s = '\'' + s;
    return /[",;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const entete = ['Nom', 'Courriel', 'Entreprise', 'Message', 'Statut', 'Hors heures', 'Reçu', 'Répondu'];
  const lignes = rows.map(r => [r.nom, r.courriel, r.entreprise, r.message, r.statut,
    r.hors_heures ? 'oui' : 'non', r.created_at, r.repondu_le || ''].map(cell).join(';'));
  const csv = '﻿' + [entete.join(';'), ...lignes].join('\r\n'); // BOM : accents corrects dans Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${source}.csv"`);
  res.send(csv);
});

// Configuration d'un site (onboarding client) — sans SQL, depuis le cockpit.
// Détermine le vrai nom affiché, le secteur, et la valeur d'un client capté.
app.post('/core/reception/config', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  const secteur = ['garage', 'plombier', 'electricien', 'restaurant', 'salon', 'health', 'construction', 'fitness'].includes(b.secteur) ? b.secteur : null;
  const nom = b.nom_commerce ? String(b.nom_commerce).slice(0, 120) : null;
  const valeurDollars = parseFloat(b.valeur_dollars);
  const valeurCents = Number.isFinite(valeurDollars) && valeurDollars > 0 ? Math.round(valeurDollars * 100) : null;
  try {
    db.prepare(`INSERT INTO reception_config (source, secteur, nom_commerce, valeur_lead_cents)
      VALUES (@source, @secteur, @nom, COALESCE(@valeur, 30000))
      ON CONFLICT(source) DO UPDATE SET
        secteur = COALESCE(@secteur, secteur),
        nom_commerce = COALESCE(@nom, nom_commerce),
        valeur_lead_cents = COALESCE(@valeur, valeur_lead_cents)`)
      .run({ source, secteur, nom, valeur: valeurCents });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Novalis Branchement — le commerçant remet ses clés ──────────────
// La porte d'entrée de la plateforme opérée : identité, connexions (dans le
// coffre chiffré), consentements. Tout est admin-only ; les secrets ne sont
// JAMAIS relisibles via HTTP.
app.get('/core/branchement', adminOnly, coreReady, (req, res) => {
  const source = String(req.query.source || sourcesConnues()[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  res.setHeader('X-Frame-Options', 'DENY');
  const eBr = branchement.etat(db, source);
  eBr.pass = req.query.pass ? String(req.query.pass) : undefined;
  eBr.sources = sourcesConnues();
  eBr.alertes = propositions.compteurs(db, source).en_attente;
  // Connexions « en un clic » (OAuth) — état + configuration.
  eBr.connexions1clic = Object.keys(oauth.PROVIDERS).map((pv) => {
    const P = oauth.PROVIDERS[pv];
    const cx = (eBr.connexions || []).find((c) => c.type === P.cxType);
    return { provider: pv, titre: P.titre, connecte: !!(cx && cx.statut === 'branche'), label: cx ? cx.compte_label : null, configure: oauth.configure(pv) };
  });
  if (req.query.cx) {
    eBr.cxMsg = req.query.ok ? { ok: true, texte: 'Compte connecté ✓' }
      : req.query.e === 'config' ? { ok: false, texte: 'Ce branchement n\'est pas encore activé (clé d\'application à configurer).' }
        : req.query.e === 'refus' ? { ok: false, texte: 'Autorisation refusée.' }
          : { ok: false, texte: 'La connexion a échoué. Réessayez.' };
  }
  res.send(renderBranchement(eBr));
});

app.post('/core/branchement', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  try {
    branchement.definirEntreprise(db, source, {
      nom: b.nom, secteur: b.secteur, ville: b.ville,
      telephone: b.telephone, courriel: b.courriel, siteUrl: b.site_url,
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/core/branchement/consentement', adminOnly, coreReady, express.json({ limit: '4kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  const c = b.consentements || {};
  try {
    branchement.definirConsentement(db, source, { rediger: !!c.rediger, envoyer: !!c.envoyer, accuse: !!c.accuse, operer: !!c.operer });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Brancher/débrancher une connexion. Si un secret est fourni, il part
// DIRECTEMENT au coffre chiffré (jamais stocké en clair, jamais renvoyé).
app.post('/core/branchement/connexion', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  const type = String(b.type || '');
  const statut = ['a_brancher', 'branche', 'erreur'].includes(b.statut) ? b.statut : 'a_brancher';
  try {
    const clientId = branchement.assurerClient(db, source, null);
    // Le secret (optionnel) va au coffre sous un nom stable ; on ne conserve
    // jamais sa valeur ailleurs. La table connexions ne garde que l'étiquette.
    if (statut === 'branche' && typeof b.secret === 'string' && b.secret.trim()) {
      core.vault.set(clientId, `connexion:${type}`, b.secret.trim());
    }
    if (statut !== 'branche') {
      try { core.vault.remove(clientId, `connexion:${type}`); } catch { /* rien à retirer */ }
    }
    branchement.definirConnexion(db, source, type, { statut, label: b.label, detail: b.detail });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Branchement OAuth : le commerçant connecte SON Gmail / QuickBooks ─
// Il autorise sur l'écran du fournisseur ; le jeton va au coffre chiffré.
app.get('/core/connexion/:provider/start', adminOnly, coreReady, (req, res) => {
  const provider = req.params.provider;
  const source = String(req.query.source || '').slice(0, 40);
  const pq = req.query.pass ? '&pass=' + encodeURIComponent(String(req.query.pass)) : '';
  const retour = (params) => res.redirect('/core/branchement?source=' + encodeURIComponent(source) + params + pq);
  if (!oauth.PROVIDERS[provider] || !/^[a-z0-9-]{2,40}$/.test(source)) return res.status(404).type('text/plain').send('Introuvable');
  if (!oauth.configure(provider)) return retour('&cx=' + provider + '&e=config');
  const redirectUri = `${req.protocol}://${req.get('host')}/core/connexion/${provider}/callback`;
  const state = oauth.signState({ source, provider, t: Date.now() }, process.env.MASTER_KEY || 'sel');
  res.redirect(oauth.authUrl(provider, { redirectUri, state }));
});
app.get('/core/connexion/:provider/callback', coreReady, async (req, res) => {
  const provider = req.params.provider;
  const st = oauth.verifyState(String(req.query.state || ''), process.env.MASTER_KEY || 'sel');
  if (!oauth.PROVIDERS[provider] || !st || st.provider !== provider) return res.status(400).type('text/plain').send('État invalide ou expiré.');
  const source = String(st.source || '').slice(0, 40);
  const back = (params) => res.redirect('/core/branchement?source=' + encodeURIComponent(source) + params);
  if (req.query.error) return back('&cx=' + provider + '&e=refus');
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/core/connexion/${provider}/callback`;
    const tok = await oauth.exchangeCode(provider, { code: String(req.query.code || ''), redirectUri });
    const clientId = branchement.assurerClient(db, source, null);
    core.vault.set(clientId, 'oauth:' + provider, JSON.stringify({ ...tok, realmId: req.query.realmId || null, obtenu_le: Date.now() }));
    const label = provider === 'quickbooks' ? ('QuickBooks' + (req.query.realmId ? ' · ' + req.query.realmId : '')) : 'Compte Google';
    branchement.definirConnexion(db, source, oauth.PROVIDERS[provider].cxType, { statut: 'branche', label });
    back('&cx=' + provider + '&ok=1');
  } catch (e) {
    console.error('[oauth]', provider, e.message);
    back('&cx=' + provider + '&e=echec');
  }
});
app.post('/core/connexion/:provider/disconnect', adminOnly, coreReady, express.json({ limit: '2kb' }), (req, res) => {
  const provider = req.params.provider;
  const source = String((req.body && req.body.source) || '').slice(0, 40);
  if (!oauth.PROVIDERS[provider] || !/^[a-z0-9-]{2,40}$/.test(source)) return res.status(404).json({ error: 'Introuvable' });
  try {
    const clientId = branchement.assurerClient(db, source, null);
    try { core.vault.remove(clientId, 'oauth:' + provider); } catch { /* rien à retirer */ }
    branchement.definirConnexion(db, source, oauth.PROVIDERS[provider].cxType, { statut: 'a_brancher', label: null });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Novalis Aujourd'hui — le poste de commande unifié ───────────────
// Le seul écran du matin : à approuver, contacts, ce qui décroche, branchement.
function ilYaCourt(iso) {
  const t = Date.parse(String(iso).replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}
// Point d'entrée : /core mène au hub d'agence (conserve ?pass=).
app.get('/core', (req, res) => {
  const p = req.query.pass ? '?pass=' + encodeURIComponent(String(req.query.pass)) : '';
  res.redirect('/core/entreprises' + p);
});

// ── Novalis Entreprises — hub d'agence ──────────────────────────────
app.get('/core/entreprises', adminOnly, coreReady, (req, res) => {
  const entreprises = sourcesConnues().map((source) => {
    const et = branchement.etat(db, source);
    let enAttente = 0, contacts = 0, rdvSoon = 0;
    try { enAttente = db.prepare('SELECT COUNT(*) n FROM leads WHERE source = ? AND statut = \'nouveau\'').get(source).n; } catch { /* jeune */ }
    try {
      contacts = db.prepare(`SELECT
        (SELECT COUNT(*) FROM leads WHERE source = ? AND created_at >= datetime('now','-30 days'))
      + (SELECT COUNT(*) FROM taps WHERE source = ? AND cree_le >= datetime('now','-30 days')) AS n`).get(source, source).n;
    } catch { /* jeune */ }
    try {
      const nw = rdv.montrealWall(Date.now()), n2 = rdv.montrealWall(Date.now() + 2 * 86400000);
      rdvSoon = db.prepare('SELECT COUNT(*) n FROM rendezvous WHERE source = ? AND statut = \'prevu\' AND debut BETWEEN ? AND ?').get(source, nw, n2).n;
    } catch { /* jeune */ }
    return {
      source, nom: et.identite.nom,
      aApprouver: propositions.compteurs(db, source).en_attente,
      enAttente, contacts, rdvSoon, pretPct: et.pret_pct,
    };
  }).sort((a, b) => (b.aApprouver + b.enAttente) - (a.aApprouver + a.enAttente) || a.source.localeCompare(b.source));
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderEntreprises({ entreprises, pass: req.query.pass ? String(req.query.pass) : undefined }));
});
app.post('/core/entreprises', adminOnly, coreReady, express.json({ limit: '4kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'identifiant invalide (a-z 0-9 -, min. 2)' });
  try { branchement.definirEntreprise(db, source, { nom: b.nom || null }); res.json({ ok: true, source }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Contexte agrégé pour Nova (observations). Réutilisé par Aujourd'hui et le chat.
function contexteNova(source, et, recu, pouls, cptsProp) {
  let gagnes = 0, avisT = 0, servicesCount = 0, rdvBientot = 0;
  try { gagnes = db.prepare('SELECT COUNT(*) n FROM leads WHERE source = ? AND statut = \'gagne\'').get(source).n; } catch { /* jeune */ }
  try { avisT = db.prepare('SELECT COUNT(*) n FROM propositions WHERE source = ? AND type = \'avis\'').get(source).n; } catch { /* jeune */ }
  try { servicesCount = devis.listerServices(db, source).length; } catch { /* jeune */ }
  try {
    const nw = rdv.montrealWall(Date.now()), n2 = rdv.montrealWall(Date.now() + 2 * 86400000);
    rdvBientot = db.prepare('SELECT COUNT(*) n FROM rendezvous WHERE source = ? AND statut = \'prevu\' AND debut BETWEEN ? AND ?').get(source, nw, n2).n;
  } catch { /* jeune */ }
  return {
    leadsAttente: recu.compteurs.en_attente,
    propositions: cptsProp.en_attente,
    fuite: pouls,
    pretPct: et.pret_pct,
    pctSous1h: recu.reponse.pct_sous_1h,
    repondus: recu.reponse.repondus,
    accuseActif: et.consent.accuse,
    horsHeures: recu.compteurs.hors_heures,
    gagnesSansAvis: Math.max(0, gagnes - avisT),
    servicesCount, rdvBientot,
    contacts: recu.compteurs.contacts,
  };
}
app.get('/core/aujourdhui', adminOnly, coreReady, (req, res) => {
  const sources = sourcesConnues();
  const source = String(req.query.source || sources[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  const et = branchement.etat(db, source);
  // Relance paresseuse : à l'ouverture du tableau de bord, préparer une relance
  // pour chaque client devenu silencieux (si l'entreprise a consenti « rédiger »).
  // Idempotent, sans tâche planifiée ; ne doit jamais casser l'affichage.
  if (et.consent.rediger) {
    const cfgP = { nomCommerce: et.identite.nom, telephone: et.identite.telephone, secteur: et.identite.secteur };
    try { propositions.preparerRelances(db, source, { jours: 3, cfg: cfgP }); }
    catch (e) { console.error('[relance] balayage échoué:', e.message); }
    try { propositions.preparerFidelisations(db, source, { cfg: cfgP }); }
    catch (e) { console.error('[fidelisation] balayage échoué:', e.message); }
  }
  const recu = reception.apercu(db, source, { jours: 30 });
  const pouls = pulse.apercu(db, source, { jours: 30 });
  const heure = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Montreal', hour: 'numeric', hour12: false }).format(new Date()), 10) % 24;
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';
  const dateLabel = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Montreal', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const attente = recu.leads_recents.filter(l => l.statut === 'nouveau').slice(0, 5).map(l => ({
    nom: l.nom, apercu: String(l.message || '').slice(0, 70), ilya: ilYaCourt(l.created_at),
  }));
  const propsAttente = propositions.lister(db, source, { statut: 'en_attente' }).slice(0, 4)
    .map(p => ({ type: p.type, titre: p.titre, apercu: p.apercu }));
  // Nova — analyse déterministe de l'entreprise (problèmes + occasions).
  const cptsProp = propositions.compteurs(db, source);
  const insights = nova.analyser(contexteNova(source, et, recu, pouls, cptsProp));
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderAujourdhui({
    source, nom: et.identite.nom, salutation, dateLabel: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1), sources,
    pass: req.query.pass ? String(req.query.pass) : undefined, alertes: cptsProp.en_attente,
    signaux: {
      a_approuver: cptsProp.en_attente,
      contacts: recu.compteurs.contacts,
      en_attente: recu.compteurs.en_attente,
    },
    propositions: propsAttente,
    fuite: pouls,
    leads_attente: attente,
    pret_pct: et.pret_pct,
    semaine: recu.tendance.slice(-7),
    nova: { resume: nova.resume(insights), insights: insights.slice(0, 5) },
  }));
});

// ── Nova — « Nova répond » (chat) ──────────────────────────────────
// Utilise le moteur IA (core.llm) quand une clé est configurée ; sinon,
// répond honnêtement avec les observations déterministes de Nova.
app.post('/core/nova/chat', adminOnly, coreReady, express.json({ limit: '8kb' }), async (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  const message = String(b.message || '').trim().slice(0, 1000);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ answer: 'Entreprise invalide.' });
  if (!message) return res.status(400).json({ answer: 'Posez-moi une question.' });
  try {
    // Nova agit : commandes déterministes (jamais laissées à l'IA d'inventer).
    const cmd = nova.interpreterCommande(message);
    if (cmd) {
      if (cmd.action === 'activer') {
        branchement.definirConsentement(db, source, cmd.quoi === 'accuse' ? { accuse: true } : { envoyer: true });
        return res.json({ answer: cmd.quoi === 'accuse'
          ? '✓ C\'est fait — la réponse instantanée 24/7 est activée. Chaque client qui écrit recevra aussitôt un accusé à votre nom.'
          : '✓ C\'est fait — l\'envoi après votre approbation est activé.' });
      }
      const enAttente = propositions.lister(db, source, { statut: 'en_attente' });
      if (!enAttente.length) return res.json({ answer: 'Il n\'y a rien en attente d\'approbation pour l\'instant.' });
      let cibles = enAttente;
      if (cmd.cible) {
        const cq = cmd.cible.toLowerCase();
        cibles = enAttente.filter(p => (p.titre || '').toLowerCase().includes(cq) || (p.apercu || '').toLowerCase().includes(cq));
        if (!cibles.length) return res.json({ answer: `Je ne trouve pas de proposition liée à « ${cmd.cible} ». Elles sont toutes dans le poste de commande.` });
      } else if (!cmd.tout && enAttente.length > 1) {
        return res.json({ answer: `Vous avez ${enAttente.length} propositions en attente. Dites-moi laquelle (ex. « approuve la réponse à Luc ») ou « approuve tout ».` });
      }
      if (!cmd.tout) cibles = cibles.slice(0, 1);
      let done = 0, envoye = 0;
      for (const p of cibles) {
        const rr = await executerActionProposition(p.id, cmd.action, {});
        if (rr.json && rr.json.ok !== false) { done++; if (rr.json.envoye) envoye++; }
      }
      if (cmd.action === 'rejeter') return res.json({ answer: `✓ ${done} ${done > 1 ? 'propositions rejetées' : 'proposition rejetée'}.` });
      const reste = envoye ? '' : ' Marqué « à envoyer à la main » (l\'envoi automatique n\'est pas activé — dites « active l\'envoi » pour l\'activer).';
      return res.json({ answer: `✓ J'ai approuvé ${done} ${done > 1 ? 'propositions' : 'proposition'}${envoye ? ` et envoyé ${envoye}` : ''}.${reste}` });
    }

    const et = branchement.etat(db, source);
    const recu = reception.apercu(db, source, { jours: 30 });
    const pouls = pulse.apercu(db, source, { jours: 30 });
    const insights = nova.analyser(contexteNova(source, et, recu, pouls, propositions.compteurs(db, source)));
    const resumeInsights = nova.resume(insights)
      + (insights.length ? '\n\n' + insights.map(i => '• ' + i.titre + ' — ' + i.detail).join('\n') : '');

    const clientId = et.client_id || branchement.assurerClient(db, source, null);
    const systeme = `Tu es l'assistant d'exploitation de Novalis pour l'entreprise « ${et.identite.nom || source} »`
      + `${et.identite.secteur ? ' (' + et.identite.secteur + ')' : ''}. Tu parles au propriétaire, `
      + `en français simple et concret. Sois brève (2 à 4 phrases). Base-toi UNIQUEMENT sur les données ci-dessous ; `
      + `n'invente aucun chiffre ni aucune promesse. Si tu ne sais pas, dis-le et propose l'écran où trouver la réponse. `
      + `Tu peux suggérer une action (approuver une proposition, activer la réponse instantanée, compléter le branchement…).\n\n`
      + `ÉTAT ACTUEL:\n${resumeInsights}\n\nCHIFFRES (30 j): contacts=${recu.compteurs.contacts}, `
      + `en attente=${recu.compteurs.en_attente}, conversion=${pouls.conversion_pct}%, prêt à opérer=${et.pret_pct}%.`;

    try {
      const out = await core.llm.claude(clientId, {
        system: systeme, messages: [{ role: 'user', content: message }], maxTokens: 500, stepName: 'nova-chat',
      });
      return res.json({ answer: (out.text || '').trim() || resumeInsights });
    } catch (e) {
      if (/ANTHROPIC_API_KEY absente/.test(e.message)) {
        return res.json({ answer: resumeInsights, note: 'La conversation détaillée n\'est pas activée pour l\'instant — voici l\'essentiel.' });
      }
      if (e.code === 'BUDGET_EPUISE') {
        return res.json({ answer: resumeInsights, note: 'La conversation détaillée est en pause pour le moment — voici l\'essentiel.' });
      }
      console.error('[nova/chat] llm échec:', e.message);
      return res.json({ answer: resumeInsights, note: 'Petit souci technique — voici l\'essentiel.' });
    }
  } catch (e) {
    res.status(500).json({ answer: 'Un souci est survenu. Réessayez.', detail: e.message });
  }
});

// ── Novalis Publications — marketing opéré (composeur) ──────────────
app.get('/core/publications', adminOnly, coreReady, (req, res) => {
  const source = String(req.query.source || sourcesConnues()[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  const et = branchement.etat(db, source);
  res.setHeader('X-Frame-Options', 'DENY');
  let pubRecents = [];
  try { pubRecents = db.prepare('SELECT apercu, brouillon, statut FROM propositions WHERE source = ? AND type = \'publication\' ORDER BY id DESC LIMIT 8').all(source); } catch { /* jeune */ }
  res.send(renderPublications({ source, nom: et.identite.nom, recents: pubRecents, sources: sourcesConnues(), pass: req.query.pass ? String(req.query.pass) : undefined, alertes: propositions.compteurs(db, source).en_attente }));
});
function cfgPub(source) {
  const et = branchement.etat(db, source);
  return { nomCommerce: et.identite.nom, telephone: et.identite.telephone, ville: et.identite.ville };
}
app.post('/core/publications/apercu', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ apercu: '' });
  res.json({ apercu: propositions.brouillonPublication(String(b.theme || ''), String(b.essentiel || '').slice(0, 1200), cfgPub(source)) });
});
app.post('/core/publications', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  const essentiel = String(b.essentiel || '').trim().slice(0, 1200);
  if (!essentiel) return res.status(400).json({ error: 'essentiel requis' });
  try { res.json({ ok: true, ...propositions.creerPublication(db, source, { theme: String(b.theme || ''), essentiel, cfg: cfgPub(source) }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Novalis Rendez-vous — carnet + rappels automatiques ─────────────
app.get('/core/rdv', adminOnly, coreReady, (req, res) => {
  const sources = sourcesConnues();
  const source = String(req.query.source || sources[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  const et = branchement.etat(db, source);
  // Rappels paresseux : préparer les rappels des RDV proches (si consentement).
  if (et.consent.rediger) {
    try {
      const baseR = `${req.protocol}://${req.get('host')}`;
      rdv.preparerRappels(db, source, { now: Date.now(), fenetreH: 48, cfg: {
        nomCommerce: et.identite.nom, telephone: et.identite.telephone,
        lienConfirmer: (r) => `${baseR}/rdv/${encodeURIComponent(source)}/confirmer/${r.id}/${branchement.jetonRdv(source, r.id, process.env.MASTER_KEY)}`,
      } });
    }
    catch (e) { console.error('[rdv:rappels]', e.message); }
  }
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderRdv({ source, nom: et.identite.nom, sources, rdvs: rdv.lister(db, source), pass: req.query.pass ? String(req.query.pass) : undefined, alertes: propositions.compteurs(db, source).en_attente, bookingUrl: `${req.protocol}://${req.get('host')}/rdv/${encodeURIComponent(source)}` }));
});
app.post('/core/rdv', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  try { res.json({ ok: true, ...rdv.ajouter(db, source, b) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/core/rdv/:id', adminOnly, coreReady, express.json({ limit: '4kb' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  res.json({ ok: rdv.marquer(db, id, String((req.body || {}).statut || '')) });
});

// ── Novalis Devis — catalogue de services + composeur de soumissions ─
app.get('/core/devis', adminOnly, coreReady, (req, res) => {
  const source = String(req.query.source || sourcesConnues()[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  const et = branchement.etat(db, source);
  res.setHeader('X-Frame-Options', 'DENY');
  let recents = [];
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    recents = db.prepare('SELECT id, titre, apercu, statut, detail FROM propositions WHERE source = ? AND type = \'devis\' ORDER BY id DESC LIMIT 8').all(source)
      .map((r) => {
        let sc = null; try { sc = r.detail ? (JSON.parse(r.detail).client || null) : null; } catch { sc = null; }
        return { titre: r.titre, apercu: r.apercu, statut: r.statut, statutClient: sc,
          lienClient: `${base}/devis/${encodeURIComponent(source)}/${r.id}/${branchement.jetonProp(source, r.id, process.env.MASTER_KEY)}` };
      });
  } catch { /* base jeune */ }
  res.send(renderDevis({ source, nom: et.identite.nom, services: devis.listerServices(db, source), recents, sources: sourcesConnues(), pass: req.query.pass ? String(req.query.pass) : undefined, alertes: propositions.compteurs(db, source).en_attente }));
});
app.post('/core/devis/service', adminOnly, coreReady, express.json({ limit: '4kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  try {
    res.json({ ok: true, ...devis.ajouterService(db, source, {
      nom: b.nom, prix_cents: Number.isFinite(b.prix_cents) ? b.prix_cents : undefined, unite: b.unite }) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/core/devis/service/:id/suppr', adminOnly, coreReady, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  res.json({ ok: devis.supprimerService(db, id) });
});
app.post('/core/devis', adminOnly, coreReady, express.json({ limit: '16kb' }), (req, res) => {
  const b = req.body || {};
  const source = String(b.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).json({ error: 'source invalide' });
  const lignes = Array.isArray(b.lignes) ? b.lignes.slice(0, 40).map(l => ({
    nom: String(l.nom || '').slice(0, 120),
    quantite: Number.isFinite(l.quantite) ? l.quantite : 1,
    prix_cents: Number.isFinite(l.prix_cents) ? l.prix_cents : null,
  })) : [];
  if (!lignes.length) return res.status(400).json({ error: 'au moins une ligne requise' });
  try {
    const et = branchement.etat(db, source);
    const r = devis.creerDevis(db, {
      source, client: b.client ? String(b.client).slice(0, 120) : null,
      destinataire: b.courriel ? String(b.courriel).slice(0, 180) : null,
      nomCommerce: et.identite.nom, lignes,
    });
    res.json({ ok: true, id: r.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Novalis Poste de commande — la file d'approbation ───────────────
// « Novalis a déjà fait le travail, vous dites oui. » Admin-only.
app.get('/core/propositions', adminOnly, coreReady, (req, res) => {
  const source = String(req.query.source || sourcesConnues()[0] || 'novalis').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(400).type('text/plain').send('source invalide');
  const statut = ['en_attente', 'approuve', 'envoye', 'rejete'].includes(req.query.statut) ? req.query.statut : 'en_attente';
  const et = branchement.etat(db, source);
  const base = `${req.protocol}://${req.get('host')}`;
  const lienEspace = `${base}/e/${encodeURIComponent(source)}/${branchement.jetonEspace(source, process.env.MASTER_KEY)}`;
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderPropositions({
    source, nom: et.identite.nom,
    items: propositions.lister(db, source, { statut }),
    compteurs: propositions.compteurs(db, source),
    alertes: propositions.compteurs(db, source).en_attente,
    statut, lienEspace, sources: sourcesConnues(), pass: req.query.pass ? String(req.query.pass) : undefined,
  }));
});

// Logique partagée d'action sur une proposition (approuver/modifier/rejeter),
// utilisée par l'admin ET par l'espace commerçant (lien magique). L'approbation
// n'envoie que si l'entreprise a consenti ET que le courriel est branché ; sinon
// « approuvé — à envoyer à la main » (jamais de faux envoi).
async function executerActionProposition(id, action, body) {
  if (action === 'rejeter') return { code: 200, json: propositions.rejeter(db, id) };
  if (action === 'modifier') return { code: 200, json: propositions.modifier(db, id, (body || {}).brouillon) };
  if (action === 'approuver') {
    const p = propositions.get(db, id);
    if (!p) return { code: 404, json: { ok: false, raison: 'introuvable' } };
    if (typeof (body || {}).brouillon === 'string') propositions.modifier(db, id, body.brouillon);
    const et = branchement.etat(db, p.source);
    const cxCourriel = et.connexions.find(x => x.type === 'courriel' && x.statut === 'branche');
    const replyTo = et.identite.courriel
      || (cxCourriel && /@/.test(String(cxCourriel.compte_label || '')) ? cxCourriel.compte_label : undefined);
    const r = await propositions.approuver(db, id, {
      peutEnvoyer: et.consent.envoyer && !!replyTo,
      mailer, replyTo,
      sujet: propositions.sujetPour(p.type, { nomCommerce: et.identite.nom }),
    });
    return { code: r.ok ? 200 : 400, json: r };
  }
  return { code: 400, json: { ok: false, raison: 'action inconnue' } };
}

app.post('/core/propositions/:id', adminOnly, coreReady, express.json({ limit: '16kb' }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const { code, json } = await executerActionProposition(id, String((req.body || {}).action || ''), req.body || {});
    res.status(code).json(json);
  } catch (e) { res.status(500).json({ ok: false, raison: e.message }); }
});

// ── Espace commerçant (lien magique, sans mot de passe) ─────────────
// Le commerçant ouvre SON poste de commande via un lien privé signé et approuve
// lui-même. Aucun compte. Le jeton n'autorise QUE sa propre entreprise.
app.get('/e/:source/:token', coreReady, (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)
    || !branchement.jetonEspaceValide(source, req.params.token, process.env.MASTER_KEY)) {
    return res.status(403).type('text/plain').send('Lien invalide.');
  }
  // Préparer les relances silencieuses à l'ouverture (comme le tableau de bord).
  const et = branchement.etat(db, source);
  if (et.consent.rediger) {
    try { propositions.preparerRelances(db, source, { jours: 3, cfg: { nomCommerce: et.identite.nom, telephone: et.identite.telephone } }); } catch { /* jamais bloquant */ }
  }
  const statut = ['en_attente', 'approuve', 'envoye', 'rejete'].includes(req.query.statut) ? req.query.statut : 'en_attente';
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderPropositions({
    source, nom: et.identite.nom,
    items: propositions.lister(db, source, { statut }),
    compteurs: propositions.compteurs(db, source),
    statut, mode: 'owner', token: req.params.token,
  }));
});

app.post('/e/:source/:token/prop/:id', coreReady, express.json({ limit: '16kb' }), async (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)
    || !branchement.jetonEspaceValide(source, req.params.token, process.env.MASTER_KEY)) {
    return res.status(403).json({ ok: false, raison: 'lien invalide' });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false, raison: 'id invalide' });
  // Garde de portée : le jeton d'une entreprise ne peut agir QUE sur ses propres
  // propositions — jamais sur celles d'un autre commerce.
  const p = propositions.get(db, id);
  if (!p || p.source !== source) return res.status(404).json({ ok: false, raison: 'introuvable' });
  try {
    const { code, json } = await executerActionProposition(id, String((req.body || {}).action || ''), req.body || {});
    res.status(code).json(json);
  } catch (e) { res.status(500).json({ ok: false, raison: e.message }); }
});

// Mise à jour du cycle de vie d'un contact. Passer à « contacté/gagné/perdu »
// capture le délai de réponse (repondu_le) s'il n'est pas déjà posé.
app.post('/core/reception/lead/:id', adminOnly, coreReady, express.json({ limit: '8kb' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const b = req.body || {};
  const statut = ['nouveau', 'contacte', 'gagne', 'perdu'].includes(b.statut) ? b.statut : null;
  if (!statut) return res.status(400).json({ error: 'statut invalide' });
  try {
    const lead = db.prepare('SELECT id, source, nom, courriel, repondu_le FROM leads WHERE id = ?').get(id);
    if (!lead) return res.status(404).json({ error: 'introuvable' });
    const marqueReponse = (statut !== 'nouveau' && !lead.repondu_le);
    const maintenant = new Date().toISOString().replace('T', ' ').slice(0, 19);
    // gagne_le horodate le MOMENT du gain (pour la fidélisation), posé une fois.
    db.prepare(`UPDATE leads SET statut = ?, repondu_le = COALESCE(repondu_le, ?),
        valeur_cents = COALESCE(?, valeur_cents), gagne_le = COALESCE(gagne_le, ?) WHERE id = ?`)
      .run(statut, marqueReponse ? maintenant : null,
        Number.isInteger(b.valeur_cents) ? b.valeur_cents : null,
        statut === 'gagne' ? maintenant : null, id);
    // Réputation : un job gagné = le meilleur moment pour demander un avis.
    // Novalis prépare la demande (si l'entreprise a consenti « rédiger ») et la
    // dépose dans la file d'approbation. Idempotent, ne casse jamais la réponse.
    if (statut === 'gagne') {
      try {
        const et = branchement.etat(db, lead.source);
        if (et.consent.rediger) {
          const g = et.connexions.find(x => x.type === 'google' && x.statut === 'branche');
          const lienAvis = g && /^https?:\/\//.test(String(g.compte_label || '')) ? g.compte_label : null;
          propositions.creerAvisPourLead(db, lead, { nomCommerce: et.identite.nom, lienAvis });
        }
      } catch (e) { console.error('[proposition:avis] non créée:', e.message); }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Beacon de clic — appelé par les liens « appeler » des sites générés. Public,
// ultra-léger, anti-double-comptage par empreinte IP+source sur 2 minutes.
const tapVus = new Map();
app.get('/api/tap', beaconRateLimit, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const source = String(req.query.s || '').slice(0, 40);
  const canal = ['tel', 'cta', 'courriel'].includes(req.query.c) ? req.query.c : 'tel';
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(204).end();
  try {
    const ipHash = require('crypto').createHash('sha256')
      .update((req.ip || '') + source + (process.env.MASTER_KEY || 'sel')).digest('hex').slice(0, 16);
    const cle = ipHash + canal;
    const now = Date.now();
    if (!(tapVus.get(cle) && now - tapVus.get(cle) < 120000)) { // dédoublonnage 2 min
      tapVus.set(cle, now);
      if (tapVus.size > 10000) tapVus.clear();
      const hh = reception.estHorsHeures(new Date(), reception.configDe(db, source).heures) ? 1 : 0;
      db.prepare('INSERT INTO taps (source, canal, hors_heures, ip_hash) VALUES (?,?,?,?)').run(source, canal, hh, ipHash);
    }
  } catch (e) { /* un beacon ne doit jamais faire d'erreur visible */ void e; }
  res.status(204).end();
});

// ── Novalis Pulse — réception des événements anonymes ───────────────
// POST /api/pulse?s=<source>  body: { t:<jeton éphémère>, events:[{type,etiquette}] }
// Le jeton n'est JAMAIS stocké tel quel : on hache (jeton + IP + sel) pour
// obtenir un session_hash qui regroupe une visite sans identifier personne.
// Types énumérés côté serveur (aucune donnée libre). Anti-abus : plafond
// d'événements par requête, dédoublonnage court par (session, type, étiquette).
const pulseVus = new Map();
app.post('/api/pulse', beaconRateLimit, express.json({ limit: '16kb', type: () => true }), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const source = String(req.query.s || '').slice(0, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(source)) return res.status(204).end();
  const TYPES = new Set(['vue', 'section', 'profondeur', 'form_start', 'form_submit', 'tel', 'cta']);
  try {
    const body = req.body || {};
    const jeton = String(body.t || '').slice(0, 80);
    const events = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
    if (!jeton || !events.length) return res.status(204).end();
    // session_hash = hash(jeton éphémère + IP + source + sel). Jamais le jeton brut.
    const sessionHash = pulse.saltHash(
      jeton + '|' + (req.ip || '') + '|' + source,
      process.env.MASTER_KEY || 'sel-pulse',
    );
    const now = Date.now();
    const ins = db.prepare('INSERT INTO pulse_events (source, type, etiquette, session_hash) VALUES (?,?,?,?)');
    const tx = db.transaction((evs) => {
      for (const e of evs) {
        if (!e || !TYPES.has(e.type)) continue;
        const etq = e.etiquette != null ? String(e.etiquette).slice(0, 60) : null;
        const cle = sessionHash + '|' + e.type + '|' + (etq || '');
        if (pulseVus.get(cle) && now - pulseVus.get(cle) < 60000) continue; // même événement, 1 min
        pulseVus.set(cle, now);
        ins.run(source, e.type, etq, sessionHash);
      }
    });
    tx(events);
    // Purge par ÂGE (pas un vidage brutal) : au-delà du seuil, on ne retire que
    // les fenêtres de dédup expirées, pour ne pas rouvrir le double-comptage des
    // sessions actives juste après.
    if (pulseVus.size > 20000) {
      const cutoff = now - 60000;
      for (const [k, t] of pulseVus) if (t < cutoff) pulseVus.delete(k);
    }
  } catch (e) { /* un beacon ne doit jamais faire d'erreur visible */ void e; }
  res.status(204).end();
});

// Rapport mensuel du commerçant — URL signée, aucun compte. ?mois=YYYY-MM optionnel.
app.get('/r/:source/:token', (req, res) => {
  const source = String(req.params.source || '').slice(0, 40);
  if (!reception.jetonValide(source, req.params.token, process.env.MASTER_KEY)) {
    return res.status(403).type('text/plain').send('Lien invalide.');
  }
  if (!core) return res.status(503).type('text/plain').send('Indisponible.');
  const rap = reception.rapportMensuel(db, source, req.query.mois);
  const pouls = pulse.apercu(db, source, { jours: 30 });
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(renderRapport(rap, { public: true, pulse: pouls }));
});

// Registre de R&D (RS&DE / IRAP) — assemblé à partir des tables de production.
// JSON pour l'affichage, .md pour joindre à un dossier de subvention.
const { genererRegistre, genererMarkdown } = require('./core/rd-registre');
app.get('/core/rd-registre', adminOnly, coreReady, (req, res) => {
  try { res.json(genererRegistre(db)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/core/rd-registre.md', adminOnly, coreReady, (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="registre-rd-novalis.md"');
    res.type('text/markdown').send(genererMarkdown(db));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Page d'exploitation (runs, steps, coûts, relance) — auth par ?pass=
// au premier accès, ensuite localStorage + header.
const { renderAdminHtml } = require('./core/admin-page');
app.get('/core/admin', adminOnly, coreReady, (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.send(renderAdminHtml());
});

// Santé du noyau : profondeur de file, morts, âge du plus vieux job en
// attente — de quoi brancher un uptime-monitor externe gratuit.
// Seuils au-delà desquels la file est considérée en souffrance. Un job qui
// attend plus de 15 min, ou qui est « running » depuis plus de 30 min, signale
// un worker mort ou bloqué — pas un système en bonne santé.
const SANTE_ATTENTE_MAX_S = 15 * 60;
const SANTE_EXECUTION_MAX_S = 30 * 60;

app.get('/core/health', coreReady, (req, res) => {
  // COALESCE : sur une table vide, SUM() renvoie NULL et l'ancienne version
  // répondait {queued:null, running:null, dead:null} — illisible pour un
  // moniteur externe.
  const s = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status='queued'  THEN 1 ELSE 0 END), 0) AS queued,
      COALESCE(SUM(CASE WHEN status='running' THEN 1 ELSE 0 END), 0) AS running,
      COALESCE(SUM(CASE WHEN status='dead'    THEN 1 ELSE 0 END), 0) AS dead,
      MIN(CASE WHEN status='queued'  THEN run_at    END) AS oldest_queued,
      MIN(CASE WHEN status='running' THEN locked_at END) AS oldest_running
    FROM jobs`).get();

  // SQLite stocke « YYYY-MM-DD HH:MM:SS » en UTC. On normalise en ISO 8601
  // explicite : sans le T ni le Z, un serveur dans un fuseau non-UTC
  // interpréterait l'horodatage comme une heure locale et fausserait l'âge.
  const ageS = (t) => {
    if (!t) return null;
    const ms = Date.parse(String(t).replace(' ', 'T') + 'Z');
    return Number.isNaN(ms) ? null : Math.max(0, Math.floor((Date.now() - ms) / 1000));
  };
  const attenteS = ageS(s.oldest_queued);
  const executionS = ageS(s.oldest_running);

  // L'ancienne version répondait ok:true dès qu'aucun job n'était mort. Si le
  // worker mourait, les jobs s'empilaient en « queued », dead restait à 0, et
  // le moniteur d'uptime voyait « tout va bien » : la panne exactement que cet
  // endpoint existe pour détecter passait inaperçue.
  const problemes = [];
  if (s.dead > 0) problemes.push(`${s.dead} job(s) mort(s)`);
  if (attenteS !== null && attenteS > SANTE_ATTENTE_MAX_S) problemes.push(`file en retard (plus vieux en attente: ${attenteS}s)`);
  if (executionS !== null && executionS > SANTE_EXECUTION_MAX_S) problemes.push(`job bloqué en exécution depuis ${executionS}s`);

  const corps = {
    ok: problemes.length === 0,
    problemes,
    queued: s.queued,
    running: s.running,
    dead: s.dead,
    attente_s: attenteS,
    execution_s: executionS,
    oldest_queued: s.oldest_queued,
  };
  // 503 quand ça va mal : un moniteur gratuit alerte sur le code HTTP, pas sur
  // le contenu JSON.
  res.status(corps.ok ? 200 : 503).json(corps);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Novalis Preview en ligne → http://0.0.0.0:${PORT}`);

  // Ces imports crawlent bistrokoz.ca et letourduchef.com — deux sites de
  // tiers — à CHAQUE démarrage, soit une quinzaine de requêtes vers des
  // serveurs qui ne nous ont rien demandé, à chaque déploiement et chaque
  // redémarrage. Les démos concernées sont livrées depuis des mois : leurs
  // photos sont déjà dans le volume. On ne recrawle que sur demande explicite.
  if (process.env.IMPORTS_DEMOS_AU_DEMARRAGE !== '1') {
    console.log('[imports] crawl des sites tiers désactivé au démarrage (IMPORTS_DEMOS_AU_DEMARRAGE=1 pour le forcer)');
    return;
  }
  // Import auto des photos Kóz et Le Tour du Chef, en arrière-plan (ne bloque pas le démarrage)
  Promise.allSettled([
    importKozPhotos()
      .then(r => console.log('[koz-import]', JSON.stringify(r)))
      .catch(e => console.warn('[koz-import] erreur:', e.message)),
    importLtcPhotos()
      .then(r => console.log('[ltc-import]', JSON.stringify(r)))
      .catch(e => console.warn('[ltc-import] erreur:', e.message)),
    importLtcVideos()
      .then(r => console.log('[ltc-videos]', JSON.stringify(r)))
      .catch(e => console.warn('[ltc-videos] erreur:', e.message)),
  ]).then(() =>
    // Après les imports : recompresser toute image trop lourde (photos IA 8-9 Mo)
    compressExistingImages()
      .then(r => console.log('[compress]', JSON.stringify(r)))
      .catch(e => console.warn('[compress] erreur:', e.message))
  );
});
