'use strict';
// ── Novalis — Fiche client (le répertoire 360) ─────────────────────────
// Ce que toutes les plateformes opérées ont et qui manquait à Novalis : UNE
// personne = tout son historique au même endroit. Chaque message, rendez-vous
// et devis vit dans sa propre table (leads, rendezvous, propositions) ; ici on
// les REGROUPE par personne (courriel, sinon nom) pour donner au commerçant la
// vue client complète — messages, visites, valeur — sans rien inventer.
//
// Modèle de LECTURE : aucune écriture, aucune migration. On ne montre que des
// lignes réellement enregistrées. Volumes d'une PME : on agrège en mémoire.

function normCourriel(c) { return String(c || '').trim().toLowerCase(); }
function normNom(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }

/** Clé stable d'une personne : courriel si présent, sinon nom. null si vide. */
function cleDe(courriel, nom) {
  const c = normCourriel(courriel);
  if (c && /@/.test(c)) return 'm:' + c;
  const n = normNom(nom);
  return n ? 'n:' + n : null;
}

const RANG_STATUT = { gagne: 4, contacte: 3, nouveau: 2, perdu: 1 };
function meilleurStatut(a, b) {
  return (RANG_STATUT[b] || 0) > (RANG_STATUT[a] || 0) ? b : a;
}

function rangs(db, source) {
  let leads = [], rdvs = [], props = [];
  try {
    leads = db.prepare(
      `SELECT id, nom, courriel, telephone, entreprise, message, statut, valeur_cents, hors_heures,
              created_at, repondu_le, accuse_le, gagne_le, notes
       FROM leads WHERE source = ? ORDER BY created_at`,
    ).all(source);
  } catch { /* base jeune */ }
  try {
    rdvs = db.prepare(
      `SELECT id, client_nom, client_courriel, client_telephone, debut, service, statut, client_reponse, cree_le
       FROM rendezvous WHERE source = ? ORDER BY debut`,
    ).all(source);
  } catch { /* base jeune */ }
  try {
    props = db.prepare(
      `SELECT id, type, ref_type, destinataire, titre, statut, cree_le, traite_le
       FROM propositions WHERE source = ? AND destinataire IS NOT NULL ORDER BY cree_le`,
    ).all(source);
  } catch { /* base jeune */ }
  return { leads, rdvs, props };
}

/** Regroupe tout par personne. Retourne une Map cle → dossier agrégé. */
function dossiers(db, source) {
  const { leads, rdvs, props } = rangs(db, source);
  const map = new Map();
  const dossier = (cle, nom, courriel) => {
    let d = map.get(cle);
    if (!d) {
      d = {
        cle, nom: nom || '', courriel: courriel || '', telephone: '',
        messages: 0, rdv: 0, devis: 0, avis: 0, reponses: 0,
        statut: 'nouveau', valeur_cents: 0, gagne: false,
        premier: null, dernier: null, evenements: [],
      };
      map.set(cle, d);
    }
    if (!d.nom && nom) d.nom = nom;
    if (!d.courriel && courriel && /@/.test(courriel)) d.courriel = courriel;
    return d;
  };
  const touche = (d, date) => {
    if (!date) return;
    if (!d.premier || date < d.premier) d.premier = date;
    if (!d.dernier || date > d.dernier) d.dernier = date;
  };

  for (const l of leads) {
    const cle = cleDe(l.courriel, l.nom); if (!cle) continue;
    const d = dossier(cle, l.nom, l.courriel);
    if (!d.telephone && l.telephone) d.telephone = l.telephone;
    d.messages += 1;
    d.statut = meilleurStatut(d.statut, l.statut || 'nouveau');
    if (l.statut === 'gagne') { d.gagne = true; if (l.valeur_cents) d.valeur_cents += l.valeur_cents; }
    touche(d, l.created_at);
    d.evenements.push({
      genre: 'message', date: l.created_at, titre: 'Message reçu',
      apercu: String(l.message || '').slice(0, 240),
      meta: [l.hors_heures ? 'hors des heures' : null, l.accuse_le ? 'accusé envoyé' : null, l.repondu_le ? 'répondu' : null].filter(Boolean).join(' · '),
    });
  }
  for (const r of rdvs) {
    const cle = cleDe(r.client_courriel, r.client_nom); if (!cle) continue;
    const d = dossier(cle, r.client_nom, r.client_courriel);
    if (!d.telephone && r.client_telephone) d.telephone = r.client_telephone;
    d.rdv += 1;
    touche(d, r.cree_le); touche(d, r.debut);
    const conf = r.client_reponse === 'confirme' ? 'confirmé' : r.client_reponse === 'reporter' ? 'à reporter' : null;
    d.evenements.push({
      genre: 'rdv', date: r.debut, titre: 'Rendez-vous' + (r.service ? ' — ' + r.service : ''),
      apercu: '', meta: [r.statut, conf].filter(Boolean).join(' · '),
    });
  }
  for (const p of props) {
    const cle = cleDe(p.destinataire, null); if (!cle) continue;
    // On ne crée PAS un dossier pour une proposition seule : elle doit se
    // rattacher à une personne déjà connue (par courriel), sinon on l'ignore.
    const d = map.get(cle); if (!d) continue;
    if (p.type === 'devis') d.devis += 1;
    else if (p.type === 'avis') d.avis += 1;
    else if (p.type === 'reponse') d.reponses += 1;
    touche(d, p.cree_le);
    d.evenements.push({
      genre: p.type, date: p.traite_le || p.cree_le,
      titre: TITRE_PROP[p.type] || 'Proposition', apercu: String(p.titre || '').slice(0, 200),
      meta: STATUT_PROP[p.statut] || p.statut,
    });
  }

  // Dossiers persistants saisis par le commerçant (notes, étape choisie,
  // assignation). L'étape choisie à la main PRIME sur le statut déduit.
  let doss = [];
  try { doss = db.prepare('SELECT cle, statut, notes, assigne FROM client_dossiers WHERE source = ?').all(source); } catch { /* migration pas encore là */ }
  const parCle = new Map(doss.map(x => [x.cle, x]));
  for (const d of map.values()) {
    const x = parCle.get(d.cle);
    d.notes = x && x.notes ? x.notes : '';
    d.assigne = x && x.assigne ? x.assigne : '';
    d.statut_manuel = x && x.statut ? x.statut : '';
    if (d.statut_manuel) { d.statut = d.statut_manuel; if (d.statut_manuel === 'gagne') d.gagne = true; }
    d.evenements.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  return map;
}

const STATUTS_VALIDES = ['nouveau', 'contacte', 'gagne', 'perdu'];

/** Écrit (ou met à jour) le dossier persistant d'une personne. Champs partiels. */
function enregistrerDossier(db, source, cle, champs = {}) {
  if (!cle) throw new Error('clé manquante');
  const cur = (() => { try { return db.prepare('SELECT statut, notes, assigne FROM client_dossiers WHERE source = ? AND cle = ?').get(source, cle); } catch { return null; } })() || {};
  let statut = cur.statut || null;
  if ('statut' in champs) {
    const s = champs.statut == null ? '' : String(champs.statut);
    if (s && !STATUTS_VALIDES.includes(s)) throw new Error('statut invalide');
    statut = s || null; // '' efface l'override → retour au statut auto
  }
  const notes = 'notes' in champs ? String(champs.notes || '').slice(0, 4000) : (cur.notes || null);
  const assigne = 'assigne' in champs ? String(champs.assigne || '').slice(0, 120) : (cur.assigne || null);
  db.prepare(
    `INSERT INTO client_dossiers (source, cle, statut, notes, assigne, maj_le)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(source, cle) DO UPDATE SET statut=excluded.statut, notes=excluded.notes, assigne=excluded.assigne, maj_le=datetime('now')`,
  ).run(source, cle, statut, notes || null, assigne || null);
  return { ok: true, statut: statut || null, notes: notes || '', assigne: assigne || '' };
}

const TITRE_PROP = { devis: 'Devis préparé', avis: 'Demande d’avis', reponse: 'Réponse rédigée', relance: 'Relance', rappel: 'Rappel', fidelisation: 'Fidélisation', publication: 'Publication' };
const STATUT_PROP = { en_attente: 'en attente', approuve: 'approuvé', rejete: 'rejeté', envoye: 'envoyé', echec: 'échec' };

/** Répertoire trié : la personne active le plus récemment en premier. */
function repertoire(db, source, { q } = {}) {
  const arr = [...dossiers(db, source).values()];
  const terme = normNom(q);
  const filtre = terme
    ? arr.filter(d => normNom(d.nom).includes(terme) || normCourriel(d.courriel).includes(terme))
    : arr;
  filtre.sort((a, b) => String(b.dernier || '').localeCompare(String(a.dernier || '')));
  const total = arr.length;
  const gagnes = arr.filter(d => d.gagne).length;
  const valeur = arr.reduce((s, d) => s + (d.valeur_cents || 0), 0);
  return {
    total, gagnes, valeur_cents: valeur, affiches: filtre.length,
    clients: filtre.map(d => ({
      cle: d.cle, nom: d.nom || '(sans nom)', courriel: d.courriel,
      messages: d.messages, rdv: d.rdv, devis: d.devis,
      statut: d.statut, gagne: d.gagne, valeur_cents: d.valeur_cents,
      assigne: d.assigne || '', notes: !!d.notes,
      dernier: d.dernier, interactions: d.messages + d.rdv + d.devis + d.avis + d.reponses,
    })),
  };
}

/** Dossier complet d'une personne (timeline + résumé), ou null. */
function fiche(db, source, cle) {
  const d = dossiers(db, source).get(cle);
  if (!d) return null;
  return {
    cle: d.cle, nom: d.nom || '(sans nom)', courriel: d.courriel, telephone: d.telephone || '',
    statut: d.statut, statut_manuel: d.statut_manuel || '', gagne: d.gagne, valeur_cents: d.valeur_cents,
    notes: d.notes || '', assigne: d.assigne || '',
    premier: d.premier, dernier: d.dernier,
    compteurs: { messages: d.messages, rdv: d.rdv, devis: d.devis, avis: d.avis, reponses: d.reponses },
    evenements: d.evenements,
  };
}

/** Regroupe les personnes par étape de pipeline (statut). */
function pipeline(db, source) {
  const arr = [...dossiers(db, source).values()];
  const cols = {};
  for (const s of STATUTS_VALIDES) cols[s] = [];
  for (const d of arr) {
    const s = STATUTS_VALIDES.includes(d.statut) ? d.statut : 'nouveau';
    cols[s].push({
      cle: d.cle, nom: d.nom || '(sans nom)', courriel: d.courriel,
      assigne: d.assigne || '', valeur_cents: d.valeur_cents, gagne: d.gagne,
      messages: d.messages, rdv: d.rdv, devis: d.devis, dernier: d.dernier,
    });
  }
  for (const s of STATUTS_VALIDES) cols[s].sort((a, b) => String(b.dernier || '').localeCompare(String(a.dernier || '')));
  return { colonnes: STATUTS_VALIDES.map(s => ({ statut: s, clients: cols[s] })) };
}

/**
 * Vue « portail client » (côté client) : uniquement ce qui LE concerne et qu'il
 * peut voir — ses rendez-vous, ses soumissions, son historique. JAMAIS les
 * champs internes (notes, étape, responsable). Retourne null si personne connue.
 */
function portailClient(db, source, cle) {
  if (!cle) return null;
  let rdvs = [], devisTous = [], leads = [], paiesTous = [];
  try { rdvs = db.prepare("SELECT id, client_nom, client_courriel, debut, service, statut, client_reponse FROM rendezvous WHERE source = ? AND statut != 'annule' ORDER BY debut DESC").all(source); } catch { /* jeune */ }
  try { devisTous = db.prepare("SELECT id, titre, apercu, statut, cree_le, destinataire FROM propositions WHERE source = ? AND type = 'devis' AND destinataire IS NOT NULL ORDER BY cree_le DESC").all(source); } catch { /* jeune */ }
  try { leads = db.prepare('SELECT nom, courriel, created_at FROM leads WHERE source = ? ORDER BY created_at DESC').all(source); } catch { /* jeune */ }
  try { paiesTous = db.prepare('SELECT id, description, montant_cents, statut, url, cle FROM paiements WHERE source = ? ORDER BY id DESC').all(source); } catch { /* migration jeune */ }

  const mesRdv = rdvs.filter(r => cleDe(r.client_courriel, r.client_nom) === cle);
  const devis = devisTous.filter(p => cleDe(p.destinataire, null) === cle);
  const mesLeads = leads.filter(l => cleDe(l.courriel, l.nom) === cle);
  const mesPaies = paiesTous.filter(p => p.cle === cle);
  if (!mesRdv.length && !devis.length && !mesLeads.length && !mesPaies.length) return null;

  const nom = (mesRdv.find(r => r.client_nom) || {}).client_nom
    || (mesLeads.find(l => l.nom) || {}).nom || 'Client';
  const courriel = cle.startsWith('m:') ? cle.slice(2) : '';
  const nowW = new Date().toISOString().slice(0, 10);
  return {
    cle, nom, courriel,
    aVenir: mesRdv.filter(r => String(r.debut).slice(0, 10) >= nowW && r.statut === 'prevu')
      .sort((a, b) => String(a.debut).localeCompare(String(b.debut)))
      .map(r => ({ id: r.id, debut: r.debut, service: r.service, client_reponse: r.client_reponse })),
    passes: mesRdv.filter(r => String(r.debut).slice(0, 10) < nowW || r.statut === 'fait')
      .map(r => ({ debut: r.debut, service: r.service, statut: r.statut })),
    devis: devis.map(p => ({ id: p.id, titre: p.titre, apercu: p.apercu, statut: p.statut })),
    aRegler: mesPaies.filter(p => p.statut === 'demande')
      .map(p => ({ id: p.id, description: p.description, montant_cents: p.montant_cents, url: p.url })),
    regles: mesPaies.filter(p => p.statut === 'paye')
      .map(p => ({ description: p.description, montant_cents: p.montant_cents })),
    messages: mesLeads.length,
  };
}

module.exports = { cleDe, repertoire, fiche, pipeline, enregistrerDossier, portailClient, STATUTS_VALIDES };
