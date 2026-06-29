'use strict';

/**
 * photo-search.js — Recherche automatique de photos parfaites par slot
 *
 * Sources (en ordre de priorité) :
 *   1. Unsplash API  (UNSPLASH_KEY env var)
 *   2. Pexels API    (PEXELS_KEY env var)
 *   3. Fallback URLs Unsplash hardcodées par slot/industrie
 *
 * Usage :
 *   const { findPhotosForBusiness } = require('./photo-search');
 *   const photos = await findPhotosForBusiness(businessContext);
 *   // photos = { facade: 'https://...', interieur: 'https://...', ... }
 */

const https = require('https');
const http  = require('http');

// ── Requêtes intelligentes par industrie × slot ───────────────────
const SLOT_QUERIES = {
  restaurant: {
    facade:    'restaurant exterior terrace summer white building waterfront',
    interieur: 'restaurant interior elegant dining window lake panoramic warm light',
    terrasse:  'outdoor restaurant terrace lake sunset wine friends summer',
    dome:      'dome geodesic restaurant winter cozy dining unique',
    mezze:     'mediterranean mezze sharing plates greek appetizers table',
    plat:      'mediterranean grilled food plate elegant restaurant dish',
    bar:       'cocktail bar restaurant evening warm light',
    salle:     'private dining room restaurant elegant table',
  },
  garage: {
    facade:    'auto repair shop exterior modern clean building',
    interieur: 'garage interior professional mechanic workshop',
    service:   'car mechanic professional working engine repair',
    equipe:    'mechanic team professional auto service',
    voiture:   'car service maintenance professional diagnostic',
    atelier:   'automotive workshop tools professional',
  },
  salon: {
    facade:    'hair salon beauty exterior modern storefront',
    interieur: 'hair salon interior elegant modern white',
    service:   'hairdresser styling professional salon luxury',
    equipe:    'hairstylist team salon professional',
    produits:  'hair care products luxury salon',
    coupe:     'haircut professional salon elegant styling',
  },
  clinique: {
    facade:    'medical clinic exterior modern professional building',
    interieur: 'medical clinic interior clean modern reception',
    service:   'doctor medical professional consultation',
    equipe:    'medical team doctors healthcare professional',
    soin:      'medical treatment care professional health',
    reception: 'clinic reception modern bright healthcare',
  },
  construction: {
    facade:    'construction company modern building commercial',
    chantier:  'construction site professional workers building',
    projet:    'finished building construction architectural modern',
    equipe:    'construction team workers professional safety',
    materiaux: 'construction materials quality professional',
    interieur: 'renovation interior modern finished professional',
  },
  spa: {
    facade:    'spa wellness center exterior modern luxurious',
    interieur: 'spa interior relaxing zen calm luxury',
    soin:      'spa treatment massage wellness luxury relaxing',
    piscine:   'pool spa wellness water relaxing luxury',
    equipe:    'spa therapist professional wellness team',
    produits:  'spa products luxury wellness organic',
  },
};

// Qualificateurs contextuels à injecter selon les données de l'entreprise
function buildQuery(industry, slot, context = {}) {
  const base = (SLOT_QUERIES[industry] || SLOT_QUERIES.restaurant)[slot]
            || SLOT_QUERIES.restaurant[slot]
            || `${industry} ${slot} professional`;

  const extras = [];
  if (context.lakeside || context.waterfront) extras.push('waterfront lake');
  if (context.mediterranean) extras.push('mediterranean');
  if (context.quebec) extras.push('canada');
  if (context.luxury) extras.push('luxury upscale');
  if (context.modern) extras.push('modern contemporary');

  return [base, ...extras].join(' ');
}

// ── Fetch JSON avec timeout ───────────────────────────────────────
function fetchJson(url, headers = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    const req = mod.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('JSON invalide')); }
      });
      res.on('error', e => { clearTimeout(timer); reject(e); });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

// ── Unsplash API ──────────────────────────────────────────────────
async function searchUnsplash(query, count = 3) {
  const key = process.env.UNSPLASH_KEY;
  if (!key) return [];
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`;
    const data = await fetchJson(url, {
      'Authorization': `Client-ID ${key}`,
      'Accept-Version': 'v1',
    });
    const results = data.results || [];
    return results.map(p => ({
      url:      p.urls?.regular?.replace('&w=1080', '&w=1920') || p.urls?.full,
      thumb:    p.urls?.small,
      credit:   `Photo by ${p.user?.name || 'Unsplash'} on Unsplash`,
      width:    p.width,
      height:   p.height,
      source:   'unsplash',
    })).filter(p => p.url);
  } catch(e) {
    console.warn('[photo-search] Unsplash:', e.message);
    return [];
  }
}

// ── Pexels API ───────────────────────────────────────────────────
async function searchPexels(query, count = 3) {
  const key = process.env.PEXELS_KEY;
  if (!key) return [];
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`;
    const data = await fetchJson(url, { 'Authorization': key });
    return (data.photos || []).map(p => ({
      url:    p.src?.large2x || p.src?.large,
      thumb:  p.src?.medium,
      credit: `Photo by ${p.photographer} on Pexels`,
      width:  p.width,
      height: p.height,
      source: 'pexels',
    })).filter(p => p.url);
  } catch(e) {
    console.warn('[photo-search] Pexels:', e.message);
    return [];
  }
}

// ── Fallback Unsplash curatés — par industrie × slot ─────────────
// URLs stables (photo ID), qualité garantie, sélection manuelle
const FALLBACK_URLS = {
  restaurant: {
    facade:    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=85&w=1920&auto=format&fit=crop',
    interieur: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=85&w=1920&auto=format&fit=crop',
    terrasse:  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=85&w=1920&auto=format&fit=crop',
    dome:      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=85&w=1920&auto=format&fit=crop',
    mezze:     'https://images.unsplash.com/photo-1544025162-811114cd354c?q=85&w=1920&auto=format&fit=crop',
    plat:      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?q=85&w=1920&auto=format&fit=crop',
  },
  // Restaurant méditerranéen/lac — photos plus précises
  restaurant_mediterranean: {
    facade:    'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=85&w=1920&auto=format&fit=crop',
    interieur: 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?q=85&w=1920&auto=format&fit=crop',
    terrasse:  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=85&w=1920&auto=format&fit=crop',
    dome:      'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?q=85&w=1920&auto=format&fit=crop',
    mezze:     'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=85&w=1920&auto=format&fit=crop',
    plat:      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=85&w=1920&auto=format&fit=crop',
  },
  garage: {
    facade:    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?q=85&w=1920&auto=format&fit=crop',
    interieur: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=85&w=1920&auto=format&fit=crop',
    service:   'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=85&w=1920&auto=format&fit=crop',
    equipe:    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=85&w=1920&auto=format&fit=crop',
    voiture:   'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?q=85&w=1920&auto=format&fit=crop',
    atelier:   'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=85&w=1920&auto=format&fit=crop',
  },
  salon: {
    facade:    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=85&w=1920&auto=format&fit=crop',
    interieur: 'https://images.unsplash.com/photo-1560066984-138daaa4e4e9?q=85&w=1920&auto=format&fit=crop',
    service:   'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=85&w=1920&auto=format&fit=crop',
    equipe:    'https://images.unsplash.com/photo-1559599101-f09722fb4948?q=85&w=1920&auto=format&fit=crop',
    produits:  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=85&w=1920&auto=format&fit=crop',
    coupe:     'https://images.unsplash.com/photo-1605497788044-5a32c7078486?q=85&w=1920&auto=format&fit=crop',
  },
  clinique: {
    facade:    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=85&w=1920&auto=format&fit=crop',
    interieur: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?q=85&w=1920&auto=format&fit=crop',
    service:   'https://images.unsplash.com/photo-1551190822-a9333d879b1f?q=85&w=1920&auto=format&fit=crop',
    equipe:    'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?q=85&w=1920&auto=format&fit=crop',
    soin:      'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?q=85&w=1920&auto=format&fit=crop',
    reception: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?q=85&w=1920&auto=format&fit=crop',
  },
  construction: {
    facade:    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=85&w=1920&auto=format&fit=crop',
    chantier:  'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=85&w=1920&auto=format&fit=crop',
    projet:    'https://images.unsplash.com/photo-1486325212027-8081e485255e?q=85&w=1920&auto=format&fit=crop',
    equipe:    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=85&w=1920&auto=format&fit=crop',
    materiaux: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=85&w=1920&auto=format&fit=crop',
    interieur: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?q=85&w=1920&auto=format&fit=crop',
  },
};

// ── Fonction principale ───────────────────────────────────────────
/**
 * Trouve les meilleures photos pour chaque slot d'une entreprise.
 *
 * @param {Object} businessContext
 *   industry  : 'restaurant' | 'garage' | 'salon' | 'clinique' | 'construction'
 *   slots     : string[]  — liste des slots voulus, ex: ['facade','interieur','terrasse']
 *   specialty : string[]  — mots-clés additionnels, ex: ['mediterranean','lakeside']
 *   name      : string    — nom de l'entreprise (pour les requêtes)
 *   location  : string    — ville/région
 * @returns {Promise<Object>} map slot → { url, credit, source }
 */
async function findPhotosForBusiness({ industry = 'restaurant', slots = [], specialty = [], name = '', location = '' } = {}) {
  const context = {
    lakeside:      /lac|lake|waterfront/i.test([...specialty, location].join(' ')),
    mediterranean: /m[eé]diterran[eé]|grec|greek|mezze/i.test([...specialty].join(' ')),
    luxury:        /luxe|luxury|premium|haut de gamme/i.test([...specialty].join(' ')),
    modern:        /moderne|modern|contemporain/i.test([...specialty].join(' ')),
    quebec:        true,
  };

  // Sous-type plus précis (ex: restaurant_mediterranean)
  const subtype = `${industry}_${specialty.join('_').toLowerCase().replace(/[^a-z_]/g,'')}`;
  const fallbacks = FALLBACK_URLS[subtype] || FALLBACK_URLS[industry] || FALLBACK_URLS.restaurant;

  const hasUnsplash = !!process.env.UNSPLASH_KEY;
  const hasPexels   = !!process.env.PEXELS_KEY;

  const results = {};

  await Promise.allSettled(slots.map(async (slot) => {
    const query = buildQuery(industry, slot, context);
    console.log(`[photo-search] ${slot} → "${query}" (unsplash=${hasUnsplash}, pexels=${hasPexels})`);

    let photos = [];

    // 1. Unsplash API
    if (hasUnsplash && photos.length === 0) {
      photos = await searchUnsplash(query, 3);
    }

    // 2. Pexels API
    if (hasPexels && photos.length === 0) {
      photos = await searchPexels(query, 3);
    }

    // 3. Fallback hardcodé
    if (photos.length === 0) {
      const url = fallbacks[slot] || Object.values(fallbacks)[0];
      if (url) photos = [{ url, credit: 'Unsplash', source: 'fallback' }];
    }

    if (photos.length > 0) {
      results[slot] = photos[0];
    }
  }));

  return results;
}

/**
 * Vérifie quelles API sont configurées
 */
function getApiStatus() {
  return {
    unsplash: !!process.env.UNSPLASH_KEY,
    pexels:   !!process.env.PEXELS_KEY,
    mode:     process.env.UNSPLASH_KEY ? 'api-search'
            : process.env.PEXELS_KEY   ? 'api-search-pexels'
            : 'fallback-curated',
  };
}

module.exports = { findPhotosForBusiness, searchUnsplash, searchPexels, buildQuery, getApiStatus, FALLBACK_URLS };
