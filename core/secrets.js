'use strict';
// ── Coffre à credentials clients : envelope encryption à deux niveaux ─
// Décision de sécurité :
//   1. Une DEK (Data Encryption Key) AES-256 aléatoire PAR CLIENT.
//   2. Chaque credential est chiffré AES-256-GCM par la DEK du client.
//   3. La DEK est stockée wrappée (chiffrée) par la MASTER_KEY, qui ne
//      vit QUE dans la variable d'environnement Railway — jamais en
//      base, jamais dans le code, jamais dans les logs.
// Conséquences : un dump de la base seule est inexploitable ; la
// rotation de la master key = re-wrap des DEK (petites, rapides) sans
// retoucher les credentials ; la compromission d'un client ne donne
// pas les clés des autres.
// GCM est choisi (vs CBC) pour l'authentification intégrée : toute
// altération du ciphertext fait échouer le déchiffrement au lieu de
// produire du plaintext corrompu silencieux.

const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;   // 96 bits, taille nominale GCM
const TAG_LEN = 16;

/** Concatène iv|tag|ct en un seul BLOB pour un stockage à une colonne. */
function seal(key, plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function open(key, blob) {
  if (!Buffer.isBuffer(blob) || blob.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('coffre: blob invalide');
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string|undefined} masterKeyHex 64 caractères hex (32 octets),
 *        depuis process.env.MASTER_KEY. Absent → le coffre refuse de
 *        fonctionner avec une erreur explicite (fail-closed) plutôt que
 *        de retomber sur une clé par défaut (la leçon ADMIN_PASS).
 */
function createVault(db, masterKeyHex) {
  const stmts = {
    getDek: db.prepare('SELECT dek_wrapped FROM client_deks WHERE client_id = ?'),
    putDek: db.prepare('INSERT INTO client_deks (client_id, dek_wrapped) VALUES (?, ?)'),
    upsertCred: db.prepare(`INSERT INTO client_credentials (client_id, name, ciphertext)
      VALUES (?, ?, ?)
      ON CONFLICT(client_id, name) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = datetime('now')`),
    getCred: db.prepare('SELECT ciphertext FROM client_credentials WHERE client_id = ? AND name = ?'),
    listCreds: db.prepare('SELECT name, created_at, updated_at FROM client_credentials WHERE client_id = ? ORDER BY name'),
    delCred: db.prepare('DELETE FROM client_credentials WHERE client_id = ? AND name = ?'),
    allDeks: db.prepare('SELECT client_id, dek_wrapped FROM client_deks'),
    updDek: db.prepare('UPDATE client_deks SET dek_wrapped = ? WHERE client_id = ?'),
  };

  function masterKey() {
    if (!masterKeyHex || !/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
      throw new Error(
        'MASTER_KEY absente ou invalide (attendu : 64 caractères hexadécimaux). ' +
        'Générer : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
        'puis définir la variable dans Railway. Le coffre est fail-closed : ' +
        'aucun credential ne sera lu ou écrit sans elle.'
      );
    }
    return Buffer.from(masterKeyHex, 'hex');
  }

  /** DEK du client, créée à la volée au premier usage. */
  function dekFor(clientId) {
    const mk = masterKey();
    const row = stmts.getDek.get(clientId);
    if (row) return Buffer.from(open(mk, row.dek_wrapped), 'base64');
    const dek = crypto.randomBytes(32);
    stmts.putDek.run(clientId, seal(mk, dek.toString('base64')));
    return dek;
  }

  /** Stocke (ou remplace) un credential chiffré pour un client. */
  function set(clientId, name, value) {
    if (!Number.isInteger(clientId)) throw new Error('coffre: clientId entier requis');
    if (!name || typeof value !== 'string' || !value.length) throw new Error('coffre: name et value requis');
    stmts.upsertCred.run(clientId, name, seal(dekFor(clientId), value));
  }

  /**
   * Lit un credential en clair — UNIQUEMENT destiné au worker au moment
   * d'exécuter un step. Ne jamais exposer via HTTP, ne jamais logger.
   * @returns {string|null}
   */
  function get(clientId, name) {
    const row = stmts.getCred.get(clientId, name);
    if (!row) return null;
    return open(dekFor(clientId), row.ciphertext);
  }

  /** Liste les NOMS de credentials d'un client (jamais les valeurs). */
  function list(clientId) { return stmts.listCreds.all(clientId); }

  function remove(clientId, name) { return stmts.delCred.run(clientId, name).changes === 1; }

  /**
   * Rotation de la master key : re-wrap toutes les DEK avec la nouvelle
   * clé. Les credentials eux-mêmes ne sont pas retouchés.
   * Procédure : appeler avec l'ancienne ET la nouvelle clé, puis changer
   * MASTER_KEY dans Railway et redéployer.
   */
  function rotateMasterKey(oldHex, newHex) {
    if (!/^[0-9a-fA-F]{64}$/.test(oldHex) || !/^[0-9a-fA-F]{64}$/.test(newHex)) {
      throw new Error('rotation: deux clés de 64 hex requises');
    }
    const oldKey = Buffer.from(oldHex, 'hex');
    const newKey = Buffer.from(newHex, 'hex');
    const rotate = db.transaction(() => {
      let n = 0;
      for (const row of stmts.allDeks.all()) {
        const dekB64 = open(oldKey, row.dek_wrapped);
        stmts.updDek.run(seal(newKey, dekB64), row.client_id);
        n++;
      }
      return n;
    });
    return rotate();
  }

  return { set, get, list, remove, rotateMasterKey };
}

module.exports = { createVault, _seal: seal, _open: open };
