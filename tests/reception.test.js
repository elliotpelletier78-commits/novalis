import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { apercu, rapportMensuel, estHorsHeures, jetonRapport, jetonValide } from '../core/reception.js';

function db() {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE leads (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, nom TEXT, courriel TEXT,
      entreprise TEXT, message TEXT, sujets TEXT, langue TEXT, ip_hash TEXT,
      statut TEXT DEFAULT 'nouveau', valeur_cents INTEGER, repondu_le TEXT, hors_heures INTEGER DEFAULT 0,
      notes TEXT, accuse_le TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE taps (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, canal TEXT DEFAULT 'tel',
      hors_heures INTEGER DEFAULT 0, ip_hash TEXT, cree_le TEXT DEFAULT (datetime('now')));
    CREATE TABLE reception_config (source TEXT PRIMARY KEY, secteur TEXT, valeur_lead_cents INTEGER DEFAULT 30000,
      heures_json TEXT, nom_commerce TEXT, rapport_token TEXT, cree_le TEXT);
  `);
  return d;
}

// Helper : insérer un lead à un instant relatif (minutes dans le passé).
function insLead(d, source, { minPassees = 10, statut = 'nouveau', hors = 0, valeur = null, repMin = null } = {}) {
  const created = `datetime('now','-${minPassees} minutes')`;
  const repondu = repMin === null ? 'NULL' : `datetime('now','-${minPassees - repMin} minutes')`;
  d.prepare(`INSERT INTO leads (source, nom, courriel, message, statut, valeur_cents, hors_heures, created_at, repondu_le)
    VALUES (?,?,?,?,?,?,?, ${created}, ${repondu})`)
    .run(source, 'Client', 'c@x.ca', 'un message assez long', statut, valeur, hors);
}

describe('Réception — hors heures (fuseau Montréal)', () => {
  it('un mardi 14h à Montréal est DANS les heures', () => {
    // 2026-06-16 est un mardi. 18:00 UTC = 14:00 EDT (Montréal l'été).
    expect(estHorsHeures(new Date('2026-06-16T18:00:00Z'))).toBe(false);
  });
  it('un mardi 23h à Montréal est HORS heures', () => {
    // 03:00 UTC le 17 = 23:00 EDT le 16 (mardi soir).
    expect(estHorsHeures(new Date('2026-06-17T03:00:00Z'))).toBe(true);
  });
  it('le dimanche est toujours hors heures (défaut fermé)', () => {
    // 2026-06-14 dimanche, 16:00 UTC = 12:00 EDT.
    expect(estHorsHeures(new Date('2026-06-14T16:00:00Z'))).toBe(true);
  });
  it('respecte des heures personnalisées', () => {
    // Ouvert le dimanche 10-16 : dimanche midi devient DANS les heures.
    const heures = { 0: [10, 16], 1: [8, 18] };
    expect(estHorsHeures(new Date('2026-06-14T16:00:00Z'), heures)).toBe(false);
  });
});

describe('Réception — aperçu', () => {
  it('compte contacts, hors-heures et valeur captée (leads + taps)', () => {
    const d = db();
    d.prepare('INSERT INTO reception_config (source, secteur, valeur_lead_cents) VALUES (?,?,?)')
      .run('garage-x', 'garage', 35000);
    insLead(d, 'garage-x', { hors: 0 });
    insLead(d, 'garage-x', { hors: 1 });
    insLead(d, 'garage-x', { hors: 1, valeur: 50000 }); // valeur explicite
    d.prepare('INSERT INTO taps (source, canal, hors_heures) VALUES (?,?,?)').run('garage-x', 'tel', 1);

    const a = apercu(d, 'garage-x');
    expect(a.compteurs.contacts).toBe(4);           // 3 leads + 1 tap
    expect(a.compteurs.leads).toBe(3);
    expect(a.compteurs.taps).toBe(1);
    expect(a.compteurs.hors_heures).toBe(3);         // 2 leads + 1 tap
    // valeur : 35000 (défaut) + 35000 (défaut) + 50000 (explicite) = 120000
    expect(a.compteurs.valeur_captee_cents).toBe(120000);
  });

  it('calcule le délai de réponse et le % sous 1 h', () => {
    const d = db();
    insLead(d, 's', { minPassees: 120, statut: 'contacte', repMin: 30 }); // répondu en 30 min
    insLead(d, 's', { minPassees: 120, statut: 'contacte', repMin: 90 }); // répondu en 90 min
    insLead(d, 's', { minPassees: 10, statut: 'nouveau' });                // en attente

    const a = apercu(d, 's');
    expect(a.reponse.repondus).toBe(2);
    expect(a.compteurs.en_attente).toBe(1);
    expect(a.reponse.pct_sous_1h).toBe(50);          // 1 sur 2 sous 60 min
    expect(a.reponse.mediane_minutes).toBeGreaterThan(0);
  });

  it('produit une tendance couvrant toute la fenêtre', () => {
    const d = db();
    insLead(d, 's', { minPassees: 10 });
    const a = apercu(d, 's', { jours: 30 });
    expect(a.tendance.length).toBe(30);
    expect(a.tendance[a.tendance.length - 1].n).toBeGreaterThanOrEqual(1); // aujourd'hui
  });
});

describe('Réception — rapport mensuel', () => {
  it('compte les contacts du mois courant', () => {
    const d = db();
    insLead(d, 's', { minPassees: 60, hors: 1 });
    d.prepare('INSERT INTO taps (source, hors_heures) VALUES (?,?)').run('s', 0);
    const mois = new Date().toISOString().slice(0, 7);
    const r = rapportMensuel(d, 's', mois);
    expect(r.contacts).toBe(2);
    expect(r.formulaires).toBe(1);
    expect(r.clics).toBe(1);
    expect(r.hors_heures).toBe(1);
  });
});

describe('Réception — jeton de rapport signé', () => {
  it('valide seulement le bon jeton', () => {
    const t = jetonRapport('garage-x', 'cle-maitre');
    expect(jetonValide('garage-x', t, 'cle-maitre')).toBe(true);
    expect(jetonValide('garage-x', 'mauvais', 'cle-maitre')).toBe(false);
    expect(jetonValide('autre-site', t, 'cle-maitre')).toBe(false);
  });
});
