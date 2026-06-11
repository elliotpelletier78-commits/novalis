'use strict';

/**
 * Découverte de PMEs québécoises — recherche DuckDuckGo + scrape de site.
 * Utilisé par server.js (/discover-search, /discover-generate) et
 * discover-and-generate.js (script standalone).
 */

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

// ── Fetch HTML — en-têtes navigateur, gzip, redirections ──────
function fetchHtml(url, timeout = 9000, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 4) return reject(new Error('trop de redirections'));
    const mod = url.startsWith('https') ? https : http;
    let req;
    const timer = setTimeout(() => { if (req) req.destroy(); reject(new Error('timeout')); }, timeout);
    req = mod.get(url, { headers: BROWSER_HEADERS, timeout }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return resolve(fetchHtml(loc, timeout, depth + 1));
      }
      if (res.statusCode !== 200) { clearTimeout(timer); res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
      else if (enc.includes('deflate')) stream = res.pipe(zlib.createInflate());
      else if (enc.includes('br')) stream = res.pipe(zlib.createBrotliDecompress());
      let body = '';
      stream.on('data', c => { body += c; if (body.length > 3_000_000) req.destroy(); });
      stream.on('end', () => { clearTimeout(timer); resolve(body); });
      stream.on('error', e => { clearTimeout(timer); reject(e); });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
    req.on('timeout', () => { clearTimeout(timer); req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Fetch avec repli archive.org pour les sites qui bloquent les robots ──────
async function fetchSiteHtml(url) {
  try {
    const html = await fetchHtml(url);
    return { html, effectiveUrl: url, viaArchive: false };
  } catch (firstErr) {
    try {
      const domain = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const api = 'https://archive.org/wayback/available?url=' + encodeURIComponent(domain);
      const json = JSON.parse(await fetchHtml(api, 8000));
      const snap = json && json.archived_snapshots && json.archived_snapshots.closest;
      if (!snap || !snap.available || !snap.url) throw firstErr;
      const snapUrl = snap.url.replace(/^http:/, 'https:');
      const html = await fetchHtml(snapUrl, 12000);
      console.log(`[fetch] ${url} bloqué (${firstErr.message}) → archive.org ${snap.timestamp || ''}`);
      return { html, effectiveUrl: snapUrl, viaArchive: true };
    } catch (e) {
      throw firstErr;
    }
  }
}

// Annuaires et agrégateurs à exclure des résultats
const SKIP_DOMAINS = [
  'yelp.com', 'pagesjaunes', 'yellowpages', 'tripadvisor', 'google.com',
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com',
  'wikipedia', 'youtube.com', 'kijiji', 'reddit.com', 'duckduckgo.com',
  'booking.com', 'opentable', 'doordash', 'ubereats', 'skipthedishes',
  'restomontreal', 'restoquebec', '411.ca', 'cylex', 'foursquare',
];

// ── Recherche DuckDuckGo HTML ─────────────────────────────────
function ddgSearch(query, maxResults = 8) {
  return new Promise((resolve) => {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query) + '&kl=ca-fr';
    const opts = {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-CA,fr;q=0.9' },
      timeout: 10000,
    };
    const req = https.get(url, opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const results = [];
        const blocks = body.split('<div class="result ');
        for (const block of blocks.slice(1)) {
          if (results.length >= maxResults) break;
          const titleMatch = block.match(/class="result__title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          if (!titleMatch) continue;
          let href = titleMatch[1];
          if (href.includes('uddg=')) {
            try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch(e) {}
          }
          if (!href.startsWith('http')) continue;
          if (SKIP_DOMAINS.some(d => href.includes(d))) continue;
          const title = (titleMatch[2] || '').replace(/<[^>]+>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          results.push({ title, url: href, snippet });
        }
        resolve(results);
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

// ── Scrape d'un site PME — nom, téléphone, adresse, année ─────
// Essaie le site direct ; s'il bloque les robots, lit la copie archive.org.
async function scrapeSite(url) {
  try {
    const { html: body, effectiveUrl, viaArchive } = await fetchSiteHtml(url);
    const phoneRe = /(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g;
    const phones = body.match(phoneRe) || [];
    const addrRe = /\d+[,\s]+(?:rue|boulevard|boul\.?|avenue|av\.?|chemin|ch\.?|route|rang|montée|place|côte)[A-Za-zÀ-ÿ\s,.'-]{3,80}/gi;
    const addrs = (body.match(addrRe) || []).filter(a => a.length > 10 && a.length < 120);
    const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';
    const foundedMatch = body.match(/(?:fondée?|établie?|depuis|en affaires depuis)\s*(?:en\s*)?((?:19|20)\d{2})/i);
    return {
      phone: phones[0] ? phones[0].trim() : '',
      address: addrs[0] ? addrs[0].trim().replace(/\s+/g, ' ') : '',
      title: pageTitle,
      founded: foundedMatch ? foundedMatch[1] : '',
      effectiveUrl,
      viaArchive,
      ...extractBrand(body, effectiveUrl),
    };
  } catch(e) {
    console.warn(`[scrapeSite] ${url}: ${e.message}`);
    return {};
  }
}

// ── Identité de marque — slogan, couleur, logo, services réels ─
function metaContent(html, attr, value) {
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : '';
}

function extractBrand(html, baseUrl) {
  // Slogan / description — leur vrai discours
  const description = metaContent(html, 'name', 'description') ||
                      metaContent(html, 'property', 'og:description');

  // Nom officiel du site
  const siteName = metaContent(html, 'property', 'og:site_name');

  // Couleur de marque — rejet du blanc/noir quasi purs
  let themeColor = '';
  const tc = metaContent(html, 'name', 'theme-color') || metaContent(html, 'name', 'msapplication-TileColor');
  if (/^#[0-9a-fA-F]{6}$/.test(tc)) {
    const r = parseInt(tc.slice(1,3),16), g = parseInt(tc.slice(3,5),16), b = parseInt(tc.slice(5,7),16);
    const luma = (0.299*r + 0.587*g + 0.114*b) / 255;
    if (luma > 0.08 && luma < 0.92) themeColor = tc;
  }

  // Logo — img avec "logo" dans src/class/alt, sinon apple-touch-icon
  let logoUrl = '';
  const logoTag = html.match(/<img[^>]+(?:src|class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/i);
  if (logoTag) {
    const srcM = logoTag[0].match(/src=["']([^"']+)["']/i);
    if (srcM) logoUrl = srcM[1];
  }
  if (!logoUrl) {
    const touchM = html.match(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
    if (touchM) logoUrl = touchM[1];
  }
  if (logoUrl) {
    try {
      logoUrl = logoUrl.startsWith('//') ? 'https:' + logoUrl
        : logoUrl.startsWith('/') ? new URL(baseUrl).origin + logoUrl
        : logoUrl.startsWith('http') ? logoUrl : new URL(logoUrl, baseUrl).href;
    } catch(e) { logoUrl = ''; }
  }

  // Services réels — titres h2/h3 courts, mots de navigation exclus
  const NAV_WORDS = /contact|propos|accueil|bienvenue|horaire|heures|témoignage|avis|joindre|faq|blogue|blog|infolettre|politique|droits|réserv|suivez|abonnez|carrière|emploi|nouvelle|actualité/i;
  const services = [];
  const hRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let hm;
  while ((hm = hRe.exec(html)) !== null && services.length < 6) {
    const txt = hm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (txt.length < 4 || txt.length > 42) continue;
    if (NAV_WORDS.test(txt)) continue;
    if (/^\d+$/.test(txt)) continue;
    if (services.includes(txt)) continue;
    services.push(txt);
  }

  return { description, siteName, themeColor, logoUrl, services };
}

// ── Nom propre depuis titre de page / résultat DDG ────────────
function extractName(ddgTitle, scrapedTitle) {
  const raw = scrapedTitle || ddgTitle || '';
  return raw.replace(/\s*[-|–—|].*$/, '').trim().slice(0, 60) || 'Entreprise';
}

module.exports = { ddgSearch, scrapeSite, extractName, extractBrand, fetchHtml, fetchSiteHtml, SKIP_DOMAINS };
