import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import {
  brouillonReponse, creerReponsePourLead, lister, compteurs, get,
  modifier, rejeter, approuver, _prenom, _accroche,
} from '../core/propositions.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

function lead(over = {}) {
  const base = { source: 'garage-x', nom: 'Marie Tremblay', courriel: 'marie@ex.ca', message: 'Bonjour, avez-vous des disponibilités cette semaine pour un changement de pneus ?' };
  const l = { ...base, ...over };
  const info = db.prepare('INSERT INTO leads (source, nom, courriel, message) VALUES (?,?,?,?)')
    .run(l.source, l.nom, l.courriel, l.message);
  l.id = info.lastInsertRowid;
  return l;
}

describe('brouillon de réponse', () => {
  it('salue par le prénom et signe au nom du commerce', () => {
    const t = brouillonReponse({ nom: 'Marie Tremblay', message: 'Question sur vos pneus' }, { nomCommerce: 'Garage Beauchemin' });
    expect(t).toContain('Bonjour Marie,');
    expect(t.trim().endsWith('Garage Beauchemin')).toBe(true);
  });

  it('reprend l\'accroche du message', () => {
    const t = brouillonReponse({ nom: 'Marie', message: 'changement de pneus' }, { nomCommerce: 'G' });
    expect(t).toContain('changement de pneus');
  });

  it('adapte le texte hors des heures', () => {
    const t = brouillonReponse({ nom: 'Marie', message: 'x' }, { nomCommerce: 'G', horsHeures: true });
    expect(t).toMatch(/heures d'ouverture/);
  });

  it('n\'invente aucun prix ni délai précis', () => {
    const t = brouillonReponse({ nom: 'Marie', message: 'combien pour 4 pneus ?' }, { nomCommerce: 'G' });
    expect(t).not.toMatch(/\$|\bheures?\b.*\d|\d+\s*(jours|minutes)/i);
  });

  it('salutation neutre si le nom manque', () => {
    expect(brouillonReponse({ message: 'x' }, {})).toContain('Bonjour,');
  });

  it('prénom/accroche : helpers robustes', () => {
    expect(_prenom('Jean-Marc Aurèle')).toBe('Jean-Marc');
    expect(_prenom('')).toBeNull();
    expect(_accroche('  trop   d\'espaces  ')).toBe('trop d\'espaces');
  });
});

describe('création idempotente', () => {
  it('crée une proposition pour un lead', () => {
    const r = creerReponsePourLead(db, lead(), { nomCommerce: 'Garage X' });
    expect(r).not.toBeNull();
    expect(lister(db, 'garage-x').length).toBe(1);
  });

  it('ne crée pas deux propositions pour le même lead', () => {
    const l = lead();
    creerReponsePourLead(db, l, { nomCommerce: 'Garage X' });
    const second = creerReponsePourLead(db, l, { nomCommerce: 'Garage X' });
    expect(second).toBeNull();
    expect(lister(db, 'garage-x').length).toBe(1);
  });

  it('hors heures = priorité plus haute', () => {
    creerReponsePourLead(db, lead(), { horsHeures: true });
    expect(get(db, 1).priorite).toBe(10);
  });
});

describe('modifier / rejeter', () => {
  it('modifier remplace le brouillon, reste en attente', () => {
    creerReponsePourLead(db, lead(), {});
    modifier(db, 1, 'Nouveau texte');
    const p = get(db, 1);
    expect(p.brouillon).toBe('Nouveau texte');
    expect(p.statut).toBe('en_attente');
  });

  it('rejeter sort la proposition de la file', () => {
    creerReponsePourLead(db, lead(), {});
    rejeter(db, 1);
    expect(lister(db, 'garage-x', { statut: 'en_attente' }).length).toBe(0);
    expect(get(db, 1).statut).toBe('rejete');
  });

  it('on ne modifie pas une proposition déjà traitée', () => {
    creerReponsePourLead(db, lead(), {});
    rejeter(db, 1);
    expect(modifier(db, 1, 'x').ok).toBe(false);
  });
});

describe('approuver', () => {
  it('sans consentement d\'envoi → approuvé, à envoyer à la main (jamais faux envoi)', async () => {
    creerReponsePourLead(db, lead(), {});
    const r = await approuver(db, 1, { peutEnvoyer: false });
    expect(r.ok).toBe(true);
    expect(r.envoye).toBe(false);
    expect(get(db, 1).statut).toBe('approuve');
  });

  it('avec consentement + mailer configuré → envoyé', async () => {
    creerReponsePourLead(db, lead(), {});
    const mailer = { configured: true, envoyer: async () => ({ sent: true, status: 200 }) };
    const r = await approuver(db, 1, { peutEnvoyer: true, mailer });
    expect(r.envoye).toBe(true);
    expect(get(db, 1).statut).toBe('envoye');
  });

  it('échec d\'envoi → statut echec + détail, pas « envoyé »', async () => {
    creerReponsePourLead(db, lead(), {});
    const mailer = { configured: true, envoyer: async () => ({ sent: false, reason: 'domaine non vérifié' }) };
    const r = await approuver(db, 1, { peutEnvoyer: true, mailer });
    expect(r.ok).toBe(false);
    expect(get(db, 1).statut).toBe('echec');
    expect(get(db, 1).detail).toMatch(/domaine/);
  });

  it('mailer non configuré → approuvé, pas envoyé', async () => {
    creerReponsePourLead(db, lead(), {});
    const mailer = { configured: false, envoyer: async () => ({ sent: false }) };
    const r = await approuver(db, 1, { peutEnvoyer: true, mailer });
    expect(r.envoye).toBe(false);
    expect(get(db, 1).statut).toBe('approuve');
  });

  it('compteurs reflètent la file', async () => {
    creerReponsePourLead(db, lead(), {});
    creerReponsePourLead(db, lead({ nom: 'Paul' }), {});
    await approuver(db, 1, { peutEnvoyer: false });
    const c = compteurs(db, 'garage-x');
    expect(c.en_attente).toBe(1);
    expect(c.approuve).toBe(1);
  });
});
