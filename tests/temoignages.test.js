import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { ajouter, lister, resume, definirAffichage, supprimer } from '../core/temoignages.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});
const SRC = 'garage-test';

describe('témoignages — ajout & validation', () => {
  it('enregistre un avis réel avec note et provenance', () => {
    const r = ajouter(db, SRC, { auteur: 'Marie T.', note: 5, texte: 'Service impeccable.', provenance: 'google' });
    expect(r.id).toBeGreaterThan(0);
    const l = lister(db, SRC, {});
    expect(l[0].auteur).toBe('Marie T.');
    expect(l[0].note).toBe(5);
    expect(l[0].provenance).toBe('google');
  });
  it('accepte un avis sans note', () => {
    ajouter(db, SRC, { auteur: 'Paul', texte: 'Merci beaucoup !' });
    expect(lister(db, SRC, {})[0].note).toBeNull();
  });
  it('exige un auteur et un texte', () => {
    expect(() => ajouter(db, SRC, { auteur: '', texte: 'x' })).toThrow();
    expect(() => ajouter(db, SRC, { auteur: 'A', texte: '' })).toThrow();
  });
  it('refuse une note hors 1..5', () => {
    expect(() => ajouter(db, SRC, { auteur: 'A', texte: 'x', note: 9 })).toThrow();
  });
  it('normalise une provenance inconnue vers « direct »', () => {
    ajouter(db, SRC, { auteur: 'A', texte: 'x', provenance: 'martien' });
    expect(lister(db, SRC, {})[0].provenance).toBe('direct');
  });
});

describe('témoignages — affichage & résumé', () => {
  it('la moyenne interne porte sur TOUS les avis notés (pas seulement affichés)', () => {
    ajouter(db, SRC, { auteur: 'A', texte: 'x', note: 5, provenance: 'google' });
    ajouter(db, SRC, { auteur: 'B', texte: 'y', note: 3, provenance: 'google' });
    ajouter(db, SRC, { auteur: 'C', texte: 'z', provenance: 'courriel' }); // sans note
    const r = resume(db, SRC);
    expect(r.total).toBe(3);
    expect(r.notes).toBe(2);
    expect(r.moyenne).toBe(4); // (5+3)/2
  });
  it('masquer un mauvais avis ne gonfle PAS la moyenne interne (anti cherry-picking)', () => {
    const { id } = ajouter(db, SRC, { auteur: 'A', texte: 'x', note: 1 }); // mauvais
    ajouter(db, SRC, { auteur: 'B', texte: 'y', note: 5 });
    definirAffichage(db, SRC, id, false); // on masque le 1★
    expect(lister(db, SRC, { publicOnly: true }).length).toBe(1); // widget ne montre que B
    expect(resume(db, SRC).affiches).toBe(1);
    expect(resume(db, SRC).moyenne).toBe(3); // (1+5)/2 — reste la VRAIE moyenne
  });
  it('supprime seulement pour la bonne entreprise', () => {
    const { id } = ajouter(db, SRC, { auteur: 'A', texte: 'x' });
    expect(supprimer(db, 'autre', id)).toBe(false);
    expect(supprimer(db, SRC, id)).toBe(true);
    expect(lister(db, SRC, {}).length).toBe(0);
  });
});
