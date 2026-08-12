import { describe, it, expect } from 'vitest';
import { buildTemoignages, buildCinematicTemoignages, buildHeroBadge, buildHeroStats } from '../generate.js';
import demoProspect from '../core/pipelines/demo-prospect.js';

const { extraireAvis } = demoProspect;

// Ces tests verrouillent la promesse du propriétaire : les sites générés ne
// contiennent AUCUN contenu inventé (faux avis, faux noms, fausse note, fausse
// année). On n'affiche que ce qui est réel — sinon, un état honnête.

const FAUX_NOMS = ['Marie', 'Jean', 'Sophie', 'Pierre', 'Julie', 'Marc', 'Nathalie', 'Éric', 'Louise', 'André'];

describe('honnêteté — aucun avis inventé', () => {
  for (const build of [buildTemoignages, buildCinematicTemoignages]) {
    it(`${build.name} : sans données, aucun faux nom ni fausse citation`, () => {
      const html = build('garage', 'Laval', {});
      expect(FAUX_NOMS.some(n => new RegExp('>' + n + ' ').test(html))).toBe(false);
      expect(html).toMatch(/afficheront ici/); // état honnête à la place
    });

    it(`${build.name} : avec de vrais avis, ils sont affichés`, () => {
      const html = build('garage', 'Laval', {
        avis: [{ text: 'Service impeccable et rapide, je recommande vivement.', author: 'Réal Bergeron' }],
      });
      expect(html).toContain('Service impeccable');
      expect(html).toContain('Réal Bergeron');
    });

    it(`${build.name} : sans avis mais avec vraie note, montre la note (pas de citation inventée)`, () => {
      const html = build('salon', 'Laval', { avisGoogle: '4.7', avisCount: 88 });
      expect(html).toContain('4.7');
      expect(html).toMatch(/88 avis Google/);
      expect(FAUX_NOMS.some(n => new RegExp('>' + n + ' ').test(html))).toBe(false);
    });
  }
});

describe('honnêteté — badge et stats du héros', () => {
  it('sans note réelle : aucune étoile ni compteur inventé', () => {
    const badge = buildHeroBadge('garage', 'Laval', {});
    expect(badge).not.toContain('★');
    expect(badge).toContain('Laval');
    const stats = buildHeroStats('garage', 'Laval', {});
    expect(stats).not.toMatch(/\d+ avis/);
    expect(stats).not.toContain('24/7');
    expect(stats).not.toMatch(/depuis \d{4}/);
  });

  it('avec note réelle : l\'affiche', () => {
    const badge = buildHeroBadge('garage', 'Laval', { avisGoogle: '4.8', avisCount: 127 });
    expect(badge).toContain('4.8');
    expect(badge).toMatch(/127 avis Google/);
  });

  it('année de fondation affichée seulement si réelle', () => {
    expect(buildHeroStats('garage', 'Laval', { anneeFondation: 2009 })).toMatch(/2009/);
    expect(buildHeroStats('garage', 'Laval', { anneeFondation: undefined })).not.toMatch(/\d{4}/);
  });
});

describe('honnêteté — extraction des vrais avis du prospect', () => {
  it('récupère les avis JSON-LD Review réels', () => {
    const html = `<script type="application/ld+json">{"@type":"Review",
      "reviewBody":"Excellent service, très professionnel et à l'écoute de nos besoins.",
      "author":{"name":"Chantale Dubé"}}</script>`;
    const r = extraireAvis(html);
    expect(r.avis.length).toBe(1);
    expect(r.avis[0].text).toContain('Excellent service');
    expect(r.avis[0].author).toBe('Chantale Dubé');
  });

  it('récupère la note et le nombre d\'avis agrégés', () => {
    const html = `<script type="application/ld+json">{"aggregateRating":
      {"ratingValue":"4.6","reviewCount":"213"}}</script>`;
    const r = extraireAvis(html);
    expect(r.note).toBeCloseTo(4.6, 2);
    expect(r.count).toBe(213);
  });

  it('ne renvoie rien quand le site n\'a pas d\'avis structurés', () => {
    const r = extraireAvis('<html><body>Bienvenue chez nous</body></html>');
    expect(r.avis).toEqual([]);
    expect(r.note).toBe(null);
    expect(r.count).toBe(null);
  });
});
