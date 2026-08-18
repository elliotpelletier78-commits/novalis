'use strict';
// ── Novalis — Pièces jointes photo (dossier client) ─────────────────
// Reçoit une image (data-URL base64), la VALIDE et la recompresse avec sharp
// (auto-orientation, max ~1600 px, ~80 %) avant de la ranger en base. Ainsi une
// photo de 6 Mo prise au téléphone tombe à ~200-400 Ko : léger et sauvegardé
// avec le reste. Rien n'est stocké tel quel — on ne fait jamais confiance à
// l'entrée brute (type déclaré, taille).

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

const MAX_ENTREE = 12 * 1024 * 1024;  // 12 Mo bruts acceptés en entrée (avant recompression)
const MAX_COTE = 1600;                // plus grand côté après redimensionnement
const TYPES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

function decoderDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([a-z0-9/+.-]+);base64,(.+)$/i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  return { type, buf };
}

/**
 * Ajoute une photo au dossier d'une personne. `dataUrl` = 'data:image/...;base64,...'.
 * Recompresse via sharp ; lève si l'image est invalide ou trop lourde.
 */
async function ajouter(db, source, cle, { dataUrl, nom, legende } = {}) {
  if (!cle) throw new Error('clé manquante');
  const dec = decoderDataUrl(dataUrl);
  if (!dec) throw new Error('image invalide');
  if (!TYPES_OK.includes(dec.type)) throw new Error('format non accepté (JPEG, PNG, WebP, GIF, HEIC)');
  if (dec.buf.length > MAX_ENTREE) throw new Error('image trop lourde (max 12 Mo)');

  let data = dec.buf, type = 'image/jpeg';
  if (sharp) {
    try {
      data = await sharp(dec.buf, { failOn: 'none' })
        .rotate() // respecte l'orientation EXIF puis l'aplatit
        .resize({ width: MAX_COTE, height: MAX_COTE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    } catch { throw new Error('image illisible'); }
  } else {
    // Repli sans sharp : on garde tel quel (types raster sûrs uniquement).
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(dec.type)) throw new Error('recompression indisponible');
    type = dec.type;
  }

  const info = db.prepare(
    `INSERT INTO pieces_jointes (source, cle, nom, type, taille, data, legende)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(source, cle, nom ? String(nom).slice(0, 160) : null, type, data.length, data,
    legende ? String(legende).slice(0, 200) : null);
  return { id: info.lastInsertRowid, taille: data.length, type };
}

/** Liste les pièces d'une personne — MÉTADONNÉES seulement (pas le BLOB). */
function lister(db, source, cle) {
  try {
    return db.prepare(
      'SELECT id, nom, type, taille, legende, cree_le FROM pieces_jointes WHERE source = ? AND cle = ? ORDER BY cree_le DESC, id DESC',
    ).all(source, cle);
  } catch { return []; }
}

function compter(db, source, cle) {
  try { return db.prepare('SELECT COUNT(*) n FROM pieces_jointes WHERE source = ? AND cle = ?').get(source, cle).n; } catch { return 0; }
}

/** Récupère une pièce (BLOB + type) pour la servir. null si absente/mauvaise entreprise. */
function obtenir(db, source, id) {
  try {
    const r = db.prepare('SELECT type, data FROM pieces_jointes WHERE id = ? AND source = ?').get(id, source);
    return r || null;
  } catch { return null; }
}

function supprimer(db, source, id) {
  try { return db.prepare('DELETE FROM pieces_jointes WHERE id = ? AND source = ?').run(id, source).changes === 1; } catch { return false; }
}

module.exports = { ajouter, lister, compter, obtenir, supprimer, TYPES_OK, MAX_ENTREE };
