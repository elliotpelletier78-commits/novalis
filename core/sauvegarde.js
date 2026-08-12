'use strict';
// ── Sauvegarde de la base ────────────────────────────────────────────
// Le volume Railway contient la seule copie de la base : prospects, leads,
// runs, comptabilité LLM, et surtout les credentials clients chiffrés. Sa
// perte efface l'entreprise. Le README documentait « aucune sauvegarde ».
//
// Ce module fait le minimum qui marche vraiment sans service externe : une
// copie cohérente de la base (API backup en ligne de SQLite — sûre pendant
// que le serveur écrit, contrairement à un cp brut sur un fichier WAL), datée,
// dans un dossier du volume, avec rotation des N plus récentes.
//
// Ce n'est PAS une protection contre la perte du volume lui-même (les copies
// vivent sur le même disque). C'est le socle : la prochaine étape est de
// pousser la copie la plus récente hors de Railway (Cloudflare R2, S3…),
// ce que sauvegarderVers() rend trivial en donnant un fichier propre à envoyer.

const fs = require('fs');
const path = require('path');

/**
 * Écrit une copie cohérente de la base dans destDir et fait tourner l'archive.
 * @param {import('better-sqlite3').Database} db connexion ouverte
 * @param {object} [opts]
 * @param {string} [opts.destDir] dossier de destination (défaut: output/backups)
 * @param {number} [opts.garder] nombre de copies à conserver (défaut: 7)
 * @param {string} [opts.horodatage] suffixe de nom (défaut: ISO courant) — injecté pour les tests
 * @returns {Promise<{fichier:string, taille:number, supprimees:string[]}>}
 */
async function sauvegarder(db, opts = {}) {
  const destDir = opts.destDir || path.join(__dirname, '..', 'output', 'backups');
  const garder = Number.isInteger(opts.garder) ? opts.garder : 7;
  const stamp = (opts.horodatage || new Date().toISOString()).replace(/[:.]/g, '-');

  fs.mkdirSync(destDir, { recursive: true });
  const fichier = path.join(destDir, `novalis-${stamp}.db`);

  // db.backup() copie page par page en tenant compte des écritures en cours —
  // c'est l'API prévue pour sauvegarder une base vivante, pas un cp du fichier.
  await db.backup(fichier);
  const taille = fs.statSync(fichier).size;

  // Rotation : ne garder que les `garder` copies les plus récentes.
  const copies = fs.readdirSync(destDir)
    .filter(f => /^novalis-.*\.db$/.test(f))
    .sort(); // les noms ISO trient chronologiquement
  const supprimees = [];
  while (copies.length > garder) {
    const vieille = copies.shift();
    try { fs.unlinkSync(path.join(destDir, vieille)); supprimees.push(vieille); }
    catch { /* déjà partie */ }
  }

  return { fichier, taille, supprimees };
}

/**
 * Programme une sauvegarde quotidienne tant que le process vit. Retourne une
 * fonction d'arrêt (pour les tests / l'arrêt gracieux). Ne bloque jamais le
 * démarrage et n'a jamais fait échouer le serveur : une sauvegarde ratée est
 * journalisée, pas fatale.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts] mêmes options que sauvegarder + intervalleMs
 * @returns {() => void} arrêt
 */
function planifier(db, opts = {}) {
  const intervalleMs = opts.intervalleMs || 24 * 60 * 60 * 1000;
  const tick = () => {
    sauvegarder(db, opts)
      .then(r => console.log(`[backup] ${path.basename(r.fichier)} (${Math.round(r.taille / 1024)} ko)` +
        (r.supprimees.length ? `, ${r.supprimees.length} ancienne(s) purgée(s)` : '')))
      .catch(e => console.warn('[backup] échec:', e.message));
  };
  const t = setInterval(tick, intervalleMs);
  if (t.unref) t.unref(); // ne pas maintenir le process en vie juste pour ça
  return () => clearInterval(t);
}

module.exports = { sauvegarder, planifier };
