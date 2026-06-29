'use strict';

/**
 * Recherche de marque approfondie — multi-pages, JSON-LD, sémantique.
 *
 * researchBrand(url)           → profil de marque complet (sans téléchargement)
 * downloadBrandPhotos(...)     → télécharge les photos assignées par rôle
 */

const { fetchHtml, fetchSiteHtml } = require('./discover');
const fs   = require('fs');
const path = require('path');

// ── Pages clés à crawler (en ordre de priorité) ────────────────
const KEY_PAGES = [
  { pattern: /\/(a-propos|about|about-us|notre-histoire|qui-sommes|equipe|team|nous)\b/i, tag: 'about' },
  { pattern: /\/(services?|expertises?|nos-services|offres|what-we-do|soins)\b/i, tag: 'services' },
  { pattern: /\/(menu|carte|plats|nos-plats)\b/i, tag: 'menu' },
  { pattern: /\/(galerie|gallery|photos|portfolio|realisations|projets|nos-projets)\b/i, tag: 'gallery' },
  { pattern: /\/(contact|contactez|nous-joindre|coordonnees|rejoindre)\b/i, tag: 'contact' },
];

// ── Extraction des liens internes ──────────────────────────────
function extractInternalLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const result = new Map(); // url -> tag
  const re = /href=["']([^"'#?]{3,100})["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = m[1];
      if (/\.(jpg|jpeg|png|gif|svg|pdf|css|js|xml|json|zip|mp4|webm|ico)(\?|$)/i.test(raw)) continue;
      const url = new URL(raw, baseUrl).href;
      if (!url.startsWith(origin)) continue;
      if (url === baseUrl || url === origin + '/') continue;
      for (const { pattern, tag } of KEY_PAGES) {
        if (pattern.test(url) && !result.has(url)) {
          result.set(url, tag);
          break;
        }
      }
    } catch(e) {}
  }
  return result;
}

// ── JSON-LD ────────────────────────────────────────────────────
function extractJsonLd(html) {
  const items = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        items.push(item);
        if (item['@graph']) items.push(...(Array.isArray(item['@graph']) ? item['@graph'] : [item['@graph']]));
      }
    } catch(e) {}
  }
  return items;
}

const BIZ_TYPE_RE = /LocalBusiness|Restaurant|FoodEstablishment|CafeOrCoffeeShop|Bar|AutoRepair|AutomotiveBusiness|BeautySalon|HairSalon|SpaOrHealthClub|MedicalBusiness|Physician|Dentist|Optician|GeneralContractor|HomeAndConstructionBusiness|HealthAndBeautyBusiness|Store|Organization|ProfessionalService/i;

function findLocalBiz(items) {
  return items.find(d => {
    const t = Array.isArray(d['@type']) ? d['@type'].join(',') : (d['@type'] || '');
    return BIZ_TYPE_RE.test(t);
  });
}

// ── Extraction de couleurs ─────────────────────────────────────
function isUsableColor(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const luma = (0.299*r + 0.587*g + 0.114*b) / 255;
  const sat  = Math.max(r,g,b) - Math.min(r,g,b);
  return luma > 0.08 && luma < 0.92 && (sat > 18 || (luma > 0.2 && luma < 0.8));
}

function extractColors(allHtml) {
  const scores = new Map();
  const add = (hex, w) => { const h = hex.toLowerCase(); if (isUsableColor(h)) scores.set(h, (scores.get(h)||0)+w); };

  // Priority 1 — named CSS variables et meta theme-color (poids 12)
  const hi = [
    /--(?:primary|brand|accent|couleur(?:-principale)?|main-color|color-primary|primary-color|color-brand)[^:;{]*:\s*(#[0-9a-fA-F]{6})/gi,
    /(?:theme-color["'][^>]*content|content=["'][^"']+["'][^>]*theme-color)=["'](#[0-9a-fA-F]{6})["']/gi,
  ];
  for (const re of hi) { let m; while ((m=re.exec(allHtml))!==null) add(m[1], 12); }

  // Priority 2 — boutons, liens, CTA (poids 8)
  const mid = [
    /\.btn(?:-primary)?[^{]*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/gi,
    /\.cta[^{]*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/gi,
    /a\s*\{[^}]*color\s*:\s*(#[0-9a-fA-F]{6})/gi,
    /--(?:secondary|link|nav|highlight|accent-color)[^:;]*:\s*(#[0-9a-fA-F]{6})/gi,
    /background-color\s*:\s*(#[0-9a-fA-F]{6})/gi,
  ];
  for (const re of mid) { let m; while ((m=re.exec(allHtml))!==null) add(m[1], 8); }

  // Priority 3 — toutes mentions brutes (poids 1)
  const rawRe = /#([0-9a-fA-F]{6})\b/g;
  let rm; while ((rm=rawRe.exec(allHtml))!==null) add('#'+rm[1], 1);

  return [...scores.entries()].sort((a,b)=>b[1]-a[1]).map(([h])=>h);
}

// ── Extraction Google Fonts ────────────────────────────────────
function extractGoogleFonts(html) {
  const fonts = [];
  const re = /fonts\.googleapis\.com\/css[^"'\s]*[?&]family=([^"'&\s]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const fams = decodeURIComponent(m[1]).split('|').map(f => f.split(':')[0].replace(/\+/g,' ').trim());
    fonts.push(...fams.filter(Boolean));
  }
  return [...new Set(fonts)];
}

// ── Extraction de photos avec contexte sémantique ─────────────
const ROLE_RE = {
  exterior: /ext[eé]rieur|fa[cç]ade|devanture|enseigne|storefront|outside|building|front|aerial|drone|vitrine|entr[eé]e|outside|magasin|boutique/i,
  interior: /int[eé]rieur|salle|dining|inside|ambiance|d[eé]cor|lobby|salon(?!-)|espace|atmosphere|d[eé]coration|hall|accueil(?!-btn)|r[eé]ception(?!-cta)/i,
  service:  /plat|food|dish|menu-|cuisine|assiette|service|atelier|soin|traitement|coupe|coiffure|chantier|projet|m[eé]cani|repair|travaux|r[eé]alisation|produit|intervention|voiture/i,
  about:    /[eé]quipe|team|staff|portrait|chef|propri[eé]taire|owner|personnel|fondateur|directeur|employ[eé]|person|nous$/i,
};

function scoreRoles(url, alt, pageTag) {
  const text = (url + ' ' + alt).toLowerCase();
  const rs = { exterior: 0, interior: 0, service: 0, about: 0 };
  for (const [role, re] of Object.entries(ROLE_RE)) {
    if (re.test(text)) rs[role] += 28;
  }
  // Boost based on page context
  if (pageTag === 'about')    { rs.about += 30; rs.interior += 5; }
  if (pageTag === 'services' || pageTag === 'menu') { rs.service += 30; }
  if (pageTag === 'gallery')  { rs.interior += 12; rs.service += 12; rs.exterior += 8; }
  if (pageTag === 'contact')  { rs.exterior += 15; }
  return rs;
}

const BAD_PHOTO_RE = /icon|logo|badge|pixel|1x1|sprite|favicon|btn[-_]|loading|placeholder|blank|spacer|arrow|thumb(?:nail)?-\d+x\d+|rating|star|map-pin|social|share|twitter|facebook|instagram|whatsapp|youtube/i;

function extractPhotosFromPage(html, baseUrl, pageTag) {
  const photos = [];
  const seen   = new Set();

  function normalise(src) {
    if (!src || src.startsWith('data:')) return '';
    try {
      return src.startsWith('//')  ? 'https:' + src
           : src.startsWith('/')   ? new URL(baseUrl).origin + src
           : src.startsWith('http')? src
           : new URL(src, baseUrl).href;
    } catch(e) { return ''; }
  }

  function add(rawSrc, alt, baseScore, isHero = false) {
    const url = normalise(rawSrc);
    if (!url || seen.has(url)) return;
    if (/\.(svg|gif|ico)(\?|$)/i.test(url)) return;
    if (BAD_PHOTO_RE.test(url + ' ' + alt)) return;
    seen.add(url);
    const rs = scoreRoles(url, alt, pageTag);
    if (isHero) { rs.exterior += 18; rs.interior += 8; }
    photos.push({ url, alt, baseScore, roleScores: rs, pageTag });
  }

  // og:image — photo principale choisie par le propriétaire
  const ogM = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogM) {
    const url = normalise(ogM[1]);
    if (url && !seen.has(url)) {
      seen.add(url);
      const rs = scoreRoles(url, 'og image', pageTag);
      rs.exterior += 25; rs.interior += 10;
      photos.push({ url, alt: 'og:image', baseScore: 55, roleScores: rs, pageTag, isOgImage: true });
    }
  }

  // img tags
  const imgRe = /<img[^>]+>/gi;
  let m; let pos = 0;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const wm = tag.match(/width=["']?(\d+)/i);
    if (wm && parseInt(wm[1]) < 160) continue;
    const hm = tag.match(/height=["']?(\d+)/i);
    if (hm && parseInt(hm[1]) < 100) continue;
    const alt = (tag.match(/alt=["']([^"']*)["']/i) || [])[1] || '';
    const isFirst = pos < 4; pos++;

    const lazyM  = tag.match(/data-(?:lazy-|original-|bg-)?src=["']([^"'#][^"']+)["']/i);
    const srsetM  = tag.match(/(?:data-)?srcset=["']([^"']+)["']/i);
    const srcM    = tag.match(/\ssrc=["']([^"'#][^"']+)["']/i);

    if (srsetM) {
      const cands = srsetM[1].split(',').map(s => s.trim().split(/\s+/));
      const best  = cands.sort((a,b)=>(parseInt(b[1])||0)-(parseInt(a[1])||0))[0];
      if (best && best[0]) add(best[0], alt, isFirst ? 28 : 16, isFirst);
    }
    if (lazyM) add(lazyM[1], alt, isFirst ? 28 : 16, isFirst);
    else if (srcM && !/data:image|blank|placeholder|spacer/i.test(srcM[1])) {
      add(srcM[1], alt, isFirst ? 28 : 16, isFirst);
    }
    if (photos.length >= 30) break;
  }

  // Images de fond CSS (background-image: url(...))
  const bgRe = /background(?:-image)?\s*:\s*url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp)(?:[?][^"')]*)?)\)/gi;
  while ((m = bgRe.exec(html)) !== null) {
    add(m[1], 'background', photos.length < 2 ? 26 : 18, photos.length === 0);
    if (photos.length >= 35) break;
  }

  // Video poster — choix du propriétaire, souvent la meilleure photo hero
  const vidRe = /<video[^>]+poster=["']([^"']+)["']/gi;
  while ((m = vidRe.exec(html)) !== null) {
    add(m[1], 'video poster', 50, true);
  }

  // Squarespace / Wix / Siteground image CDNs
  const cdnRe = /["'](https?:\/\/(?:static\d*\.squarespace|images\.squarespace|static\.wixstatic|ucarecdn|cdn\.prod\.website-files|i\.ibb|images\.prismic)[^"'\s)]+\.(?:jpe?g|png|webp)[^"'\s)]*)/gi;
  while ((m = cdnRe.exec(html)) !== null) {
    add(m[1], 'cdn', 20, false);
    if (photos.length >= 45) break;
  }

  return photos;
}

// ── Services avec descriptions ─────────────────────────────────
const NAV_SKIP = /contact|propos|accueil|bienvenue|horaire|heures|t[eé]moignage|avis|joindre|faq|blogue?|infolettre|politique|droits|r[eé]serv|suivez|abonn|carri[eè]re|emploi|nouvelle|actualit[eé]|home|about|login|register|panier|cart|compte|profil|connexion|inscription/i;

function extractServices(allHtml) {
  const services = [];
  // h2/h3 + optional following p/li as description
  const hRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>([\s\S]{0,600}?)(?=<h[123]|<section|<div\s+class|$)/gi;
  let m;
  while ((m = hRe.exec(allHtml)) !== null && services.length < 8) {
    const title = m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    if (title.length < 5 || title.length > 58) continue;
    if (NAV_SKIP.test(title)) continue;
    if (/^\d+[%€$]?$/.test(title)) continue;
    if (services.find(s => s.title.toLowerCase() === title.toLowerCase())) continue;

    // Description = first <p> or <li> after heading
    let desc = '';
    const afterBlock = m[2] || '';
    const pM = afterBlock.match(/<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/i);
    if (pM) {
      desc = pM[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      if (desc.length > 240) desc = desc.slice(0, 237) + '…';
    }
    services.push({ title, desc: desc || 'Un service de qualité, réalisé avec soin par notre équipe.' });
  }
  return services;
}

// ── Heures depuis JSON-LD ──────────────────────────────────────
function extractHours(biz) {
  if (!biz) return null;
  const hours = {};

  // Format: ["Mo-Fr 09:00-18:00", "Sa 09:00-14:00"]
  if (biz.openingHours) {
    const arr = Array.isArray(biz.openingHours) ? biz.openingHours : [biz.openingHours];
    for (const h of arr) {
      const time = h.replace(/^[A-Za-z,\s-]+\s+/, '').replace('-', ' — ');
      if (/Mo.*Fr/.test(h) || /Lun.*Ven/.test(h)) hours.weekdays = time;
      if (/\bSa\b/.test(h)) hours.saturday = time;
      if (/\bSu\b/.test(h)) hours.sunday = /Closed/i.test(h) ? 'Fermé' : time;
    }
  }

  // Format: openingHoursSpecification [{dayOfWeek, opens, closes}]
  if (biz.openingHoursSpecification) {
    const specs = Array.isArray(biz.openingHoursSpecification)
      ? biz.openingHoursSpecification : [biz.openingHoursSpecification];
    for (const spec of specs) {
      const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek || ''];
      const time = spec.opens && spec.closes
        ? `${String(spec.opens).slice(0,5)} — ${String(spec.closes).slice(0,5)}`
        : 'Sur rendez-vous';
      if (days.some(d => /Monday|Lundi|Monday/i.test(d))) hours.weekdays = time;
      if (days.some(d => /Saturday|Samedi/i.test(d))) hours.saturday = time;
      if (days.some(d => /Sunday|Dimanche/i.test(d))) hours.sunday = time;
    }
  }

  return Object.keys(hours).length >= 1 ? hours : null;
}

// ── Témoignages ────────────────────────────────────────────────
function extractTestimonials(html) {
  const testimonials = [];

  // JSON-LD Review schema
  const revRe = /"@type"\s*:\s*"Review"[\s\S]{0,600}?"reviewBody"\s*:\s*"([^"]{30,450})"/gi;
  let m;
  while ((m = revRe.exec(html)) !== null && testimonials.length < 5) {
    testimonials.push({ text: m[1].trim(), author: '— Client satisfait' });
  }

  // CSS class patterns (testimonial/review/avis blocks)
  if (testimonials.length < 2) {
    const blockRe = /class=["'][^"']*(?:review|testimonial|t[eé]moignage|avis|quote|citation)[^"']*["'][^>]*>([\s\S]{40,600}?)<\/(?:div|article|section|blockquote)>/gi;
    while ((m = blockRe.exec(html)) !== null && testimonials.length < 5) {
      const text = m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      if (text.length > 40 && text.length < 400) {
        testimonials.push({ text, author: '— Client satisfait' });
      }
    }
  }

  return testimonials;
}

// ── Téléchargement ─────────────────────────────────────────────
function downloadBuf(url, timeout = 9000) {
  const https_ = require('https'), http_ = require('http');
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https_ : http_;
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    let origin = '';
    try { origin = new URL(url).origin + '/'; } catch(e) {}
    const chunks = [];
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        'Accept-Language': 'fr-CA,fr;q=0.9',
        'Referer': origin,
      },
      timeout,
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location : new URL(res.headers.location, url).href;
        return resolve(downloadBuf(loc, timeout));
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.on('data', c => { chunks.push(c); if (Buffer.concat(chunks).length > 12_000_000) req.destroy(); });
      res.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      res.on('error', e => { clearTimeout(timer); reject(e); });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
    req.on('timeout', () => { clearTimeout(timer); req.destroy(); reject(new Error('timeout')); });
  });
}

function isValidImage(buf) {
  if (buf.length < 4096) return false;
  return (buf[0] === 0x89 && buf[1] === 0x50) ||       // PNG
         (buf[0] === 0xFF && buf[1] === 0xD8) ||        // JPEG
         buf.slice(0,4).toString('ascii') === 'RIFF' || // WEBP
         buf.slice(0,3).toString('ascii') === 'GIF';    // GIF
}

// ── Recherche principale ───────────────────────────────────────
/**
 * Crawl multi-pages, parse JSON-LD, extrait couleurs/services/photos/heures.
 * Ne télécharge PAS les images — retourne les URLs candidates.
 */
async function researchBrand(websiteUrl) {
  console.log(`[brand] → ${websiteUrl}`);

  // Home page
  let homeHtml, homeUrl, viaArchive;
  try {
    ({ html: homeHtml, effectiveUrl: homeUrl, viaArchive } = await fetchSiteHtml(websiteUrl));
  } catch(e) {
    console.warn(`[brand] fetch impossible: ${e.message}`);
    return null;
  }

  // Liens internes → pages clés
  const keyLinks = viaArchive ? new Map() : extractInternalLinks(homeHtml, homeUrl);

  // Fetch pages clés en parallèle (5s timeout chacune)
  const subResults = await Promise.allSettled(
    [...keyLinks.entries()].slice(0, 5).map(async ([url, tag]) => {
      try {
        const html = await fetchHtml(url, 5000);
        return { url, tag, html };
      } catch(e) { return null; }
    })
  );

  const pages = [
    { url: homeUrl, tag: 'home', html: homeHtml },
    ...subResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value),
  ];

  const allHtml = pages.map(p => p.html).join('\n<!-- PAGE -->\n');
  console.log(`[brand] ${pages.length} pages crawlées (${keyLinks.size} liens trouvés)`);

  // ── JSON-LD ──
  const allLd = [];
  for (const p of pages) allLd.push(...extractJsonLd(p.html));
  const biz = findLocalBiz(allLd);

  // ── Identité ──
  const name = (biz?.name || '').replace(/\s+/g,' ').trim();

  const descCandidates = [
    biz?.description,
    homeHtml.match(/name=["']description["'][^>]*content=["']([^"']{20,300})["']/i)?.[1],
    homeHtml.match(/content=["']([^"']{20,300})["'][^>]*name=["']description["']/i)?.[1],
    homeHtml.match(/property=["']og:description["'][^>]*content=["']([^"']{20,300})["']/i)?.[1],
    homeHtml.match(/content=["']([^"']{20,300})["'][^>]*property=["']og:description["']/i)?.[1],
  ].filter(Boolean);
  const description = (descCandidates[0] || '').replace(/\s+/g,' ').trim();

  // ── Couleurs ──
  const colors = extractColors(allHtml);

  // ── Fonts ──
  const fonts = extractGoogleFonts(allHtml);

  // ── Photos candidates (toutes pages) ──
  const allPhotos = [];
  const seenUrls = new Set();
  for (const p of pages) {
    for (const photo of extractPhotosFromPage(p.html, p.url, p.tag)) {
      if (!seenUrls.has(photo.url)) {
        seenUrls.add(photo.url);
        allPhotos.push(photo);
      }
    }
  }
  console.log(`[brand] ${allPhotos.length} photos candidates`);

  // ── Assignation sémantique ──
  const ROLES = ['exterior', 'interior', 'service', 'about'];
  const photoAssignment = {}; // role -> url[]  (ranked candidates)
  const usedForRole = new Set();

  for (const role of ROLES) {
    // Score each photo for this role, pick top 3 candidates
    const ranked = allPhotos
      .filter(p => !usedForRole.has(p.url))
      .map(p => ({ ...p, total: p.baseScore + (p.roleScores[role] || 0) }))
      .sort((a,b) => b.total - a.total);
    const candidates = ranked.slice(0, 4).map(p => p.url);
    if (candidates.length > 0) {
      photoAssignment[role] = candidates;
      usedForRole.add(candidates[0]); // reserve top pick
    }
  }

  // ── Services ──
  const services = extractServices(allHtml);

  // ── Témoignages ──
  const testimonials = extractTestimonials(allHtml);

  // ── Heures ──
  const hours = extractHours(biz);

  // ── Contact depuis JSON-LD ──
  const phone = (biz?.telephone || '').replace(/[^0-9+\-() .]/g,'').trim();
  let address = '';
  if (biz?.address) {
    const a = biz.address;
    address = typeof a === 'string' ? a
      : [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(', ');
  }

  // ── Rating ──
  const ratingVal = biz?.aggregateRating?.ratingValue;
  const rating = ratingVal ? `${parseFloat(ratingVal).toFixed(1)}★` : '';
  const reviewCount = String(biz?.aggregateRating?.reviewCount || '');

  // ── Fondation ──
  const foundingDate = biz?.foundingDate || '';
  const foundedMatch = allHtml.match(/(?:fond[eé]e?|[eé]tabli[e]?|depuis|en affaires depuis|established|since)\s*(?:en\s*)?((?:19|20)\d{2})/i);
  const founded = foundingDate.slice(0, 4) || (foundedMatch ? foundedMatch[1] : '');

  // ── Logo ──
  let logoUrl = '';
  if (biz?.logo) {
    logoUrl = typeof biz.logo === 'string' ? biz.logo : (biz.logo.url || biz.logo.contentUrl || '');
  }
  if (!logoUrl) {
    const logoTag = homeHtml.match(/<img[^>]+(?:src|class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/i);
    if (logoTag) {
      const sM = logoTag[0].match(/src=["']([^"']+)["']/i);
      if (sM) {
        try { logoUrl = new URL(sM[1], homeUrl).href; } catch(e) {}
      }
    }
  }
  if (!logoUrl) {
    const touchM = homeHtml.match(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
    if (touchM) {
      try { logoUrl = new URL(touchM[1], homeUrl).href; } catch(e) {}
    }
  }

  return {
    name, description,
    color: colors[0] || '',
    colors,
    fonts,
    photoAssignment,  // { exterior: [url1, url2, ...], ... }
    services,
    testimonials,
    hours, phone, address,
    rating, reviewCount,
    founded, logoUrl,
    pagesScraped: pages.length,
  };
}

// ── Téléchargement des photos assignées ───────────────────────
/**
 * Pour chaque rôle, essaie les candidates dans l'ordre jusqu'à succès.
 * Sauvegarde sous `${slug}-${role}.jpg` et `${slug}-logo.{png|svg}`.
 * Retourne { photos: { exterior: '/demo/...', ... }, saved: N }.
 */
async function downloadBrandPhotos(photoAssignment, logoUrl, slug, imagesDir) {
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const ROLES = ['exterior', 'interior', 'service', 'about'];
  const photos = {};
  let saved = 0;

  await Promise.allSettled(
    ROLES.map(async (role) => {
      const candidates = (photoAssignment && photoAssignment[role]) || [];
      for (const url of candidates) {
        try {
          const buf = await downloadBuf(url, 9000);
          if (!isValidImage(buf)) {
            console.warn(`[photos] ${role}: pas image valide (${url.slice(0,60)})`);
            continue;
          }
          const dest = path.join(imagesDir, `${slug}-${role}.jpg`);
          fs.writeFileSync(dest, buf);
          photos[role] = `/demo/images/${slug}-${role}.jpg`;
          saved++;
          console.log(`[photos] ✓ ${role} (${Math.round(buf.length/1024)}kb): ${url.slice(0,70)}`);
          return; // success
        } catch(e) {
          console.warn(`[photos] ✗ ${role}: ${e.message} (${url.slice(0,60)})`);
        }
      }
    })
  );

  // Logo
  if (logoUrl) {
    try {
      const buf = await downloadBuf(logoUrl, 9000);
      const isRaster = isValidImage(buf);
      const isSvg = buf.length > 80 && (buf.slice(0,5).toString().includes('<svg') || buf.slice(0,6).toString().includes('<?xml'));
      if (isRaster) {
        fs.writeFileSync(path.join(imagesDir, `${slug}-logo.png`), buf);
        console.log(`[photos] ✓ logo raster: ${logoUrl.slice(0,70)}`);
        saved++;
      } else if (isSvg) {
        fs.writeFileSync(path.join(imagesDir, `${slug}-logo.svg`), buf);
        console.log(`[photos] ✓ logo SVG: ${logoUrl.slice(0,70)}`);
        saved++;
      }
    } catch(e) {
      console.warn(`[photos] logo skip: ${e.message}`);
    }
  }

  return { photos, saved };
}

module.exports = { researchBrand, downloadBrandPhotos };
