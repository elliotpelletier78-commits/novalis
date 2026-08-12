import { describe, it, expect } from 'vitest';
import { prioriteDuJour } from '../core/priorite.js';

describe('priorité du jour', () => {
  it('un client en attente passe avant tout', () => {
    const p = prioriteDuJour({
      leads_attente: [{ nom: 'Luc Gagnon', ilya: '2 h' }],
      propositions: [{ type: 'reponse' }],
      fuite: { fiable: true, fuite: { titre: 'x', levier: 'y' } },
      pret_pct: 40,
    });
    expect(p.ton).toBe('urgent');
    expect(p.titre).toContain('Luc Gagnon');
    expect(p.lien).toBe('reception');
  });

  it('sinon, approuver les propositions préparées', () => {
    const p = prioriteDuJour({ leads_attente: [], propositions: [{}, {}], pret_pct: 100 });
    expect(p.ton).toBe('action');
    expect(p.titre).toMatch(/2 propositions/);
    expect(p.lien).toBe('propositions');
  });

  it('singulier pour une seule proposition', () => {
    const p = prioriteDuJour({ propositions: [{}], pret_pct: 100 });
    expect(p.titre).toMatch(/la proposition préparée/);
  });

  it('sinon, la fuite Pulse fiable', () => {
    const p = prioriteDuJour({
      leads_attente: [], propositions: [],
      fuite: { fiable: true, fuite: { titre: 'Première impression', levier: 'Une photo forte' } },
      pret_pct: 100,
    });
    expect(p.ton).toBe('info');
    expect(p.titre).toBe('Première impression');
    expect(p.sousTitre).toBe('Une photo forte');
  });

  it('une fuite non fiable est ignorée', () => {
    const p = prioriteDuJour({ fuite: { fiable: false }, pret_pct: 100 });
    expect(p.ton).toBe('calme');
  });

  it('sinon, terminer le branchement', () => {
    const p = prioriteDuJour({ pret_pct: 60 });
    expect(p.titre).toMatch(/branchement \(60%\)/);
    expect(p.lien).toBe('branchement');
  });

  it('tout à jour = ton calme', () => {
    const p = prioriteDuJour({ leads_attente: [], propositions: [], fuite: null, pret_pct: 100 });
    expect(p.ton).toBe('calme');
    expect(p.titre).toBe('Tout est à jour');
  });

  it('robuste aux entrées vides', () => {
    expect(() => prioriteDuJour()).not.toThrow();
    expect(prioriteDuJour().ton).toBe('info'); // pret_pct 0 → terminer branchement
  });
});
