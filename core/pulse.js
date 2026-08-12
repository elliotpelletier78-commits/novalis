'use strict';
// ── Novalis Pulse — entonnoir de conversion + diagnostic ─────────────
// Transforme des événements anonymes en la seule chose qui compte pour un
// commerçant : OÙ ses visiteurs décrochent, et quoi changer. Deterministe,
// honnête (pas de diagnostic confiant sous un seuil de données), sans PII.
// Le module ne fait que LIRE et calculer.

const crypto = require('crypto');

// En dessous de ce nombre de visiteurs, l'entonnoir est du bruit : on le dit
// franchement au lieu d'inventer un diagnostic.
const SEUIL_FIABLE = 25;

// Sections qui signalent que le visiteur a vu l'offre (par nom, tolérant).
const SECTION_OFFRE = /service|tarif|prix|forfait|contact|rendez|reserv|menu/i;

/**
 * Construit l'entonnoir + le point de fuite à partir d'événements bruts.
 * Fonction PURE (testable sans base).
 * @param {Array<{type:string, etiquette?:string, session_hash:string}>} evenements
 */
function construireEntonnoir(evenements) {
  const parSession = new Map();
  for (const e of evenements) {
    if (!e || !e.session_hash) continue;
    if (!parSession.has(e.session_hash)) parSession.set(e.session_hash, { types: new Set(), sections: new Set(), profMax: 0 });
    const s = parSession.get(e.session_hash);
    s.types.add(e.type);
    if (e.type === 'section' && e.etiquette) s.sections.add(String(e.etiquette).toLowerCase());
    if (e.type === 'profondeur') { const p = parseInt(e.etiquette, 10); if (Number.isFinite(p) && p > s.profMax) s.profMax = p; }
  }
  const sessions = [...parSession.values()];
  const V = sessions.length;

  // Étape la plus profonde ATTEINTE par chaque session. Un entonnoir est
  // cumulatif : qui a contacté a forcément traversé les étapes d'avant. On
  // calcule donc le niveau max atteint, puis chaque palier compte les sessions
  // qui l'ont atteint OU dépassé — c'est monotone par construction, et ça ne
  // sous-compte pas le visiteur qui appelle depuis l'en-tête sans défiler.
  function niveau(s) {
    if (s.types.has('form_submit') || s.types.has('tel')) return 4; // vous ont contacté
    if (s.types.has('form_start') || s.types.has('cta')) return 3;  // ont amorcé un contact
    if (s.profMax >= 75 || [...s.sections].some(x => SECTION_OFFRE.test(x))) return 2; // ont vu l'offre
    if (s.profMax >= 50 || s.sections.size >= 2) return 1;          // ont exploré
    return 0;                                                        // simple visite
  }
  const niveaux = sessions.map(niveau);
  const brut = [0, 1, 2, 3, 4].map(k => k === 0 ? V : niveaux.filter(n => n >= k).length);

  const noms = ['Visiteurs', 'Ont exploré le site', 'Ont vu vos services / prix', 'Ont amorcé un contact', 'Vous ont contacté'];
  const etapes = brut.map((n, i) => ({ etape: noms[i], sessions: n, pct: V ? Math.round(100 * n / V) : 0 }));

  // Point de fuite = plus forte chute proportionnelle entre deux étapes.
  let fuite = null;
  if (V >= SEUIL_FIABLE) {
    let pireI = -1, pirePerte = -1;
    for (let i = 1; i < brut.length; i++) {
      const avant = brut[i - 1];
      if (avant <= 0) continue;
      const perte = (avant - brut[i]) / avant;
      if (perte > pirePerte) { pirePerte = perte; pireI = i; }
    }
    if (pireI > 0) fuite = { ...DIAGNOSTIC[pireI], entre: `${noms[pireI - 1]} → ${noms[pireI]}`, perte_pct: Math.round(pirePerte * 100) };
  }

  return {
    visiteurs: V,
    fiable: V >= SEUIL_FIABLE,
    entonnoir: etapes,
    conversion_pct: V ? Math.round(100 * brut[4] / V) : 0,
    fuite,
  };
}

// Diagnostic + levier concret selon l'étape où survient la plus grosse fuite.
// Écrit pour un commerçant, pas pour un marketeur.
const DIAGNOSTIC = {
  1: {
    titre: 'La première impression ne retient pas',
    diagnostic: 'La plupart de vos visiteurs quittent dès le haut de page, avant même de voir ce que vous faites.',
    levier: 'Une photo d\'accroche forte — la vôtre, pas une image de banque — et un titre qui dit en une ligne ce que vous faites et où.',
  },
  2: {
    titre: 'Ils explorent mais n\'atteignent pas votre offre',
    diagnostic: 'Vos visiteurs descendent un peu, puis abandonnent avant d\'arriver à vos services et vos prix.',
    levier: 'Remonter vos services et vos prix plus haut sur la page, et raccourcir ce qui les précède.',
  },
  3: {
    titre: 'Ils voient l\'offre mais ne font pas le premier pas',
    diagnostic: 'Beaucoup voient vos services et vos prix, mais ne cliquent ni pour appeler ni pour écrire.',
    levier: 'Un appel à l\'action plus clair et plus visible, répété juste à côté des prix (« Appeler » et « Écrire »).',
  },
  4: {
    titre: 'Ils commencent à vous écrire mais n\'envoient pas',
    diagnostic: 'Des visiteurs amorcent le formulaire puis l\'abandonnent avant d\'envoyer.',
    levier: 'Un formulaire plus court et rassurant : moins de champs, et une phrase qui promet une réponse rapide.',
  },
};

function saltHash(v, sel) {
  return crypto.createHash('sha256').update(String(v) + '|' + String(sel || 'sel-pulse')).digest('hex').slice(0, 20);
}

/** Aperçu Pulse pour un site sur une fenêtre glissante. */
function apercu(db, source, opts = {}) {
  const jours = parseInt(opts.jours, 10) || 30;
  let ev;
  try {
    ev = db.prepare(
      `SELECT type, etiquette, session_hash FROM pulse_events
       WHERE source = ? AND created_at >= datetime('now','-${jours} days')`).all(source);
  } catch { ev = []; }
  return { source, fenetre_jours: jours, ...construireEntonnoir(ev) };
}

module.exports = { construireEntonnoir, apercu, saltHash, SEUIL_FIABLE };
