import { describe, it, expect } from 'vitest';
import { construireEntonnoir, SEUIL_FIABLE } from '../core/pulse.js';

// Fabrique N sessions distinctes en dupliquant un gabarit d'événements.
// Chaque session reçoit un session_hash unique.
function sessions(specs) {
  const ev = [];
  specs.forEach((types, i) => {
    const sh = 's' + i;
    for (const t of types) {
      if (typeof t === 'string') ev.push({ type: t, session_hash: sh });
      else ev.push({ type: t.type, etiquette: t.etiquette, session_hash: sh });
    }
  });
  return ev;
}

// Raccourci : n sessions identiques.
function rep(n, types) {
  return Array.from({ length: n }, () => types);
}

describe('construireEntonnoir', () => {
  it('compte les visiteurs par session, pas par événement', () => {
    const ev = [
      { type: 'vue', session_hash: 'a' },
      { type: 'vue', session_hash: 'a' }, // même visite
      { type: 'vue', session_hash: 'b' },
    ];
    const r = construireEntonnoir(ev);
    expect(r.visiteurs).toBe(2);
  });

  it('ignore les événements sans session_hash', () => {
    const r = construireEntonnoir([{ type: 'vue' }, { type: 'vue', session_hash: 'a' }]);
    expect(r.visiteurs).toBe(1);
  });

  it('les étapes sont monotones décroissantes', () => {
    const ev = sessions(rep(30, [
      'vue', { type: 'profondeur', etiquette: 100 },
      { type: 'section', etiquette: 'contact' }, 'form_start', 'form_submit',
    ]));
    const r = construireEntonnoir(ev);
    const n = r.entonnoir.map(e => e.sessions);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeLessThanOrEqual(n[i - 1]);
  });

  it('« exploré » = profondeur >=50 OU >=2 sections', () => {
    const ev = sessions([
      ['vue', { type: 'profondeur', etiquette: 50 }],
      ['vue', { type: 'section', etiquette: 'a' }, { type: 'section', etiquette: 'b' }],
      ['vue'], // n'a pas exploré
    ]);
    const r = construireEntonnoir(ev);
    expect(r.entonnoir[1].sessions).toBe(2);
  });

  it('« vu services/prix » via nom de section de l\'offre', () => {
    const ev = sessions([
      ['vue', { type: 'section', etiquette: 'nos tarifs' }],
      ['vue', { type: 'section', etiquette: 'galerie' }],
    ]);
    const r = construireEntonnoir(ev);
    expect(r.entonnoir[2].sessions).toBe(1);
  });

  it('un clic tél compte comme contact abouti', () => {
    const ev = sessions(rep(30, ['vue', 'tel']));
    const r = construireEntonnoir(ev);
    expect(r.entonnoir[4].sessions).toBe(30);
    expect(r.conversion_pct).toBe(100);
  });

  it('form_start sans envoi = amorce mais pas conversion', () => {
    const ev = sessions(rep(30, ['vue', { type: 'profondeur', etiquette: 75 }, 'form_start']));
    const r = construireEntonnoir(ev);
    expect(r.entonnoir[3].sessions).toBe(30); // amorcé
    expect(r.entonnoir[4].sessions).toBe(0);  // pas contacté
    expect(r.conversion_pct).toBe(0);
  });
});

describe('seuil de fiabilité (honnêteté)', () => {
  it('aucun diagnostic sous le seuil', () => {
    const ev = sessions(rep(SEUIL_FIABLE - 1, ['vue']));
    const r = construireEntonnoir(ev);
    expect(r.fiable).toBe(false);
    expect(r.fuite).toBeNull();
  });

  it('diagnostic disponible au seuil', () => {
    const ev = sessions(rep(SEUIL_FIABLE, ['vue']));
    const r = construireEntonnoir(ev);
    expect(r.fiable).toBe(true);
    expect(r.fuite).not.toBeNull();
  });

  it('entonnoir vide ne plante pas', () => {
    const r = construireEntonnoir([]);
    expect(r.visiteurs).toBe(0);
    expect(r.fiable).toBe(false);
    expect(r.fuite).toBeNull();
    expect(r.conversion_pct).toBe(0);
  });
});

describe('détection du point de fuite', () => {
  it('repère la plus forte chute — accroche (étape 1)', () => {
    // 40 vues, mais seulement 4 explorent : la fuite est en haut de page.
    const ev = sessions([
      ...rep(36, ['vue']),
      ...rep(4, ['vue', { type: 'profondeur', etiquette: 100 }, 'tel']),
    ]);
    const r = construireEntonnoir(ev);
    expect(r.fuite).not.toBeNull();
    expect(r.fuite.entre).toContain('Visiteurs');
    expect(r.fuite.titre).toMatch(/première impression/i);
  });

  it('repère la fuite au formulaire (étape 4)', () => {
    // Tous explorent, voient l'offre, amorcent — mais peu envoient.
    const ev = sessions([
      ...rep(28, ['vue', { type: 'section', etiquette: 'contact' }, 'form_start']),
      ...rep(2, ['vue', { type: 'section', etiquette: 'contact' }, 'form_start', 'form_submit']),
    ]);
    const r = construireEntonnoir(ev);
    expect(r.fuite).not.toBeNull();
    expect(r.fuite.entre).toContain('Vous ont contacté');
    expect(r.fuite.titre).toMatch(/formulaire|envoi|n'envoient/i);
  });

  it('la fuite porte un levier concret', () => {
    const ev = sessions(rep(30, ['vue']));
    const r = construireEntonnoir(ev);
    expect(typeof r.fuite.levier).toBe('string');
    expect(r.fuite.levier.length).toBeGreaterThan(10);
  });
});
