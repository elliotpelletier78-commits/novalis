import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { listerServices, ajouterService, supprimerService, construireDevis, creerDevis } from '../core/devis.js';
import { lister, get } from '../core/propositions.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

describe('catalogue de services', () => {
  it('ajoute et liste un service', () => {
    ajouterService(db, 'garage-x', { nom: 'Changement de pneus', prix_cents: 12000, unite: 'unité' });
    const s = listerServices(db, 'garage-x');
    expect(s.length).toBe(1);
    expect(s[0].nom).toBe('Changement de pneus');
    expect(s[0].prix_cents).toBe(12000);
  });

  it('accepte un service « sur devis » (prix null)', () => {
    ajouterService(db, 'garage-x', { nom: 'Réparation moteur' });
    expect(listerServices(db, 'garage-x')[0].prix_cents).toBeNull();
  });

  it('refuse un service sans nom', () => {
    expect(() => ajouterService(db, 'garage-x', { prix_cents: 100 })).toThrow();
  });

  it('retirer un service le sort de la liste', () => {
    const { id } = ajouterService(db, 'garage-x', { nom: 'X', prix_cents: 100 });
    supprimerService(db, id);
    expect(listerServices(db, 'garage-x').length).toBe(0);
  });
});

describe('construction du devis (pur)', () => {
  it('additionne les lignes chiffrées', () => {
    const d = construireDevis({ nomCommerce: 'Garage X', client: 'M. Tremblay', date: '1 janvier 2026', lignes: [
      { nom: 'Pneus', prix_cents: 12000, quantite: 1 },
      { nom: 'Alignement', prix_cents: 8000, quantite: 1 },
    ] });
    expect(d.total_cents).toBe(20000);
    expect(d.tout_chiffre).toBe(true);
    expect(d.texte).toContain('M. Tremblay');
    expect(d.texte).toContain('Taxes en sus');
  });

  it('gère la quantité', () => {
    const d = construireDevis({ lignes: [{ nom: 'Heure', prix_cents: 9000, quantite: 3 }] });
    expect(d.total_cents).toBe(27000);
  });

  it('marque « sur devis » et tout_chiffre=false quand un prix manque', () => {
    const d = construireDevis({ lignes: [
      { nom: 'Diagnostic', prix_cents: 5000 },
      { nom: 'Réparation', prix_cents: null },
    ] });
    expect(d.tout_chiffre).toBe(false);
    expect(d.texte).toMatch(/sur devis/);
    expect(d.total_cents).toBe(5000);
  });

  it('n\'invente jamais de taxes (mention seulement)', () => {
    const d = construireDevis({ lignes: [{ nom: 'X', prix_cents: 10000 }] });
    expect(d.texte).toContain('Taxes en sus');
    expect(d.texte).not.toMatch(/TPS\s*:\s*\d|TVQ\s*:\s*\d|14\.975|5%/);
  });
});

describe('création de la proposition devis', () => {
  it('dépose un devis dans la file d\'approbation', () => {
    const r = creerDevis(db, { source: 'garage-x', client: 'M. Tremblay', destinataire: 't@ex.ca',
      nomCommerce: 'Garage X', lignes: [{ nom: 'Pneus', prix_cents: 12000, quantite: 1 }] });
    const p = get(db, r.id);
    expect(p.type).toBe('devis');
    expect(p.destinataire).toBe('t@ex.ca');
    expect(p.apercu).toMatch(/Total/);
  });

  it('plusieurs devis possibles pour un même client (non idempotent)', () => {
    const l = { source: 'garage-x', nomCommerce: 'G', client: 'M. Tremblay', lignes: [{ nom: 'X', prix_cents: 100 }] };
    creerDevis(db, l); creerDevis(db, l);
    expect(lister(db, 'garage-x', { statut: 'en_attente' }).length).toBe(2);
  });
});
