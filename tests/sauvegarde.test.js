import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sauvegarder } from '../core/sauvegarde.js';

const tempDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'novalis-backup-'));
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function dbAvecDonnees() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);`);
  db.prepare('INSERT INTO t (v) VALUES (?)').run('secret-a');
  db.prepare('INSERT INTO t (v) VALUES (?)').run('secret-b');
  return db;
}

describe('sauvegarde de la base', () => {
  it('produit une copie ouvrable qui contient les données', async () => {
    const db = dbAvecDonnees();
    const dest = tmp();
    const r = await sauvegarder(db, { destDir: dest, horodatage: '2026-01-01T00:00:00' });

    expect(fs.existsSync(r.fichier)).toBe(true);
    expect(r.taille).toBeGreaterThan(0);

    // La copie s'ouvre et contient bien les lignes d'origine.
    const copie = new Database(r.fichier, { readonly: true });
    const lignes = copie.prepare('SELECT v FROM t ORDER BY id').all().map(x => x.v);
    expect(lignes).toEqual(['secret-a', 'secret-b']);
    copie.close();
  });

  it('fait tourner l\'archive en ne gardant que N copies', async () => {
    const db = dbAvecDonnees();
    const dest = tmp();
    // Sept horodatages croissants, on ne garde que 3.
    for (let i = 1; i <= 7; i++) {
      await sauvegarder(db, { destDir: dest, garder: 3, horodatage: `2026-01-0${i}T00:00:00` });
    }
    const restants = fs.readdirSync(dest).filter(f => f.endsWith('.db')).sort();
    expect(restants.length).toBe(3);
    // Ce sont les trois plus récents (05, 06, 07).
    expect(restants).toEqual([
      'novalis-2026-01-05T00-00-00.db',
      'novalis-2026-01-06T00-00-00.db',
      'novalis-2026-01-07T00-00-00.db',
    ]);
  });
});
