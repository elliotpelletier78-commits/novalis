import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import {
  definirEntreprise, definirConsentement, definirConnexion, assurerClient, etat, CONNEXIONS,
} from '../core/branchement.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

const IDENTITE = { nom: 'Garage Test', secteur: 'garage', ville: 'Montréal', telephone: '514 555-0123', courriel: 'info@test.ca' };

describe('branchement — identité & client', () => {
  it('crée un client_id lié à une nouvelle entreprise', () => {
    const id = definirEntreprise(db, 'garage-test', IDENTITE);
    expect(id).toBeGreaterThan(1); // 1 = tenant interne
    const e = etat(db, 'garage-test');
    expect(e.existe).toBe(true);
    expect(e.client_id).toBe(id);
    expect(e.identite.complete).toBe(true);
  });

  it('« novalis » est relié au tenant interne (id=1)', () => {
    expect(assurerClient(db, 'novalis', null)).toBe(1);
  });

  it('rejette une source invalide', () => {
    expect(() => definirEntreprise(db, 'A B!', IDENTITE)).toThrow();
  });

  it('réutilise le même client_id au second appel (pas de doublon)', () => {
    const a = definirEntreprise(db, 'garage-test', IDENTITE);
    const b = definirEntreprise(db, 'garage-test', { ville: 'Laval' });
    expect(b).toBe(a);
  });

  it('brancher AVANT de sauver l\'identité lie quand même le bon client_id', () => {
    // Ordre « connexion d'abord » : assurerClient doit persister le lien tout de
    // suite, sinon le secret serait stocké sous un client_id orphelin.
    const idCx = assurerClient(db, 'garage-test', null);
    const idEnt = definirEntreprise(db, 'garage-test', IDENTITE);
    expect(idEnt).toBe(idCx);
    expect(etat(db, 'garage-test').client_id).toBe(idCx);
  });

  it('consentement d\'abord ne crée pas de clients orphelins ni de client_id NULL', () => {
    const nClients = () => db.prepare('SELECT COUNT(*) n FROM clients').get().n;
    const avant = nClients();
    definirConsentement(db, 'garage-test', { rediger: true });
    const e1 = etat(db, 'garage-test');
    expect(e1.client_id).not.toBeNull();
    definirEntreprise(db, 'garage-test', IDENTITE);
    definirConnexion(db, 'garage-test', 'courriel', { statut: 'branche', label: 'x@y.ca' });
    // Un seul client créé pour cette entreprise, malgré 3 points d'entrée.
    expect(nClients()).toBe(avant + 1);
    expect(etat(db, 'garage-test').client_id).toBe(e1.client_id);
  });

  it('identité incomplète = complete:false', () => {
    definirEntreprise(db, 'garage-test', { nom: 'Garage Test' });
    expect(etat(db, 'garage-test').identite.complete).toBe(false);
  });
});

describe('branchement — connexions', () => {
  it('fusionne le catalogue avec l\'état stocké', () => {
    definirEntreprise(db, 'garage-test', IDENTITE);
    const e = etat(db, 'garage-test');
    expect(e.connexions.length).toBe(CONNEXIONS.length);
    expect(e.connexions.every(c => c.statut === 'a_brancher')).toBe(true);
  });

  it('branche le courriel', () => {
    definirEntreprise(db, 'garage-test', IDENTITE);
    definirConnexion(db, 'garage-test', 'courriel', { statut: 'branche', label: 'info@test.ca' });
    const cx = etat(db, 'garage-test').connexions.find(c => c.type === 'courriel');
    expect(cx.statut).toBe('branche');
    expect(cx.compte_label).toBe('info@test.ca');
  });

  it('rejette un type de connexion inconnu', () => {
    definirEntreprise(db, 'garage-test', IDENTITE);
    expect(() => definirConnexion(db, 'garage-test', 'nimportequoi', { statut: 'branche' })).toThrow();
  });
});

describe('branchement — consentements & progression', () => {
  it('consentements par défaut à false', () => {
    definirEntreprise(db, 'garage-test', IDENTITE);
    const e = etat(db, 'garage-test');
    expect(e.consent).toEqual({ rediger: false, envoyer: false, accuse: false, operer: false });
  });

  it('enregistre les consentements sans les écraser mutuellement', () => {
    definirEntreprise(db, 'garage-test', IDENTITE);
    definirConsentement(db, 'garage-test', { rediger: true });
    definirConsentement(db, 'garage-test', { envoyer: true });
    const e = etat(db, 'garage-test');
    expect(e.consent.rediger).toBe(true);
    expect(e.consent.envoyer).toBe(true);
    expect(e.consent.operer).toBe(false);
  });

  it('progression 0% pour une entreprise vide', () => {
    const e = etat(db, 'inconnue-x');
    expect(e.existe).toBe(false);
    expect(e.pret_pct).toBe(0);
    expect(e.pret).toBe(false);
  });

  it('« prêt à opérer » exige identité + site + courriel + 2 consentements', () => {
    definirEntreprise(db, 'garage-test', { ...IDENTITE, siteUrl: 'https://garage-test.ca' });
    definirConnexion(db, 'garage-test', 'courriel', { statut: 'branche', label: 'info@test.ca' });
    definirConsentement(db, 'garage-test', { rediger: true, envoyer: true });
    const e = etat(db, 'garage-test');
    expect(e.pret).toBe(true);
    expect(e.pret_pct).toBe(100);
  });

  it('sans le courriel branché, pas prêt', () => {
    definirEntreprise(db, 'garage-test', { ...IDENTITE, siteUrl: 'https://garage-test.ca' });
    definirConsentement(db, 'garage-test', { rediger: true, envoyer: true });
    const e = etat(db, 'garage-test');
    expect(e.pret).toBe(false);
    expect(e.pret_pct).toBe(80);
  });
});
