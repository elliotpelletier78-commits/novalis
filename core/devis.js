'use strict';
// ── Novalis Devis — catalogue de services + assemblage de soumissions ─
// Le commerçant définit ses services/prix une fois ; Novalis assemble ensuite
// un devis propre, déposé dans la file d'approbation comme n'importe quelle
// proposition. Honnête : « sur devis » quand le prix n'est pas fixe, taxes en
// sus (jamais calculées à sa place), et c'est une SOUMISSION, pas une facture.

const propositions = require('./propositions');

function dollars(cents) {
  if (cents == null) return null;
  return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });
}

// ── Catalogue ────────────────────────────────────────────────────────
function listerServices(db, source) {
  try {
    return db.prepare('SELECT id, nom, prix_cents, unite, ordre FROM services WHERE source = ? AND actif = 1 ORDER BY ordre, id').all(source);
  } catch { return []; }
}

function ajouterService(db, source, { nom, prix_cents, unite } = {}) {
  const n = String(nom || '').trim().slice(0, 120);
  if (!n) throw new Error('nom de service requis');
  const prix = Number.isFinite(prix_cents) && prix_cents >= 0 ? Math.round(prix_cents) : null;
  const u = unite ? String(unite).trim().slice(0, 24) : null;
  const ordre = (db.prepare('SELECT COALESCE(MAX(ordre),0)+1 AS n FROM services WHERE source = ?').get(source) || {}).n || 0;
  const info = db.prepare('INSERT INTO services (source, nom, prix_cents, unite, ordre) VALUES (?,?,?,?,?)')
    .run(source, n, prix, u, ordre);
  return { id: info.lastInsertRowid };
}

function supprimerService(db, id) {
  return db.prepare('UPDATE services SET actif = 0 WHERE id = ?').run(id).changes === 1;
}

// ── Assemblage du devis ──────────────────────────────────────────────
/**
 * Construit le texte d'un devis à partir de lignes choisies. PUR et testable.
 * @param {{nomCommerce?:string, client?:string, date?:string,
 *          lignes:Array<{nom:string, prix_cents?:number|null, quantite?:number}>}} o
 * @returns {{texte:string, total_cents:number, tout_chiffre:boolean}}
 */
function construireDevis(o = {}) {
  const commerce = o.nomCommerce || 'Notre entreprise';
  const lignes = Array.isArray(o.lignes) ? o.lignes : [];
  let total = 0;
  let toutChiffre = true;
  const corps = lignes.map(l => {
    const q = Number.isFinite(l.quantite) && l.quantite > 0 ? l.quantite : 1;
    const nom = String(l.nom || 'Service').trim();
    if (l.prix_cents == null) {
      toutChiffre = false;
      return `• ${nom}${q > 1 ? ` × ${q}` : ''} — sur devis`;
    }
    const sousTotal = Math.round(l.prix_cents) * q;
    total += sousTotal;
    return `• ${nom}${q > 1 ? ` × ${q}` : ''} — ${dollars(sousTotal)}`;
  });

  const date = o.date || new Date().toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const t = [
    `Soumission — ${commerce}`,
    o.client ? `Pour : ${o.client}` : null,
    `Date : ${date}`,
    '',
    ...(corps.length ? corps : ['• (aucun service sélectionné)']),
    '',
    toutChiffre ? `Sous-total : ${dollars(total)}` : `Sous-total (postes chiffrés) : ${dollars(total)}`,
    'Taxes en sus (TPS/TVQ).',
    'Cette soumission est valide 30 jours. Les prix peuvent varier après une évaluation sur place.',
    '',
    commerce,
  ].filter(x => x !== null);

  return { texte: t.join('\n'), total_cents: total, tout_chiffre: toutChiffre };
}

/**
 * Crée une proposition « devis » dans la file d'approbation. Contrairement aux
 * réponses/avis, un devis n'est PAS idempotent par lead (on peut en préparer
 * plusieurs) : ref_id reste NULL.
 * @returns {{id:number}}
 */
function creerDevis(db, { source, client, destinataire, nomCommerce, lignes } = {}) {
  const d = construireDevis({ nomCommerce, client, lignes });
  const titre = `Devis pour ${client || 'un client'}`;
  const apercu = d.total_cents ? `Total ${dollars(d.total_cents)}${d.tout_chiffre ? '' : ' + postes sur devis'}` : 'Sur devis';
  const info = db.prepare(
    `INSERT INTO propositions (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite)
     VALUES (?, 'devis', 'devis', NULL, ?, ?, ?, ?, 7)`
  ).run(source, titre, apercu, d.texte, destinataire || null);
  return { id: info.lastInsertRowid };
}

// Sujet de courriel pour un devis (branché dans propositions.sujetPour via le serveur).
function sujetDevis(cfg = {}) {
  return cfg.nomCommerce ? `Votre soumission — ${cfg.nomCommerce}` : 'Votre soumission';
}

module.exports = {
  listerServices, ajouterService, supprimerService,
  construireDevis, creerDevis, sujetDevis, dollars,
  // ré-exporté pour cohérence des tests
  _propositions: propositions,
};
