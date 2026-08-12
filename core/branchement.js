'use strict';
// ── Novalis Branchement — remettre les clés de son entreprise ────────
// « Donner son entreprise à Novalis » = brancher son identité, son site, ses
// accès (dans le coffre chiffré) et donner ses consentements. Ce module écrit
// l'état du branchement et le CALCULE (progression, prêt-à-opérer) — les
// secrets, eux, ne transitent jamais par ici : ils vont dans core/secrets.js.

// Catalogue des « clés » qu'une entreprise peut remettre. `dispo` distingue ce
// qui se branche aujourd'hui de ce qui arrive (connexion guidée à venir), pour
// ne JAMAIS promettre une intégration qu'on ne peut pas encore tenir.
const CONNEXIONS = [
  {
    type: 'courriel', titre: 'Courriel du commerce', dispo: true, requis: true,
    role: 'Recevoir les messages et répondre en votre nom (après votre oui).',
  },
  {
    type: 'google', titre: 'Fiche Google & avis', dispo: true, requis: false,
    role: 'Tenir la fiche à jour et demander des avis aux bons clients.',
  },
  {
    type: 'telephonie', titre: 'Téléphone / textos', dispo: false, requis: false,
    role: 'Répondre aux appels manqués par texto, envoyer des rappels.',
  },
  {
    type: 'facturation', titre: 'Facturation', dispo: false, requis: false,
    role: 'Préparer devis et factures à partir de vos jobs.',
  },
  {
    type: 'reseaux', titre: 'Réseaux sociaux', dispo: false, requis: false,
    role: 'Préparer les publications, prêtes à approuver.',
  },
];
const TYPES = new Set(CONNEXIONS.map(c => c.type));

const CONSENTEMENTS = [
  { cle: 'rediger', titre: 'Rédiger pour moi', role: 'Novalis prépare réponses, devis et publications — en brouillon.' },
  { cle: 'envoyer', titre: 'Envoyer après mon oui', role: 'Rien ne part sans que vous ayez approuvé. Vous gardez la main.' },
  { cle: 'operer', titre: 'Agir sur mes comptes', role: 'Une fois approuvé, Novalis exécute via les comptes que vous avez branchés.' },
];

/**
 * Crée/relie l'entreprise et garantit un client_id (pour le coffre/jobs).
 * @returns {number} client_id
 */
function assurerClient(db, source, nom) {
  const ex = db.prepare('SELECT client_id FROM entreprises WHERE source = ?').get(source);
  if (ex && ex.client_id) return ex.client_id;
  // 'novalis' = tenant interne (id=1) déjà semé par 001-core.
  if (source === 'novalis') return 1;
  const info = db.prepare('INSERT INTO clients (nom, statut) VALUES (?, \'actif\')')
    .run(nom || source);
  return info.lastInsertRowid;
}

/** Upsert de l'identité de l'entreprise. Ne touche pas aux consentements. */
function definirEntreprise(db, source, champs = {}) {
  if (!/^[a-z0-9-]{2,40}$/.test(String(source))) throw new Error('source invalide');
  const clientId = assurerClient(db, source, champs.nom);
  const c = {
    source, clientId,
    nom: champs.nom != null ? String(champs.nom).slice(0, 120) : null,
    secteur: champs.secteur != null ? String(champs.secteur).slice(0, 40) : null,
    ville: champs.ville != null ? String(champs.ville).slice(0, 80) : null,
    telephone: champs.telephone != null ? String(champs.telephone).slice(0, 40) : null,
    courriel: champs.courriel != null ? String(champs.courriel).slice(0, 180) : null,
    siteUrl: champs.siteUrl != null ? String(champs.siteUrl).slice(0, 300) : null,
  };
  db.prepare(`INSERT INTO entreprises (source, client_id, nom, secteur, ville, telephone, courriel, site_url)
    VALUES (@source, @clientId, @nom, @secteur, @ville, @telephone, @courriel, @siteUrl)
    ON CONFLICT(source) DO UPDATE SET
      client_id = COALESCE(entreprises.client_id, @clientId),
      nom = COALESCE(@nom, nom), secteur = COALESCE(@secteur, secteur),
      ville = COALESCE(@ville, ville), telephone = COALESCE(@telephone, telephone),
      courriel = COALESCE(@courriel, courriel), site_url = COALESCE(@siteUrl, site_url),
      maj_le = datetime('now')`).run(c);
  return clientId;
}

/** Enregistre les consentements (0/1). Champs absents = inchangés. */
function definirConsentement(db, source, consent = {}) {
  assurerClient(db, source, null);
  db.prepare(`INSERT INTO entreprises (source, consent_rediger, consent_envoyer, consent_operer)
    VALUES (@source, COALESCE(@rediger,0), COALESCE(@envoyer,0), COALESCE(@operer,0))
    ON CONFLICT(source) DO UPDATE SET
      consent_rediger = COALESCE(@rediger, consent_rediger),
      consent_envoyer = COALESCE(@envoyer, consent_envoyer),
      consent_operer  = COALESCE(@operer,  consent_operer),
      maj_le = datetime('now')`).run({
    source,
    rediger: bit(consent.rediger), envoyer: bit(consent.envoyer), operer: bit(consent.operer),
  });
}
function bit(v) { return v === undefined || v === null ? null : (v ? 1 : 0); }

/**
 * Marque l'état d'une connexion. Le secret éventuel est confié au coffre par
 * l'appelant (server.js), PAS ici : ce module ne voit jamais de secret.
 */
function definirConnexion(db, source, type, { statut, label, detail } = {}) {
  if (!TYPES.has(type)) throw new Error('type de connexion inconnu');
  const st = ['a_brancher', 'branche', 'erreur'].includes(statut) ? statut : 'a_brancher';
  db.prepare(`INSERT INTO connexions (source, type, statut, compte_label, detail)
    VALUES (@source, @type, @statut, @label, @detail)
    ON CONFLICT(source, type) DO UPDATE SET
      statut = @statut, compte_label = COALESCE(@label, compte_label),
      detail = @detail, maj_le = datetime('now')`)
    .run({ source, type, statut: st, label: label ? String(label).slice(0, 180) : null,
      detail: detail ? String(detail).slice(0, 300) : null });
}

/**
 * État complet du branchement d'une entreprise — fonction de LECTURE, testable.
 * Fusionne le catalogue avec l'état stocké, calcule la complétude de l'identité,
 * l'état des consentements, et une progression « prêt à opérer ».
 */
function etat(db, source) {
  let ent = null, cxRows;
  try { ent = db.prepare('SELECT * FROM entreprises WHERE source = ?').get(source) || null; } catch { ent = null; }
  try { cxRows = db.prepare('SELECT type, statut, compte_label, detail FROM connexions WHERE source = ?').all(source); } catch { cxRows = []; }
  const parType = new Map(cxRows.map(r => [r.type, r]));

  const connexions = CONNEXIONS.map(c => {
    const r = parType.get(c.type);
    return { ...c, statut: r?.statut || 'a_brancher', compte_label: r?.compte_label || null, detail: r?.detail || null };
  });

  const identiteChamps = ['nom', 'secteur', 'ville', 'telephone', 'courriel'];
  const identiteRemplis = identiteChamps.filter(k => ent && ent[k]).length;
  const identiteComplete = identiteRemplis === identiteChamps.length;

  const courrielBranche = connexions.find(c => c.type === 'courriel')?.statut === 'branche';
  const consent = {
    rediger: !!(ent && ent.consent_rediger),
    envoyer: !!(ent && ent.consent_envoyer),
    operer: !!(ent && ent.consent_operer),
  };

  // Étapes du branchement : chacune vaut également, la progression est leur
  // moyenne. « Prêt à opérer » exige les fondations (identité + courriel + les
  // deux consentements de base) — pas les intégrations « bientôt ».
  const etapes = [
    { cle: 'identite', titre: 'Identité de l\'entreprise', fait: identiteComplete },
    { cle: 'site', titre: 'Site relié', fait: !!(ent && ent.site_url) },
    { cle: 'courriel', titre: 'Courriel branché', fait: courrielBranche },
    { cle: 'consent_rediger', titre: 'Autorisation de rédiger', fait: consent.rediger },
    { cle: 'consent_envoyer', titre: 'Envoi après approbation', fait: consent.envoyer },
  ];
  const faits = etapes.filter(e => e.fait).length;
  const pretPct = Math.round(100 * faits / etapes.length);
  const pret = etapes.every(e => e.fait);

  return {
    source,
    existe: !!ent,
    nom: ent?.nom || null,
    client_id: ent?.client_id || null,
    statut: ent?.statut || 'branchement',
    identite: {
      nom: ent?.nom || null, secteur: ent?.secteur || null, ville: ent?.ville || null,
      telephone: ent?.telephone || null, courriel: ent?.courriel || null, site_url: ent?.site_url || null,
      complete: identiteComplete, remplis: identiteRemplis, total: identiteChamps.length,
    },
    connexions,
    consentements: CONSENTEMENTS.map(x => ({ ...x, actif: consent[x.cle] })),
    consent,
    etapes,
    pret_pct: pretPct,
    pret,
  };
}

module.exports = {
  CONNEXIONS, CONSENTEMENTS,
  definirEntreprise, definirConsentement, definirConnexion, assurerClient,
  etat,
};
