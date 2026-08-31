import { describe, it, expect } from 'vitest';
import { analyser, resume, interpreterCommande } from '../core/nova.js';

describe('Nova — analyse', () => {
  it('un client en attente = observation urgente', () => {
    const r = analyser({ leadsAttente: 2, pretPct: 100, servicesCount: 1 });
    expect(r[0].gravite).toBe('urgent');
    expect(r[0].titre).toMatch(/2 clients attendent/);
    expect(r[0].action.lien).toBe('reception');
  });

  it('les urgents passent avant les occasions et les infos', () => {
    const r = analyser({ leadsAttente: 1, propositions: 3, pretPct: 40, servicesCount: 1 });
    const ordre = r.map(i => i.gravite);
    expect(ordre.indexOf('urgent')).toBeLessThan(ordre.indexOf('occasion'));
    expect(ordre.indexOf('occasion')).toBeLessThan(ordre.indexOf('info'));
  });

  it('réponse trop lente = urgent (avec assez de réponses mesurées)', () => {
    const r = analyser({ pctSous1h: 30, repondus: 5, pretPct: 100, servicesCount: 1 });
    expect(r.some(i => i.gravite === 'urgent' && /trop lentement/.test(i.titre))).toBe(true);
  });

  it('ne juge pas la lenteur sur trop peu de réponses', () => {
    const r = analyser({ pctSous1h: 0, repondus: 1, pretPct: 100, servicesCount: 1 });
    expect(r.some(i => /trop lentement/.test(i.titre))).toBe(false);
  });

  it('propose la réponse instantanée seulement si non active et hors-heures reçus', () => {
    expect(analyser({ accuseActif: false, horsHeures: 3, pretPct: 100, servicesCount: 1 })
      .some(i => /instantanée/.test(i.titre))).toBe(true);
    expect(analyser({ accuseActif: true, horsHeures: 3, pretPct: 100, servicesCount: 1 })
      .some(i => /instantanée/.test(i.titre))).toBe(false);
  });

  it('suggère de demander des avis aux clients gagnés', () => {
    const r = analyser({ gagnesSansAvis: 2, pretPct: 100, servicesCount: 1 });
    expect(r.some(i => /avis/.test(i.titre))).toBe(true);
  });

  it('branchement incomplet et services vides = infos', () => {
    const r = analyser({ pretPct: 60, servicesCount: 0 });
    expect(r.some(i => /branchement/.test(i.titre))).toBe(true);
    expect(r.some(i => /services/.test(i.titre))).toBe(true);
  });

  it('reprend la fuite Pulse fiable', () => {
    const r = analyser({ pretPct: 100, servicesCount: 1, fuite: { fiable: true, fuite: { titre: 'Première impression', levier: 'Une photo forte' } } });
    expect(r.some(i => i.titre === 'Première impression')).toBe(true);
  });

  it('entreprise saine = aucune observation', () => {
    const r = analyser({ leadsAttente: 0, propositions: 0, pretPct: 100, servicesCount: 1, accuseActif: true, gagnesSansAvis: 0, fuite: null });
    expect(r.length).toBe(0);
  });
});

describe('Nova — interpréteur de commandes', () => {
  it('approuver par nom', () => {
    const c = interpreterCommande('approuve la réponse à Luc Gagnon');
    expect(c.action).toBe('approuver');
    expect(c.cible).toMatch(/Luc Gagnon/);
    expect(c.tout).toBe(false);
  });
  it('approuver tout', () => {
    const c = interpreterCommande('approuve tout');
    expect(c.action).toBe('approuver');
    expect(c.tout).toBe(true);
  });
  it('rejeter par nom', () => {
    const c = interpreterCommande('rejette la relance de Paul');
    expect(c.action).toBe('rejeter');
    expect(c.cible).toMatch(/Paul/);
  });
  it('activer la réponse instantanée', () => {
    expect(interpreterCommande('active la réponse instantanée 24/7')).toEqual({ action: 'activer', quoi: 'accuse' });
  });
  it('activer l\'envoi', () => {
    expect(interpreterCommande('active l\'envoi après approbation')).toEqual({ action: 'activer', quoi: 'envoyer' });
  });
  it('une question normale n\'est pas une commande', () => {
    expect(interpreterCommande('pourquoi je perds des clients ?')).toBeNull();
    expect(interpreterCommande('combien de contacts ce mois-ci ?')).toBeNull();
  });
  it('une QUESTION contenant un verbe d\'action n\'exécute rien', () => {
    expect(interpreterCommande('peux-tu supprimer le rendez-vous de Marie ?')).toBeNull();
    expect(interpreterCommande('est-ce que je devrais approuver la réponse ?')).toBeNull();
  });
  it('une NÉGATION n\'exécute rien', () => {
    expect(interpreterCommande('je ne veux pas rejeter cette idée')).toBeNull();
  });
  it('accepte une adresse polie « Nova, … »', () => {
    expect(interpreterCommande('Nova, approuve tout')).toEqual({ action: 'approuver', cible: null, tout: true });
  });
});

describe('Nova — résumé', () => {
  it('phrase de calme quand rien à signaler', () => {
    expect(resume([])).toMatch(/à jour|rien ne requiert/i);
  });
  it('compte les urgents et les occasions', () => {
    const r = analyser({ leadsAttente: 1, propositions: 2, pretPct: 100, servicesCount: 1 });
    const s = resume(r);
    expect(s).toMatch(/urgente/);
    expect(s).toMatch(/occasion/);
  });
});

describe('nova — paiements & réputation', () => {
  it('repère les paiements en attente avec le montant', () => {
    const r = analyser({ paiementsAttente: 2, paiementsAttenteCents: 80000, pretPct: 100, servicesCount: 1 });
    const p = r.find(i => /paiement/i.test(i.titre));
    expect(p).toBeTruthy();
    expect(p.gravite).toBe('occasion');
    expect(p.titre).toMatch(/800/); // 80000 cents = 800 $
    expect(p.action.lien).toBe('clients');
  });
  it('suggère d’afficher les avis quand il y en a mais aucun affiché', () => {
    const r = analyser({ avisTotal: 3, avisAffiches: 0, pretPct: 100, servicesCount: 1 });
    const a = r.find(i => /affichez/i.test(i.titre));
    expect(a).toBeTruthy();
    expect(a.action.lien).toBe('avis');
  });
  it('ne suggère rien sur les avis quand ils sont déjà affichés', () => {
    const r = analyser({ avisTotal: 3, avisAffiches: 3, pretPct: 100, servicesCount: 1 });
    expect(r.find(i => /affichez/i.test(i.titre))).toBeFalsy();
  });
});
