import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { ajouter, lister, marquer, brouillonRappel, preparerRappels } from '../core/rdv.js';
import { lister as listerProps, get } from '../core/propositions.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

function iso(msFromNow) {
  // 'YYYY-MM-DD HH:MM' relatif à un instant fixe (pas de Date.now dans le SQL).
  const d = new Date(1765000000000 + msFromNow); // instant fixe reproductible
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const NOW = 1765000000000;

describe('carnet de rendez-vous', () => {
  it('ajoute et liste un RDV à venir', () => {
    ajouter(db, 'salon-x', { client_nom: 'Marie', debut: iso(3600000), service: 'Coupe' });
    // lister() filtre « à venir » via datetime('now') — insérons plutôt loin dans le futur pour être robuste.
    ajouter(db, 'salon-x', { client_nom: 'Luc', debut: '2099-01-01 10:00' });
    const l = lister(db, 'salon-x');
    expect(l.some(r => r.client_nom === 'Luc')).toBe(true);
  });

  it('refuse une date invalide', () => {
    expect(() => ajouter(db, 'salon-x', { client_nom: 'X', debut: 'demain' })).toThrow();
  });

  it('marquer fait/annulé', () => {
    const { id } = ajouter(db, 'salon-x', { debut: '2099-01-01 10:00' });
    expect(marquer(db, id, 'fait')).toBe(true);
    expect(marquer(db, id, 'nimportequoi')).toBe(false);
  });
});

describe('brouillon de rappel', () => {
  it('rappelle le rendez-vous sans rien promettre d\'autre', () => {
    const t = brouillonRappel({ client_nom: 'Marie Tremblay', debut: '2099-06-01 14:30', service: 'Coupe' }, { nomCommerce: 'Salon X' });
    expect(t).toContain('Bonjour Marie,');
    expect(t).toMatch(/rappel/i);
    expect(t).toContain('Coupe');
    expect(t).not.toMatch(/\$|rabais|gratuit/i);
  });
});

describe('préparation des rappels', () => {
  function add(debutMs) {
    return ajouter(db, 'salon-x', { client_nom: 'Client', client_courriel: 'c@x.ca', debut: iso(debutMs) });
  }

  it('prépare un rappel pour un RDV dans la fenêtre (48 h)', () => {
    add(24 * 3600000); // dans 24 h
    const n = preparerRappels(db, 'salon-x', { now: NOW, fenetreH: 48 });
    expect(n).toBe(1);
    const props = listerProps(db, 'salon-x');
    expect(props[0].type).toBe('rappel');
  });

  it('ignore un RDV trop loin ou déjà passé', () => {
    add(5 * 24 * 3600000);  // dans 5 jours
    add(-3600000);          // il y a 1 h
    expect(preparerRappels(db, 'salon-x', { now: NOW, fenetreH: 48 })).toBe(0);
  });

  it('idempotent : un RDV n\'a qu\'un rappel', () => {
    add(12 * 3600000);
    preparerRappels(db, 'salon-x', { now: NOW, fenetreH: 48 });
    expect(preparerRappels(db, 'salon-x', { now: NOW, fenetreH: 48 })).toBe(0);
    expect(listerProps(db, 'salon-x').length).toBe(1);
  });

  it('lie la proposition au RDV (rappel_prop_id)', () => {
    const { id } = add(6 * 3600000);
    preparerRappels(db, 'salon-x', { now: NOW, fenetreH: 48 });
    const r = db.prepare('SELECT rappel_prop_id FROM rendezvous WHERE id = ?').get(id);
    expect(r.rappel_prop_id).toBeGreaterThan(0);
    expect(get(db, r.rappel_prop_id).ref_type).toBe('rdv');
  });
});
