import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { runMigrations } from '../core/db.js';
import { ajouter, lister, compter, obtenir, supprimer } from '../core/pieces.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

const SRC = 'garage-test';
const CLE = 'm:cote@x.ca';

// Une vraie image PNG rouge 40×40, en data-URL.
async function imageDataUrl(w = 40, h = 40) {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
}

describe('pièces jointes — ajout & recompression', () => {
  it('accepte une image et la range recompressée en JPEG', async () => {
    const dataUrl = await imageDataUrl(2000, 2000); // grande → doit être redimensionnée
    const r = await ajouter(db, SRC, CLE, { dataUrl, nom: 'avant.png', legende: 'avant' });
    expect(r.id).toBeGreaterThan(0);
    expect(r.type).toBe('image/jpeg');       // recompressé
    expect(r.taille).toBeGreaterThan(0);
    // le plus grand côté ne dépasse pas 1600 px
    const p = obtenir(db, SRC, r.id);
    const meta = await sharp(p.data).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1600);
  });

  it('liste les métadonnées sans exposer le BLOB', async () => {
    await ajouter(db, SRC, CLE, { dataUrl: await imageDataUrl(), legende: 'plaque' });
    const l = lister(db, SRC, CLE);
    expect(l.length).toBe(1);
    expect(l[0].legende).toBe('plaque');
    expect('data' in l[0]).toBe(false); // pas de BLOB dans la liste
    expect(compter(db, SRC, CLE)).toBe(1);
  });

  it('rejette une entrée qui n’est pas une image', async () => {
    await expect(ajouter(db, SRC, CLE, { dataUrl: 'data:application/pdf;base64,AAAA' })).rejects.toThrow();
    await expect(ajouter(db, SRC, CLE, { dataUrl: 'pas-une-data-url' })).rejects.toThrow();
  });

  it('supprime une pièce, et seulement pour la bonne entreprise', async () => {
    const { id } = await ajouter(db, SRC, CLE, { dataUrl: await imageDataUrl() });
    expect(supprimer(db, 'autre-garage', id)).toBe(false); // mauvaise entreprise → non supprimé
    expect(obtenir(db, SRC, id)).not.toBeNull();
    expect(supprimer(db, SRC, id)).toBe(true);
    expect(obtenir(db, SRC, id)).toBeNull();
  });

  it('obtenir ne fuit pas entre entreprises', async () => {
    const { id } = await ajouter(db, SRC, CLE, { dataUrl: await imageDataUrl() });
    expect(obtenir(db, 'autre-garage', id)).toBeNull();
  });
});
