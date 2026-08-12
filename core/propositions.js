'use strict';
// ── Novalis Propositions — le poste de commande d'approbation ────────
// Chaque pilote PRÉPARE une proposition (une action rédigée d'avance) ; le
// commerçant l'approuve, la modifie ou la rejette. Rien ne part sans son oui.
// Ce module : rédige le brouillon (testable, déterministe pour l'instant —
// remplaçable par un appel LLM plus tard), gère la file, et exécute l'envoi
// une fois approuvé (via un mailer fail-safe).

const HEURES_LABEL = 'pendant nos heures d\'ouverture';

/** Prénom depuis un nom complet, pour une salutation naturelle. */
function prenom(nom) {
  const p = String(nom || '').trim().split(/\s+/)[0];
  return p && p.length >= 2 ? p : null;
}

/** Thème du message (une accroche courte) pour personnaliser la réponse. */
function accroche(message) {
  const m = String(message || '').trim().replace(/\s+/g, ' ');
  if (!m) return null;
  const court = m.length > 90 ? m.slice(0, 88).replace(/\s\S*$/, '') + '…' : m;
  return court;
}

/**
 * Rédige le brouillon de réponse à un nouveau message. Déterministe et honnête :
 * accuse réception, promet un rappel humain, signe au nom du commerce. Aucun
 * engagement inventé (prix, délai précis) — Novalis ne promet que ce qui est vrai.
 * @param {{nom?:string, message?:string, courriel?:string}} lead
 * @param {{nomCommerce?:string, telephone?:string, horsHeures?:boolean}} cfg
 * @returns {string}
 */
function brouillonReponse(lead, cfg = {}) {
  const commerce = cfg.nomCommerce || 'notre équipe';
  const pn = prenom(lead.nom);
  const salut = pn ? `Bonjour ${pn},` : 'Bonjour,';
  const suj = accroche(lead.message);
  const lignes = [
    salut,
    '',
    `Merci d'avoir écrit à ${commerce} — nous avons bien reçu votre message` +
      (suj ? ` au sujet de « ${suj} ».` : '.'),
    cfg.horsHeures
      ? `Votre message nous est parvenu en dehors de nos heures d'ouverture ; une personne de l'équipe vous revient dès la réouverture.`
      : `Une personne de l'équipe vous revient sous peu, ${HEURES_LABEL}.`,
  ];
  if (cfg.telephone) {
    lignes.push('', `Pour une demande urgente, vous pouvez nous joindre au ${cfg.telephone}.`);
  }
  lignes.push('', 'Au plaisir,', commerce);
  return lignes.join('\n');
}

/** Sujet du courriel de réponse. */
function sujetReponse(cfg = {}) {
  const commerce = cfg.nomCommerce || 'Nous avons bien reçu votre message';
  return cfg.nomCommerce ? `${commerce} — nous avons bien reçu votre message` : commerce;
}

/**
 * Rédige la demande d'avis à un client satisfait (job gagné). Chaleureux,
 * jamais insistant, avec le lien d'avis s'il est connu — sinon une invitation
 * simple. Ne promet ni cadeau ni incitatif (les avis achetés sont interdits et
 * malhonnêtes).
 * @param {{nom?:string}} lead
 * @param {{nomCommerce?:string, lienAvis?:string}} cfg
 */
function brouillonAvis(lead, cfg = {}) {
  const commerce = cfg.nomCommerce || 'notre équipe';
  const pn = prenom(lead.nom);
  const salut = pn ? `Bonjour ${pn},` : 'Bonjour,';
  const lignes = [
    salut,
    '',
    `Merci encore de votre confiance envers ${commerce}. Ce fut un plaisir de vous servir.`,
    cfg.lienAvis
      ? `Si vous avez deux minutes, un mot sur votre expérience aiderait beaucoup d'autres personnes du quartier à nous découvrir : ${cfg.lienAvis}`
      : `Si vous avez deux minutes, un mot sur votre expérience — un avis Google — aiderait beaucoup d'autres personnes du quartier à nous découvrir.`,
    '',
    'Merci sincèrement,',
    commerce,
  ];
  return lignes.join('\n');
}

/** Sujet du courriel selon le type de proposition. */
function sujetPour(type, cfg = {}) {
  if (type === 'avis') {
    return cfg.nomCommerce ? `Merci de votre confiance — ${cfg.nomCommerce}` : 'Merci de votre confiance';
  }
  if (type === 'devis') {
    return cfg.nomCommerce ? `Votre soumission — ${cfg.nomCommerce}` : 'Votre soumission';
  }
  if (type === 'rappel') {
    return cfg.nomCommerce ? `Rappel de votre rendez-vous — ${cfg.nomCommerce}` : 'Rappel de votre rendez-vous';
  }
  if (type === 'relance') {
    return cfg.nomCommerce ? `On revient vers vous — ${cfg.nomCommerce}` : 'On revient vers vous';
  }
  return sujetReponse(cfg);
}

/**
 * Rédige une relance douce pour un client resté silencieux. Jamais insistant,
 * jamais culpabilisant : on s'assure simplement de ne pas l'avoir manqué.
 * @param {{nom?:string, message?:string}} lead
 * @param {{nomCommerce?:string, telephone?:string}} cfg
 */
function brouillonRelance(lead, cfg = {}) {
  const commerce = cfg.nomCommerce || 'notre équipe';
  const pn = prenom(lead.nom);
  const salut = pn ? `Bonjour ${pn},` : 'Bonjour,';
  const suj = accroche(lead.message);
  const lignes = [
    salut,
    '',
    `On revient vers vous au sujet de votre demande${suj ? ` « ${suj} »` : ''}. On voulait simplement s'assurer de ne pas l'avoir manquée.`,
    `Si c'est encore d'actualité, ce serait un plaisir de vous aider — répondez à ce courriel et on s'en occupe.`,
  ];
  if (cfg.telephone) lignes.push('', `Ou joignez-nous directement au ${cfg.telephone}.`);
  lignes.push('', 'Au plaisir,', commerce);
  return lignes.join('\n');
}

/** Crée (idempotent) une relance pour un lead. Une seule relance par lead. */
function creerRelancePourLead(db, lead, cfg = {}) {
  if (!lead || !lead.id || !lead.source) return null;
  const brouillon = brouillonRelance(lead, cfg);
  const titre = `Relancer ${lead.nom || 'un client'}`;
  const apercu = accroche(lead.message) || 'Client resté silencieux';
  const info = db.prepare(
    `INSERT OR IGNORE INTO propositions
       (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite)
     VALUES (?, 'relance', 'lead', ?, ?, ?, ?, ?, 4)`
  ).run(lead.source, lead.id, titre, apercu, brouillon, lead.courriel || null);
  return info.changes ? { id: info.lastInsertRowid } : null;
}

/**
 * Balaye les leads devenus silencieux et prépare une relance pour chacun.
 * « Silencieux » = encore ouvert (nouveau/contacté), reçu il y a plus de `jours`,
 * jamais gagné/perdu. Idempotent : un lead déjà relancé est ignoré. À appeler
 * paresseusement (à l'ouverture du poste de commande) — aucune tâche planifiée.
 * @returns {number} nombre de relances créées ce passage
 */
function preparerRelances(db, source, opts = {}) {
  const jours = Math.max(1, parseInt(opts.jours, 10) || 3);
  const cfg = opts.cfg || {};
  let leads;
  try {
    leads = db.prepare(
      `SELECT id, source, nom, courriel, message FROM leads
       WHERE source = ? AND statut IN ('nouveau','contacte')
         AND created_at < datetime('now', ?)`).all(source, `-${jours} days`);
  } catch { return 0; }
  let n = 0;
  for (const l of leads) { if (creerRelancePourLead(db, l, cfg)) n++; }
  return n;
}

/**
 * Crée (idempotent) une demande d'avis pour un lead gagné. À appeler quand le
 * lead passe à « gagné », SI l'entreprise a consenti à ce que Novalis rédige.
 */
function creerAvisPourLead(db, lead, cfg = {}) {
  if (!lead || !lead.id || !lead.source) return null;
  const brouillon = brouillonAvis(lead, cfg);
  const titre = `Demander un avis à ${lead.nom || 'un client'}`;
  const info = db.prepare(
    `INSERT OR IGNORE INTO propositions
       (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite)
     VALUES (?, 'avis', 'lead', ?, ?, ?, ?, ?, 3)`
  ).run(lead.source, lead.id, titre, 'Client satisfait — job gagné', brouillon, lead.courriel || null);
  return info.changes ? { id: info.lastInsertRowid } : null;
}

/**
 * Accusé de réception INSTANTANÉ, sûr à envoyer sans approbation : il confirme
 * seulement la réception et n'engage RIEN (aucun prix, aucun délai chiffré, aucune
 * promesse). C'est ce qui évite de perdre un client faute de réponse rapide.
 * @param {{nom?:string}} lead
 * @param {{nomCommerce?:string, telephone?:string}} cfg
 */
function accuseReception(lead, cfg = {}) {
  const commerce = cfg.nomCommerce || 'notre équipe';
  const pn = prenom(lead.nom);
  const salut = pn ? `Bonjour ${pn},` : 'Bonjour,';
  const lignes = [
    salut,
    '',
    `Merci d'avoir écrit à ${commerce} — votre message est bien arrivé.`,
    `Une personne de l'équipe vous revient très bientôt.`,
  ];
  if (cfg.telephone) lignes.push('', `Pour une demande urgente, vous pouvez nous joindre au ${cfg.telephone}.`);
  lignes.push('', commerce);
  return lignes.join('\n');
}
function sujetAccuse(cfg = {}) {
  return cfg.nomCommerce ? `Bien reçu — ${cfg.nomCommerce}` : 'Votre message est bien reçu';
}

/**
 * Crée (idempotent) une proposition de réponse pour un lead. À appeler juste
 * après l'insertion du lead, SI l'entreprise a consenti à ce que Novalis rédige.
 * @returns {{id:number}|null} null si déjà créée ou entrée invalide
 */
function creerReponsePourLead(db, lead, cfg = {}) {
  if (!lead || !lead.id || !lead.source) return null;
  const brouillon = brouillonReponse(lead, cfg);
  const titre = `Répondre à ${lead.nom || 'un client'}`;
  const apercu = accroche(lead.message) || '(sans message)';
  // hors_heures = plus prioritaire (un client hors heures attend, et se refroidit).
  const priorite = cfg.horsHeures ? 10 : 5;
  const info = db.prepare(
    `INSERT OR IGNORE INTO propositions
       (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite)
     VALUES (?, 'reponse', 'lead', ?, ?, ?, ?, ?, ?)`
  ).run(lead.source, lead.id, titre, apercu, brouillon, lead.courriel || null, priorite);
  return info.changes ? { id: info.lastInsertRowid } : null;
}

/** File d'approbation d'une entreprise. Par défaut : ce qui attend un oui. */
function lister(db, source, opts = {}) {
  const statut = ['en_attente', 'approuve', 'rejete', 'envoye', 'echec'].includes(opts.statut) ? opts.statut : 'en_attente';
  const limite = Math.min(parseInt(opts.limite, 10) || 50, 200);
  let rows;
  try {
    rows = db.prepare(
      `SELECT * FROM propositions WHERE source = ? AND statut = ?
       ORDER BY priorite DESC, id DESC LIMIT ?`).all(source, statut, limite);
  } catch { rows = []; }
  return rows;
}

/** Compteurs pour l'en-tête du poste de commande. */
function compteurs(db, source) {
  try {
    const r = db.prepare(
      `SELECT
         COALESCE(SUM(statut='en_attente'),0) AS en_attente,
         COALESCE(SUM(statut='approuve'),0)   AS approuve,
         COALESCE(SUM(statut='envoye'),0)     AS envoye,
         COALESCE(SUM(statut='rejete'),0)     AS rejete
       FROM propositions WHERE source = ?`).get(source);
    return { en_attente: r.en_attente, approuve: r.approuve, envoye: r.envoye, rejete: r.rejete };
  } catch { return { en_attente: 0, approuve: 0, envoye: 0, rejete: 0 }; }
}

function get(db, id) {
  try { return db.prepare('SELECT * FROM propositions WHERE id = ?').get(id) || null; } catch { return null; }
}

/** Modifier le brouillon (reste en attente). */
function modifier(db, id, brouillon) {
  const p = get(db, id);
  if (!p || p.statut !== 'en_attente') return { ok: false, raison: 'proposition non modifiable' };
  db.prepare(`UPDATE propositions SET brouillon = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(String(brouillon || '').slice(0, 8000), id);
  return { ok: true };
}

function rejeter(db, id) {
  const p = get(db, id);
  if (!p || p.statut !== 'en_attente') return { ok: false, raison: 'déjà traitée' };
  db.prepare(`UPDATE propositions SET statut='rejete', traite_le=datetime('now'), maj_le=datetime('now') WHERE id=?`).run(id);
  return { ok: true };
}

/**
 * Approuver une proposition. Si l'envoi est possible (consentement + destinataire
 * + mailer configuré), on exécute l'action tout de suite et on marque « envoye ».
 * Sinon, on marque « approuve » (le commerçant enverra/copiera à la main) — jamais
 * de faux « envoyé ».
 * @param {{peutEnvoyer:boolean, mailer?:object, from?:string, replyTo?:string, sujet?:string}} ctx
 */
async function approuver(db, id, ctx = {}) {
  const p = get(db, id);
  if (!p || p.statut !== 'en_attente') return { ok: false, raison: 'déjà traitée' };

  if (ctx.peutEnvoyer && p.destinataire && ctx.mailer && ctx.mailer.configured) {
    const r = await ctx.mailer.envoyer({
      to: p.destinataire,
      subject: ctx.sujet || p.titre,
      text: p.brouillon,
      from: ctx.from,
      replyTo: ctx.replyTo,
    });
    if (r.sent) {
      db.prepare(`UPDATE propositions SET statut='envoye', traite_le=datetime('now'), maj_le=datetime('now'), detail=NULL WHERE id=?`).run(id);
      return { ok: true, envoye: true };
    }
    db.prepare(`UPDATE propositions SET statut='echec', detail=?, maj_le=datetime('now') WHERE id=?`)
      .run(String(r.reason || 'envoi refusé').slice(0, 300), id);
    return { ok: false, raison: r.reason || 'envoi refusé', echec: true };
  }

  // Approuvé sans envoi automatique (courriel non branché, ou pas de consentement).
  const note = !p.destinataire ? 'aucun destinataire'
    : !ctx.peutEnvoyer ? 'envoi non autorisé — à envoyer à la main'
      : 'courriel non branché — à envoyer à la main';
  db.prepare(`UPDATE propositions SET statut='approuve', traite_le=datetime('now'), maj_le=datetime('now'), detail=? WHERE id=?`).run(note, id);
  return { ok: true, envoye: false, note };
}

module.exports = {
  brouillonReponse, brouillonAvis, brouillonRelance, accuseReception, sujetAccuse,
  sujetReponse, sujetPour,
  creerReponsePourLead, creerAvisPourLead, creerRelancePourLead, preparerRelances,
  lister, compteurs, get, modifier, rejeter, approuver,
  _prenom: prenom, _accroche: accroche,
};
