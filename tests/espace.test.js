import { describe, it, expect } from 'vitest';
import { jetonEspace, jetonEspaceValide } from '../core/branchement.js';

describe('jeton d\'espace commerçant (lien magique)', () => {
  const KEY = 'a'.repeat(64);

  it('un jeton valide est accepté', () => {
    const j = jetonEspace('garage-x', KEY);
    expect(jetonEspaceValide('garage-x', j, KEY)).toBe(true);
  });

  it('un jeton d\'une AUTRE entreprise est refusé (isolation)', () => {
    const j = jetonEspace('garage-x', KEY);
    expect(jetonEspaceValide('salon-y', j, KEY)).toBe(false);
  });

  it('un jeton forgé est refusé', () => {
    expect(jetonEspaceValide('garage-x', 'deadbeef', KEY)).toBe(false);
    expect(jetonEspaceValide('garage-x', '', KEY)).toBe(false);
  });

  it('la clé maître change le jeton (pas devinable sans elle)', () => {
    expect(jetonEspace('garage-x', KEY)).not.toBe(jetonEspace('garage-x', 'b'.repeat(64)));
  });

  it('le jeton diffère du jeton de rapport (usages distincts)', async () => {
    const { jetonRapport } = await import('../core/reception.js');
    expect(jetonEspace('garage-x', KEY)).not.toBe(jetonRapport('garage-x', KEY));
  });
});
