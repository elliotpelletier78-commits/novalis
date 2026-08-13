import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import {
  brouillonReponse, brouillonAvis, brouillonRelance, creerReponsePourLead, creerAvisPourLead,
  preparerRelances, preparerFidelisations, sujetPour, lister, compteurs, get,
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

describe('pilote Réputation (avis)', () => {
  it('rédige une demande d\'avis chaleureuse, sans incitatif', () => {
    const t = brouillonAvis({ nom: 'Marie Tremblay' }, { nomCommerce: 'Garage X' });
    expect(t).toContain('Bonjour Marie,');
    expect(t).toMatch(/avis Google|votre expérience/i);
    expect(t).not.toMatch(/rabais|gratuit|cadeau|\$|concours/i);
  });

  it('inclut le lien d\'avis quand il est connu', () => {
    const t = brouillonAvis({ nom: 'Marie' }, { nomCommerce: 'G', lienAvis: 'https://g.page/r/xyz' });
    expect(t).toContain('https://g.page/r/xyz');
  });

  it('crée une proposition d\'avis pour un lead gagné', () => {
    const r = creerAvisPourLead(db, lead(), { nomCommerce: 'Garage X' });
    expect(r).not.toBeNull();
    const p = get(db, r.id);
    expect(p.type).toBe('avis');
  });

  it('réponse et avis coexistent pour le même lead (types distincts)', () => {
    const l = lead();
    creerReponsePourLead(db, l, {});
    creerAvisPourLead(db, l, {});
    expect(lister(db, 'garage-x').length).toBe(2);
  });

  it('ne crée pas deux demandes d\'avis pour le même lead', () => {
    const l = lead();
    creerAvisPourLead(db, l, {});
    expect(creerAvisPourLead(db, l, {})).toBeNull();
  });

  it('sujet distinct selon le type', () => {
    expect(sujetPour('avis', { nomCommerce: 'G' })).toMatch(/confiance/i);
    expect(sujetPour('reponse', { nomCommerce: 'G' })).toMatch(/reçu votre message/i);
  });
});

describe('Réponse Instantanée (accusé de réception)', () => {
  it('accuse réception sans rien promettre de précis', async () => {
    const { accuseReception } = await import('../core/propositions.js');
    const t = accuseReception({ nom: 'Marie Tremblay' }, { nomCommerce: 'Garage X' });
    expect(t).toContain('Bonjour Marie,');
    expect(t).toContain('bien arrivé');
    // Aucune promesse chiffrée : ni prix, ni délai précis, ni engagement.
    expect(t).not.toMatch(/\$|\bheure\b|\d+\s*(min|minutes|jours|h)\b|demain|aujourd'hui/i);
  });

  it('reste correct sans nom', async () => {
    const { accuseReception } = await import('../core/propositions.js');
    expect(accuseReception({}, { nomCommerce: 'G' })).toContain('Bonjour,');
  });
});

describe('pilote Relance (clients silencieux)', () => {
  // Insère un lead avec un created_at contrôlé (jours dans le passé).
  function leadAge(jours, over = {}) {
    const info = db.prepare(
      `INSERT INTO leads (source, nom, courriel, message, statut, created_at)
       VALUES (?,?,?,?,?, datetime('now', ?))`
    ).run(over.source || 'garage-x', over.nom || 'Paul Roy', over.courriel || 'paul@ex.ca',
      over.message || 'Demande de soumission pour une toiture', over.statut || 'nouveau', `-${jours} days`);
    return info.lastInsertRowid;
  }

  it('rédige une relance douce, sans insistance', () => {
    const t = brouillonRelance({ nom: 'Paul Roy', message: 'toiture' }, { nomCommerce: 'Toitures X' });
    expect(t).toContain('Bonjour Paul,');
    expect(t).toMatch(/pas l'avoir manqu/i);
    expect(t).not.toMatch(/urgent|dernière chance|vite/i);
  });

  it('relance les leads silencieux plus vieux que le seuil', () => {
    leadAge(5); // vieux → à relancer
    const n = preparerRelances(db, 'garage-x', { jours: 3 });
    expect(n).toBe(1);
    expect(get(db, lister(db, 'garage-x')[0].id).type).toBe('relance');
  });

  it('ne relance pas un lead trop récent', () => {
    leadAge(1);
    expect(preparerRelances(db, 'garage-x', { jours: 3 })).toBe(0);
  });

  it('ne relance pas un lead gagné ou perdu', () => {
    leadAge(10, { statut: 'gagne' });
    leadAge(10, { statut: 'perdu' });
    expect(preparerRelances(db, 'garage-x', { jours: 3 })).toBe(0);
  });

  it('idempotent : un lead n\'est relancé qu\'une fois', () => {
    leadAge(5);
    preparerRelances(db, 'garage-x', { jours: 3 });
    expect(preparerRelances(db, 'garage-x', { jours: 3 })).toBe(0);
    expect(lister(db, 'garage-x').length).toBe(1);
  });

  it('sujet de relance distinct', () => {
    expect(sujetPour('relance', { nomCommerce: 'G' })).toMatch(/revient vers vous/i);
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

describe('pilote Fidélisation (anciens clients gagnés)', () => {
  function leadGagne(moisPasses, over = {}) {
    const info = db.prepare(
      `INSERT INTO leads (source, nom, courriel, message, statut, created_at)
       VALUES (?,?,?,?, 'gagne', datetime('now', ?))`
    ).run(over.source || 'garage-x', over.nom || 'Marie Roy', over.courriel || 'm@x.ca', 'ancien job', `-${moisPasses} months`);
    return info.lastInsertRowid;
  }

  it('rédige une invitation à revenir, adaptée au secteur, sans incitatif', async () => {
    const { brouillonFidelisation } = await import('../core/propositions.js');
    const t = brouillonFidelisation({ nom: 'Marie Roy' }, { nomCommerce: 'Garage X', secteur: 'garage' });
    expect(t).toContain('Bonjour Marie,');
    expect(t).toMatch(/entretien/i);
    expect(t).not.toMatch(/rabais|gratuit|\$|concours/i);
  });

  it('relance un client gagné dans la fenêtre (6–18 mois)', () => {
    leadGagne(9);
    expect(preparerFidelisations(db, 'garage-x', {})).toBe(1);
    expect(lister(db, 'garage-x')[0].type).toBe('fidelisation');
  });

  it('ignore un client trop récent (<6 mois) ou trop vieux (>18 mois)', () => {
    leadGagne(2);
    leadGagne(24);
    expect(preparerFidelisations(db, 'garage-x', {})).toBe(0);
  });

  it('idempotent : un client gagné n\'est relancé qu\'une fois', () => {
    leadGagne(9);
    preparerFidelisations(db, 'garage-x', {});
    expect(preparerFidelisations(db, 'garage-x', {})).toBe(0);
  });

  it('sujet distinct', () => {
    expect(sujetPour('fidelisation', { nomCommerce: 'G' })).toMatch(/vos nouvelles/i);
  });
});

describe('pilote Publications', () => {
  it('met en forme l\'essentiel fourni, sans rien inventer', async () => {
    const { brouillonPublication } = await import('../core/propositions.js');
    const t = brouillonPublication('promo', 'Rabais 15% sur les pneus dhiver', { nomCommerce: 'Garage X', telephone: '514 555-0123' });
    expect(t).toContain('Rabais 15% sur les pneus dhiver'); // la substance du commerçant
    expect(t).toContain('Garage X');
    expect(t).toContain('514 555-0123');
    expect(t).toMatch(/Offre du moment/);
  });
  it('crée une proposition de type publication (non idempotente)', async () => {
    const { creerPublication } = await import('../core/propositions.js');
    creerPublication(db, 'garage-x', { theme: 'annonce', essentiel: 'Ouvert samedi', cfg: {} });
    creerPublication(db, 'garage-x', { theme: 'annonce', essentiel: 'Ouvert samedi', cfg: {} });
    const props = lister(db, 'garage-x');
    expect(props.length).toBe(2);
    expect(props[0].type).toBe('publication');
  });
});
