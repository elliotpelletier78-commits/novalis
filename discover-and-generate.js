'use strict';

/**
 * Découverte de vraies PMEs québécoises via DuckDuckGo + génération de démos cinématiques.
 * Utilise les mêmes fonctions que main.py (DDG scrape + site scrape).
 */

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { generateCinematic } = require('./generate-cinematic.js');

// ── Cibles à chercher ─────────────────────────────────────────
const TARGETS = [
  { industry: 'garage',       query: 'garage mécanique automobile Sherbrooke Québec',   city: 'Sherbrooke' },
  { industry: 'restaurant',   query: 'restaurant gastronomique bistro Québec QC',        city: 'Québec' },
  { industry: 'salon',        query: 'salon coiffure spa beauté Laval Québec',           city: 'Laval' },
  { industry: 'clinique',     query: 'clinique physiothérapie médecine Longueuil Québec',city: 'Longueuil' },
  { industry: 'construction', query: 'entrepreneur construction rénovation Trois-Rivières Québec', city: 'Trois-Rivières' },
  { industry: 'restaurant',   query: 'brasserie taverne pub Saint-Jean-sur-Richelieu Québec', city: 'Saint-Jean-sur-Richelieu' },
];

// ── DDG HTML search ───────────────────────────────────────────
function ddgSearch(query, maxResults = 8) {
  return new Promise((resolve) => {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query) + '&kl=ca-fr';
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        'Accept-Language': 'fr-CA,fr;q=0.9',
      },
    };
    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const results = [];
        // Parse result titles + URLs + snippets from DDG HTML
        const linkRe = /class="result__url"[^>]*>([^<]+)<\/a>/g;
        const titleRe = /class="result__title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+(?:<[^>]+>[^<]*<\/[^>]+>)?[^<]*)<\/a>/g;
        const snippetRe = /class="result__snippet"[^>]*>([^<]+(?:<[^>]+>[^<]*<\/[^>]+>)*[^<]*)<\/a>/g;

        // Simpler: extract all result blocks
        const blocks = body.split('<div class="result ');
        for (const block of blocks.slice(1)) {
          if (results.length >= maxResults) break;
          // Title + URL
          const titleMatch = block.match(/class="result__title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          if (!titleMatch) continue;
          let href = titleMatch[1];
          // DDG redirects: extract real URL
          if (href.includes('uddg=')) {
            try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch(e) {}
          }
          if (!href.startsWith('http')) continue;
          // Skip directories and aggregators
          const skip = ['yelp.com','pagesjaunes','yellowpages','tripadvisor','google.com','facebook.com','instagram.com','linkedin.com','twitter.com','wikipedia','youtube.com','kijiji','reddit.com'];
          if (skip.some(d => href.includes(d))) continue;
          const title = (titleMatch[2] || '').replace(/<[^>]+>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          results.push({ title, url: href, snippet });
        }
        resolve(results);
      });
    }).on('error', () => resolve([]));
  });
}

// ── Scraper site web simple ───────────────────────────────────
function scrapeSite(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({}), 7000);
    const mod = url.startsWith('https') ? https : http;
    try {
      mod.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
          'Accept-Language': 'fr-CA,fr;q=0.9',
        },
        timeout: 6000,
      }, (res) => {
        // Follow one redirect
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          clearTimeout(timeout);
          return resolve(scrapeSite(res.headers.location));
        }
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          clearTimeout(timeout);
          // Phone
          const phoneRe = /(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g;
          const phones = body.match(phoneRe) || [];
          // Address — look for QC postal codes
          const addrRe = /\d+[,\s]+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+(?:,\s*(?:Québec|QC)[^<\n]{0,30})?/g;
          const addrs = (body.match(addrRe) || []).filter(a => a.length > 10 && a.length < 120);
          // Title
          const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
          const pageTitle = titleMatch ? titleMatch[1].replace(/[\|\-–].+/, '').trim() : '';
          // Founded year
          const foundedMatch = body.match(/(?:fondée?|établie?|depuis|en service depuis|opening)\s*(?:en\s*)?(\d{4})/i);
          const founded = foundedMatch ? foundedMatch[1] : '';
          resolve({
            phone: phones[0] ? phones[0].trim() : '',
            address: addrs[0] ? addrs[0].trim().replace(/\s+/g, ' ') : '',
            title: pageTitle,
            founded,
          });
        });
      }).on('error', () => { clearTimeout(timeout); resolve({}); })
        .on('timeout', () => { clearTimeout(timeout); resolve({}); });
    } catch(e) { clearTimeout(timeout); resolve({}); }
  });
}

// ── Choisir la meilleure PME parmi les résultats DDG ──────────
function pickBest(results, city) {
  // Préférer les résultats qui ont l'air d'un vrai site d'entreprise
  const goodTLDs = ['.ca', '.com', '.net', '.qc.ca'];
  const bad = ['yelp','tripadvisor','pagesjaunes','yellowpages','google','facebook','instagram','linkedin'];
  return results.find(r => {
    if (bad.some(d => r.url.includes(d))) return false;
    if (goodTLDs.some(t => r.url.includes(t))) return true;
    return false;
  }) || results[0];
}

// ── Extraire nom propre depuis le titre de la page ────────────
function extractName(result, scraped) {
  // Priorité: titre du site scrappé, puis title DDG
  const raw = scraped.title || result.title || '';
  // Nettoyer les suffixes communs
  return raw.replace(/\s*[-|–—].*$/, '').replace(/\s*\|\s*.*$/, '').trim().slice(0, 60) || 'Entreprise';
}

// ── Mapper l'industrie vers une industrie valide ──────────────
const INDUSTRY_MAP = {
  garage: 'garage', restaurant: 'restaurant', salon: 'salon',
  clinique: 'clinique', construction: 'construction',
};

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const generated = [];
  console.log(`\n🔍 Découverte de ${TARGETS.length} PMEs québécoises...\n`);

  for (const target of TARGETS) {
    console.log(`\n[${target.industry.toUpperCase()}] ${target.query}`);

    // 1. Chercher sur DDG
    const results = await ddgSearch(target.query, 10);
    if (!results.length) {
      console.log('  ✗ Aucun résultat DDG');
      continue;
    }

    const best = pickBest(results, target.city);
    if (!best) { console.log('  ✗ Pas de bon candidat'); continue; }
    console.log(`  → Site trouvé: ${best.url}`);

    // 2. Scraper le site
    const scraped = await scrapeSite(best.url);
    const name = extractName(best, scraped);
    const phone = scraped.phone || '';
    const address = scraped.address || target.city + ', QC';
    const founded = scraped.founded || '';

    console.log(`  → Nom: ${name}`);
    console.log(`  → Téléphone: ${phone || '(non trouvé)'}`);
    console.log(`  → Adresse: ${address}`);
    if (founded) console.log(`  → Fondée en: ${founded}`);

    // 3. Générer la démo cinématique
    try {
      const result = generateCinematic({
        industry: INDUSTRY_MAP[target.industry] || 'restaurant',
        name,
        phone,
        address,
        city: target.city,
        founded,
        website: best.url,
      });

      const dest = path.join(outputDir, `${result.slug}.html`);
      fs.writeFileSync(dest, result.html, 'utf8');
      console.log(`  ✓ Démo générée → output/${result.slug}.html`);
      generated.push({
        industry: target.industry,
        name,
        slug: result.slug,
        phone,
        city: target.city,
        website: best.url,
        file: dest,
      });
    } catch(e) {
      console.log(`  ✗ Erreur génération: ${e.message}`);
    }

    // Pause pour ne pas flood DDG
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('\n\n══════════════════════════════════════════');
  console.log(`✅ ${generated.length} démos générées :\n`);
  for (const g of generated) {
    console.log(`  [${g.industry}] ${g.name}`);
    console.log(`         ${g.city} · ${g.phone || 'téléphone non trouvé'}`);
    console.log(`         /demo/${g.slug}.html`);
    console.log(`         Site source: ${g.website}\n`);
  }
  return generated;
}

main().catch(console.error);
