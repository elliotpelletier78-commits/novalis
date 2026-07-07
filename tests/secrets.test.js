import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { createVault } from '../core/secrets.js';

const MK = crypto.randomBytes(32).toString('hex');

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('coffre à credentials (envelope encryption)', () => {
  let db, vault;
  beforeEach(() => { db = freshDb(); vault = createVault(db, MK); });

  it('roundtrip set/get', () => {
    vault.set(1, 'google_api_key', 'AIza-secret-123');
    expect(vault.get(1, 'google_api_key')).toBe('AIza-secret-123');
  });

  it('rien n\'est stocké en clair dans la base', () => {
    vault.set(1, 'cle', 'valeur-ultra-secrete-xyz');
    const row = db.prepare('SELECT ciphertext FROM client_credentials WHERE client_id=1').get();
    expect(Buffer.isBuffer(row.ciphertext)).toBe(true);
    expect(row.ciphertext.toString('utf8')).not.toContain('valeur-ultra-secrete-xyz');
    const dek = db.prepare('SELECT dek_wrapped FROM client_deks WHERE client_id=1').get();
    expect(dek.dek_wrapped.toString('utf8')).not.toContain('valeur-ultra-secrete-xyz');
  });

  it('DEK distincte par client : le blob d\'un client ne se déchiffre pas avec la DEK d\'un autre', () => {
    db.prepare("INSERT INTO clients (id, nom) VALUES (2, 'Client Test')").run();
    vault.set(1, 'k', 'secret-client-1');
    vault.set(2, 'k', 'secret-client-2');
    expect(vault.get(1, 'k')).toBe('secret-client-1');
    expect(vault.get(2, 'k')).toBe('secret-client-2');
    const c1 = db.prepare('SELECT ciphertext FROM client_credentials WHERE client_id=1').get().ciphertext;
    // On échange le ciphertext du client 1 vers le client 2 : GCM doit refuser.
    db.prepare('UPDATE client_credentials SET ciphertext=? WHERE client_id=2').run(c1);
    expect(() => vault.get(2, 'k')).toThrow();
  });

  it('altération du ciphertext → échec net (authentification GCM)', () => {
    vault.set(1, 'k', 'secret');
    const row = db.prepare('SELECT ciphertext FROM client_credentials WHERE client_id=1').get();
    const tampered = Buffer.from(row.ciphertext);
    tampered[tampered.length - 1] ^= 0xff;
    db.prepare('UPDATE client_credentials SET ciphertext=? WHERE client_id=1').run(tampered);
    expect(() => vault.get(1, 'k')).toThrow();
  });

  it('fail-closed sans MASTER_KEY valide', () => {
    const sans = createVault(freshDb(), undefined);
    expect(() => sans.set(1, 'k', 'v')).toThrow(/MASTER_KEY/);
    const invalide = createVault(freshDb(), 'pas-une-cle');
    expect(() => invalide.set(1, 'k', 'v')).toThrow(/MASTER_KEY/);
  });

  it('rotation de master key : les credentials restent lisibles avec la nouvelle clé', () => {
    vault.set(1, 'k', 'secret-durable');
    const MK2 = crypto.randomBytes(32).toString('hex');
    expect(vault.rotateMasterKey(MK, MK2)).toBe(1); // 1 DEK re-wrappée
    const vault2 = createVault(db, MK2);
    expect(vault2.get(1, 'k')).toBe('secret-durable');
    // L'ancienne clé ne fonctionne plus
    const vaultVieille = createVault(db, MK);
    expect(() => vaultVieille.get(1, 'k')).toThrow();
  });

  it('list ne retourne jamais les valeurs', () => {
    vault.set(1, 'a', 'v1');
    vault.set(1, 'b', 'v2');
    const l = vault.list(1);
    expect(l.map(x => x.name)).toEqual(['a', 'b']);
    expect(JSON.stringify(l)).not.toContain('v1');
  });
});
