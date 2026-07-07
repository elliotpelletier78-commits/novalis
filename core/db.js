'use strict';
// ── Runner de migrations versionnées ─────────────────────────────────
// Remplace les ALTER TABLE en try/catch : chaque fichier
// core/migrations/NNN-*.sql est appliqué une seule fois, en transaction,
// dans l'ordre numérique. L'état est tracé dans schema_migrations.

const fs = require('fs');
const path = require('path');

/**
 * Applique les migrations manquantes sur une connexion better-sqlite3.
 * @param {import('better-sqlite3').Database} db
 * @returns {{applied: string[]}}
 */
function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const dir = path.join(__dirname, 'migrations');
  const done = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name)
  );
  const applied = [];

  const files = fs.readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    try {
      apply();
      applied.push(file);
    } catch (e) {
      // Une migration qui casse doit arrêter le démarrage : continuer
      // avec un schéma partiel produirait des corruptions silencieuses.
      throw new Error(`Migration ${file} échouée: ${e.message}`);
    }
  }
  return { applied };
}

module.exports = { runMigrations };
