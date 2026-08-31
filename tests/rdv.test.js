import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { ajouter, lister, marquer, brouillonRappel, preparerRappels, montrealWall, prochainDebut, genererProchaine, RECURRENCES } from '../core/rdv.js';
import { lister as listerProps, get } from '../core/propositions.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

// Instant fixe reproductible ; `debut` construit en HEURE MURALE DE MONTRÉAL,
// comme le stocke l'application (les comparaisons se font dans ce fuseau).
const NOW = 1765000000000;
function iso(msFromNow) { return montrealWall(NOW + msFromNow).slice(0, 16); }

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

  it('annuler un RDV rejette le rappel déjà préparé (pas de rappel fantôme)', () => {
    const { id } = ajouter(db, 'salon-x', { client_nom: 'Marie', client_courriel: 'm@x.ca', debut: montrealWall(NOW + 12 * 3600000).slice(0, 16) });
    expect(preparerRappels(db, 'salon-x', { nowMs: NOW, fenetreH: 48 })).toBe(1);
    const propId = db.prepare('SELECT rappel_prop_id FROM rendezvous WHERE id = ?').get(id).rappel_prop_id;
    expect(get(db, propId).statut).toBe('en_attente');
    marquer(db, id, 'annule');
    expect(get(db, propId).statut).toBe('rejete');
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

describe('rendez-vous récurrents', () => {
  it('prochainDebut ajoute des jours (aux 2 semaines)', () => {
    expect(prochainDebut('2026-08-19 09:30:00', RECURRENCES['2sem'])).toBe('2026-09-02 09:30:00');
  });
  it('prochainDebut ajoute des mois en conservant l’heure (aux 6 mois)', () => {
    expect(prochainDebut('2026-08-19 09:30:00', RECURRENCES['6mois'])).toBe('2027-02-19 09:30:00');
  });
  it('prochainDebut gère le débordement de fin de mois (31 jan + 1 mois → 28 fév)', () => {
    expect(prochainDebut('2026-01-31 08:00:00', RECURRENCES.mensuel)).toBe('2026-02-28 08:00:00');
  });
  it('marquer « fait » génère la prochaine occurrence UNE seule fois', () => {
    const { id } = ajouter(db, 'garage-x', { client_nom: 'M. Roy', debut: '2026-08-19 09:30', service: 'Vidange', recurrence: '6mois' });
    marquer(db, id, 'fait');
    const suite = db.prepare("SELECT * FROM rendezvous WHERE source='garage-x' AND statut='prevu'").all();
    expect(suite.length).toBe(1);
    expect(suite[0].debut).toBe('2027-02-19 09:30:00');
    expect(suite[0].recurrence).toBe('6mois');
    expect(suite[0].recur_parent).toBe(id);
    // idempotence : re-marquer ne recrée pas
    marquer(db, id, 'fait');
    expect(genererProchaine(db, id)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) n FROM rendezvous WHERE source='garage-x'").get().n).toBe(2);
  });
  it('un RDV ponctuel marqué « fait » ne génère rien', () => {
    const { id } = ajouter(db, 'garage-x', { client_nom: 'A', debut: '2026-08-19 09:30' });
    marquer(db, id, 'fait');
    expect(db.prepare("SELECT COUNT(*) n FROM rendezvous WHERE source='garage-x'").get().n).toBe(1);
  });
  it('ignore une récurrence inconnue (traité comme ponctuel)', () => {
    const { id } = ajouter(db, 'garage-x', { client_nom: 'A', debut: '2026-08-19 09:30', recurrence: 'zzz' });
    expect(db.prepare('SELECT recurrence FROM rendezvous WHERE id=?').get(id).recurrence).toBeNull();
  });
});

describe('rappel par SMS quand le téléphone est connu', () => {
  it('le destinataire du rappel est le numéro (→ canal SMS), sinon le courriel', () => {
    ajouter(db, 'g', { client_nom: 'A', client_telephone: '514 555-0100', client_courriel: 'a@x.ca', debut: iso(6 * 3600000), service: 'X' });
    ajouter(db, 'g', { client_nom: 'B', client_courriel: 'b@x.ca', debut: iso(6 * 3600000), service: 'Y' });
    preparerRappels(db, 'g', { now: NOW, fenetreH: 48 });
    const dests = db.prepare("SELECT destinataire FROM propositions WHERE source='g' AND type='rappel' ORDER BY id").all().map(r => r.destinataire);
    expect(dests).toContain('514 555-0100'); // A → SMS
    expect(dests).toContain('b@x.ca');       // B → courriel
  });
});
