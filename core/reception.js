'use strict';
// ── Novalis Réception — agrégation ───────────────────────────────────
// Transforme les contacts bruts (leads + taps) en ce que le commerçant doit
// voir : trois chiffres comptés (contacts, hors-heures, valeur captée), le
// délai de réponse (le tueur de conversion : répondre en < 1 h multiplie les
// chances de vente), et une tendance sur 30 jours. Le module ne fait que LIRE
// et calculer — aucune écriture ici.

const crypto = require('crypto');

// Valeur estimée d'un client capté, par secteur, en cents CAD. Défauts prudents,
// alignés sur la valeur d'un rendez-vous typique. Ajustable par site via
// reception_config.valeur_lead_cents.
const VALEUR_SECTEUR_CENTS = {
  garage: 35000, plombier: 40000, electricien: 35000, restaurant: 8000,
  salon: 12000, health: 18000, construction: 80000, fitness: 6000, defaut: 30000,
};

// Heures d'ouverture par défaut (fuseau America/Montreal) : lun-ven 8h-18h,
// sam 9h-13h, dimanche fermé. 0 = dimanche.
const HEURES_DEFAUT = { 0: null, 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18], 6: [9, 13] };

/** Heure locale (0-23) et jour de la semaine (0=dim) à Montréal, pour une date. */
function partiesMontreal(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montreal', hour: 'numeric', hour12: false, weekday: 'short',
  }).formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24; // '24' → 0 sur vieux Node
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[parts.find(p => p.type === 'weekday').value];
  return { hour, wd };
}

/** Un contact reçu à cette date est-il HORS des heures d'ouverture ? */
function estHorsHeures(d, heures) {
  const table = heures || HEURES_DEFAUT;
  const { hour, wd } = partiesMontreal(d);
  const plage = table[wd] ?? table[String(wd)];
  if (!plage) return true;               // fermé ce jour-là
  return hour < plage[0] || hour >= plage[1];
}

/** Parse un horodatage SQLite (« YYYY-MM-DD HH:MM:SS » UTC) en Date. */
function dateSqlite(s) {
  if (!s) return null;
  const ms = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Jeton d'accès au rapport mensuel : HMAC(source) tronqué. URL non devinable,
 *  aucun compte à créer — le commerçant clique le lien qu'on lui envoie. */
function jetonRapport(source, masterKey) {
  return crypto.createHmac('sha256', String(masterKey || 'sel-reception'))
    .update('rapport:' + String(source)).digest('hex').slice(0, 24);
}
function jetonValide(source, jeton, masterKey) {
  const attendu = jetonRapport(source, masterKey);
  const a = Buffer.from(attendu), b = Buffer.from(String(jeton || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function configDe(db, source) {
  let row = null;
  try { row = db.prepare('SELECT * FROM reception_config WHERE source = ?').get(source); } catch { /* table jeune */ }
  const secteur = row?.secteur || null;
  const valeurLead = row?.valeur_lead_cents
    || VALEUR_SECTEUR_CENTS[secteur] || VALEUR_SECTEUR_CENTS.defaut;
  let heures = null;
  if (row?.heures_json) { try { heures = JSON.parse(row.heures_json); } catch { /* ignore */ } }
  return {
    source, secteur,
    valeurLeadCents: valeurLead,
    heures,
    nomCommerce: row?.nom_commerce || null,
  };
}

/**
 * Aperçu complet pour le cockpit d'un site, sur une fenêtre glissante.
 * @param {import('better-sqlite3').Database} db
 * @param {string} source
 * @param {{jours?:number}} [opts]
 */
function apercu(db, source, opts = {}) {
  const jours = opts.jours || 30;
  const cfg = configDe(db, source);
  const depuis = `datetime('now','-${parseInt(jours, 10)} days')`;

  const leads = db.prepare(
    `SELECT id, nom, courriel, entreprise, message, statut, valeur_cents, hors_heures,
        created_at, repondu_le
     FROM leads WHERE source = ? AND created_at >= ${depuis}
     ORDER BY created_at DESC`).all(source);

  let taps = [];
  try {
    taps = db.prepare(
      `SELECT canal, hors_heures, created_at, cree_le FROM
         (SELECT canal, hors_heures, cree_le AS created_at, cree_le FROM taps
          WHERE source = ? AND cree_le >= ${depuis})`).all(source);
  } catch { taps = []; }

  // Trois chiffres comptés (fenêtre entière).
  const contacts = leads.length + taps.length;
  const horsHeures = leads.filter(l => l.hors_heures).length + taps.filter(t => t.hors_heures).length;
  const valeurCaptee = leads.reduce((s, l) => s + (l.valeur_cents || cfg.valeurLeadCents), 0);

  // Délai de réponse : sur les leads répondus, minutes médianes + % sous 1 h.
  const delais = leads.filter(l => l.repondu_le && l.created_at)
    .map(l => {
      const a = dateSqlite(l.created_at), b = dateSqlite(l.repondu_le);
      return (a && b) ? Math.max(0, (b - a) / 60000) : null;
    }).filter(x => x !== null).sort((x, y) => x - y);
  const repondus = delais.length;
  const enAttente = leads.filter(l => l.statut === 'nouveau').length;
  const medianeMin = repondus ? delais[Math.floor((repondus - 1) / 2)] : null;
  const sousUneHeure = repondus ? Math.round(100 * delais.filter(d => d <= 60).length / repondus) : null;

  // Tendance sur `jours` : contacts par jour (leads + taps).
  const parJour = new Map();
  const clef = (s) => (String(s).slice(0, 10));
  for (const l of leads) parJour.set(clef(l.created_at), (parJour.get(clef(l.created_at)) || 0) + 1);
  for (const t of taps) parJour.set(clef(t.created_at), (parJour.get(clef(t.created_at)) || 0) + 1);
  const tendance = [];
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    tendance.push({ jour: d, n: parJour.get(d) || 0 });
  }

  return {
    source,
    config: cfg,
    fenetre_jours: jours,
    compteurs: {
      contacts,
      leads: leads.length,
      taps: taps.length,
      hors_heures: horsHeures,
      valeur_captee_cents: valeurCaptee,
      en_attente: enAttente,
    },
    reponse: { repondus, mediane_minutes: medianeMin, pct_sous_1h: sousUneHeure },
    tendance,
    leads_recents: leads.slice(0, 25),
  };
}

/**
 * Rapport mensuel destiné au commerçant — les trois nombres comptés du mois.
 * @param {string} [moisISO] 'YYYY-MM' ; défaut = mois courant.
 */
function rapportMensuel(db, source, moisISO) {
  const cfg = configDe(db, source);
  const mois = /^\d{4}-\d{2}$/.test(moisISO || '') ? moisISO : new Date().toISOString().slice(0, 7);
  const debut = `${mois}-01 00:00:00`;
  const finExcl = `date('${mois}-01','+1 month')`;

  const leads = db.prepare(
    `SELECT hors_heures, valeur_cents, created_at, repondu_le, statut
     FROM leads WHERE source = ? AND created_at >= ? AND created_at < ${finExcl}`).all(source, debut);
  let taps = [];
  try {
    taps = db.prepare(
      `SELECT hors_heures FROM taps WHERE source = ? AND cree_le >= ? AND cree_le < ${finExcl}`).all(source, debut);
  } catch { taps = []; }

  const contacts = leads.length + taps.length;
  const horsHeures = leads.filter(l => l.hors_heures).length + taps.filter(t => t.hors_heures).length;
  const valeur = leads.reduce((s, l) => s + (l.valeur_cents || cfg.valeurLeadCents), 0);
  const gagnes = leads.filter(l => l.statut === 'gagne').length;

  return {
    source, mois, nom_commerce: cfg.nomCommerce,
    contacts, formulaires: leads.length, clics: taps.length,
    hors_heures: horsHeures, valeur_captee_cents: valeur, clients_gagnes: gagnes,
  };
}

module.exports = {
  apercu, rapportMensuel, configDe,
  estHorsHeures, jetonRapport, jetonValide,
  VALEUR_SECTEUR_CENTS, HEURES_DEFAUT,
};
