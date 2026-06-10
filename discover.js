'use strict';

/**
 * Découverte de PMEs québécoises — recherche DuckDuckGo + scrape de site.
 * Utilisé par server.js (/discover-search, /discover-generate) et
 * discover-and-generate.js (script standalone).
 */

const https = require('https');
const http  = require('http');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

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
function scrapeSite(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 2) return resolve({});
    const timer = setTimeout(() => resolve({}), 9000);
    const mod = url.startsWith('https') ? https : http;
    try {
      const req = mod.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'fr-CA,fr;q=0.9' },
        timeout: 8000,
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          clearTimeout(timer);
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          return resolve(scrapeSite(next, depth + 1));
        }
        let body = '';
        res.on('data', c => { body += c; if (body.length > 2_000_000) req.destroy(); });
        res.on('end', () => {
          clearTimeout(timer);
          const phoneRe = /(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g;
          const phones = body.match(phoneRe) || [];
          const addrRe = /\d+[,\s]+(?:rue|boulevard|boul\.?|avenue|av\.?|chemin|ch\.?|route|rang|montée|place|côte)[A-Za-zÀ-ÿ\s,.'-]{3,80}/gi;
          const addrs = (body.match(addrRe) || []).filter(a => a.length > 10 && a.length < 120);
          const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
          const pageTitle = titleMatch ? titleMatch[1].trim() : '';
          const foundedMatch = body.match(/(?:fondée?|établie?|depuis|en affaires depuis)\s*(?:en\s*)?((?:19|20)\d{2})/i);
          resolve({
            phone: phones[0] ? phones[0].trim() : '',
            address: addrs[0] ? addrs[0].trim().replace(/\s+/g, ' ') : '',
            title: pageTitle,
            founded: foundedMatch ? foundedMatch[1] : '',
          });
        });
      });
      req.on('error', () => { clearTimeout(timer); resolve({}); });
      req.on('timeout', () => { clearTimeout(timer); req.destroy(); resolve({}); });
    } catch(e) { clearTimeout(timer); resolve({}); }
  });
}

// ── Nom propre depuis titre de page / résultat DDG ────────────
function extractName(ddgTitle, scrapedTitle) {
  const raw = scrapedTitle || ddgTitle || '';
  return raw.replace(/\s*[-|–—|].*$/, '').trim().slice(0, 60) || 'Entreprise';
}

module.exports = { ddgSearch, scrapeSite, extractName, SKIP_DOMAINS };
