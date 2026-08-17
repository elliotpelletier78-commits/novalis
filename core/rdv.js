'use strict';
// ── Novalis Rendez-vous — carnet + rappels automatiques ─────────────
// Le commerçant note ses rendez-vous ; Novalis prépare un rappel au bon moment
// (proposition « rappel » déposée dans le poste de commande). Réduit les
// no-shows sans effort. Honnête : le rappel ne promet rien, il rappelle.

function pad(n) { return String(n).padStart(2, '0'); }

// Heure murale de Montréal ('YYYY-MM-DD HH:MM:SS') pour un instant donné. Les
// `debut` sont saisis en heure locale du commerce (Montréal) ; toutes les
// comparaisons se font donc dans ce fuseau, jamais en UTC — sinon, sur un
// serveur UTC (Railway), un rendez-vous du jour serait considéré comme passé.
function montrealWall(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montreal', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const g = (t) => (parts.find((x) => x.type === t) || {}).value || '00';
  let h = g('hour'); if (h === '24') h = '00';
  return `${g('year')}-${g('month')}-${g('day')} ${h}:${g('minute')}:${g('second')}`;
}

/** Formate 'YYYY-MM-DD HH:MM' en libellé lisible (fr-CA). */
function formatQuand(debut) {
  const t = Date.parse(String(debut).replace(' ', 'T'));
  if (!Number.isFinite(t)) return String(debut || '');
  const d = new Date(t);
  const jour = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${jour} à ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

function ajouter(db, source, { client_nom, client_courriel, debut, service, note } = {}) {
  const dt = String(debut || '').trim().replace('T', ' ').slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dt)) throw new Error('date/heure du rendez-vous requise (AAAA-MM-JJ HH:MM)');
  const info = db.prepare(`INSERT INTO rendezvous (source, client_nom, client_courriel, debut, service, note)
    VALUES (?, ?, ?, ?, ?, ?)`).run(source,
    client_nom ? String(client_nom).slice(0, 120) : null,
    client_courriel ? String(client_courriel).slice(0, 180) : null,
    dt + ':00',
    service ? String(service).slice(0, 120) : null,
    note ? String(note).slice(0, 400) : null);
  return { id: info.lastInsertRowid };
}

/** Rendez-vous à venir (statut prévu), du plus proche au plus loin. */
function lister(db, source, opts = {}) {
  const limite = Math.min(parseInt(opts.limite, 10) || 50, 200);
  try {
    if (opts.tous) return db.prepare('SELECT * FROM rendezvous WHERE source = ? ORDER BY debut DESC LIMIT ?').all(source, limite);
    const seuil = montrealWall(Date.now() - 2 * 3600000); // 2 h de battement (heure Montréal)
    return db.prepare(`SELECT * FROM rendezvous WHERE source = ? AND statut = 'prevu'
      AND debut >= ? ORDER BY debut ASC LIMIT ?`).all(source, seuil, limite);
  } catch { return []; }
}

/**
 * Marque un rendez-vous. Si on l'annule (ou le marque fait), on ANNULE aussi le
 * rappel préparé s'il attend encore — sinon on enverrait un rappel pour un
 * rendez-vous qui n'existe plus.
 */
function marquer(db, id, statut) {
  if (!['prevu', 'fait', 'annule'].includes(statut)) return false;
  let row = null;
  try { row = db.prepare('SELECT rappel_prop_id FROM rendezvous WHERE id = ?').get(id); } catch { /* ignore */ }
  const changes = db.prepare('UPDATE rendezvous SET statut = ? WHERE id = ?').run(statut, id).changes;
  if (changes && statut !== 'prevu' && row && row.rappel_prop_id) {
    try { db.prepare(`UPDATE propositions SET statut = 'rejete', traite_le = datetime('now'), maj_le = datetime('now')
      WHERE id = ? AND statut = 'en_attente'`).run(row.rappel_prop_id); } catch { /* pas bloquant */ }
  }
  return changes === 1;
}

/** Brouillon de rappel — rappelle le rendez-vous, sans rien promettre d'autre. */
function brouillonRappel(rdv, cfg = {}) {
  const commerce = cfg.nomCommerce || 'notre équipe';
  const pn = (String(rdv.client_nom || '').trim().split(/\s+/)[0] || '');
  const salut = pn.length >= 2 ? `Bonjour ${pn},` : 'Bonjour,';
  const lignes = [
    salut,
    '',
    `Petit rappel : vous avez rendez-vous chez ${commerce} ${formatQuand(rdv.debut)}${rdv.service ? ` pour ${rdv.service}` : ''}.`,
    'Au plaisir de vous voir !',
  ];
  const lien = typeof cfg.lienConfirmer === 'function' ? cfg.lienConfirmer(rdv) : null;
  if (lien) {
    lignes.push('', `Confirmez votre présence en un clic : ${lien}`);
  }
  const contact = cfg.telephone ? `au ${cfg.telephone}` : 'en répondant à ce courriel';
  lignes.push('', `Si vous devez reporter ou annuler, joignez-nous ${contact}.`, '', commerce);
  return lignes.join('\n');
}

/** Réponse du client à un rappel : 'confirme' | 'reporter'. Idempotent. */
function confirmerClient(db, id, reponse) {
  if (!['confirme', 'reporter'].includes(reponse)) return { ok: false, raison: 'réponse invalide' };
  const row = db.prepare('SELECT * FROM rendezvous WHERE id = ?').get(id);
  if (!row || row.statut !== 'prevu') return { ok: false, raison: 'rendez-vous introuvable' };
  if (row.client_reponse) return { ok: true, deja: row.client_reponse, rdv: row };
  db.prepare('UPDATE rendezvous SET client_reponse = ?, client_reponse_le = ? WHERE id = ?')
    .run(reponse, new Date().toISOString(), id);
  return { ok: true, rdv: row };
}

/**
 * Prépare un rappel pour chaque rendez-vous prévu dans la fenêtre (par défaut :
 * les 48 prochaines heures) qui n'en a pas encore. Idempotent (rappel_prop_id +
 * unicité de proposition par rdv). À appeler paresseusement.
 * @returns {number} rappels créés
 */
function preparerRappels(db, source, opts = {}) {
  const baseMs = opts.nowMs || opts.now || Date.now();
  const fenetreMs = (opts.fenetreH || 48) * 3600000;
  const cfg = opts.cfg || {};
  // Fenêtre exprimée en heure murale de Montréal (comme les `debut` stockés).
  const nowW = montrealWall(baseMs);
  const finW = montrealWall(baseMs + fenetreMs);
  let rdvs;
  try {
    rdvs = db.prepare(`SELECT * FROM rendezvous WHERE source = ? AND statut = 'prevu' AND rappel_prop_id IS NULL`).all(source);
  } catch { return 0; }
  let n = 0;
  const insProp = db.prepare(`INSERT OR IGNORE INTO propositions
    (source, type, ref_type, ref_id, titre, apercu, brouillon, destinataire, priorite)
    VALUES (?, 'rappel', 'rdv', ?, ?, ?, ?, ?, 6)`);
  const setRappel = db.prepare('UPDATE rendezvous SET rappel_prop_id = ? WHERE id = ?');
  for (const r of rdvs) {
    const d = String(r.debut);           // 'YYYY-MM-DD HH:MM:SS' (Montréal)
    if (!(d >= nowW && d <= finW)) continue; // comparaison lexicale, même fuseau
    const brouillon = brouillonRappel(r, cfg);
    const info = insProp.run(source, r.id, `Rappel de RDV — ${r.client_nom || 'client'}`,
      formatQuand(r.debut) + (r.service ? ` · ${r.service}` : ''), brouillon, r.client_courriel || null);
    if (info.changes) { setRappel.run(info.lastInsertRowid, r.id); n++; }
  }
  return n;
}

module.exports = { ajouter, lister, marquer, brouillonRappel, preparerRappels, confirmerClient, formatQuand, montrealWall };
