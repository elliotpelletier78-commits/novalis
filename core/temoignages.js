'use strict';
// ── Novalis — Avis & témoignages ───────────────────────────────────
// Enregistre les VRAIS avis reçus, en choisit l'affichage, et calcule un résumé
// honnête. Rien n'est inventé : chaque entrée est saisie à partir d'un avis
// réel. La moyenne ne porte que sur les notes réellement présentes.

const PROVENANCES = ['google', 'facebook', 'courriel', 'direct'];

function ajouter(db, source, { auteur, note, texte, provenance, cle } = {}) {
  const a = String(auteur || '').trim().slice(0, 120);
  const t = String(texte || '').trim().slice(0, 2000);
  if (!a) throw new Error('nom de l’auteur requis');
  if (!t) throw new Error('texte de l’avis requis');
  let n = null;
  if (note != null && note !== '') {
    n = parseInt(note, 10);
    if (!(n >= 1 && n <= 5)) throw new Error('note entre 1 et 5');
  }
  const prov = PROVENANCES.includes(provenance) ? provenance : 'direct';
  const info = db.prepare(
    'INSERT INTO temoignages (source, auteur, note, texte, provenance, cle) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(source, a, n, t, prov, cle ? String(cle).slice(0, 200) : null);
  return { id: info.lastInsertRowid };
}

/** Liste les témoignages. publicOnly → seulement ceux affichés. */
function lister(db, source, { publicOnly = false } = {}) {
  try {
    const sql = 'SELECT id, auteur, note, texte, provenance, affiche, cree_le FROM temoignages WHERE source = ?'
      + (publicOnly ? ' AND affiche = 1' : '') + ' ORDER BY cree_le DESC, id DESC';
    return db.prepare(sql).all(source);
  } catch { return []; }
}

/** Résumé honnête : nb total, nb affichés, moyenne des notes présentes. */
function resume(db, source) {
  try {
    const tot = db.prepare('SELECT COUNT(*) n FROM temoignages WHERE source = ?').get(source).n;
    const pub = db.prepare('SELECT COUNT(*) n FROM temoignages WHERE source = ? AND affiche = 1').get(source).n;
    const m = db.prepare('SELECT AVG(note) a, COUNT(note) c FROM temoignages WHERE source = ? AND note IS NOT NULL AND affiche = 1').get(source);
    return { total: tot, affiches: pub, moyenne: m.c ? Math.round(m.a * 10) / 10 : null, notes: m.c };
  } catch { return { total: 0, affiches: 0, moyenne: null, notes: 0 }; }
}

function definirAffichage(db, source, id, affiche) {
  return db.prepare('UPDATE temoignages SET affiche = ? WHERE id = ? AND source = ?').run(affiche ? 1 : 0, id, source).changes === 1;
}
function supprimer(db, source, id) {
  return db.prepare('DELETE FROM temoignages WHERE id = ? AND source = ?').run(id, source).changes === 1;
}

module.exports = { ajouter, lister, resume, definirAffichage, supprimer, PROVENANCES };
