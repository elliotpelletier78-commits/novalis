import { describe, it, expect } from 'vitest';
import { validerHtmlGenere } from '../core/pipelines/genere-site-ia.js';

function siteValide() {
  const remplissage = '<section><p>' + 'Contenu gastronomique montréalais soigné. '.repeat(500) + '</p></section>';
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Le Jardin Boréal — Restaurant, Montréal</title>
<script type="application/ld+json">{"@type":"Restaurant"}</script>
<style>@media(prefers-reduced-motion:reduce){*{animation:none}}</style>
</head><body>
<a href="tel:+15145551234">514 555-1234</a>
${remplissage}
</body></html>`;
}

describe('validation du HTML généré par IA', () => {
  it('accepte un site complet valide', () => {
    expect(validerHtmlGenere(siteValide())).toEqual([]);
  });

  it('rejette un document tronqué', () => {
    const coupe = siteValide().slice(0, -20);
    expect(validerHtmlGenere(coupe)).toContain('document tronqué (</html> final manquant)');
  });

  it('rejette un document trop court', () => {
    const p = validerHtmlGenere('<!DOCTYPE html><html><head><title>Mini site</title></head><body></body></html>');
    expect(p.some(x => x.includes('trop court'))).toBe(true);
  });

  it('rejette les fences markdown résiduelles', () => {
    expect(validerHtmlGenere(siteValide() + '\n```')).toContain('fences markdown résiduelles');
  });

  it('rejette lorem ipsum et TODO', () => {
    const avec = siteValide().replace('Contenu gastronomique', 'Lorem ipsum TODO Contenu');
    const p = validerHtmlGenere(avec);
    expect(p).toContain('lorem ipsum détecté');
    expect(p).toContain('TODO résiduel');
  });

  it('exige schema.org, tel:, viewport et reduced-motion', () => {
    const sans = siteValide()
      .replace('application/ld+json', 'application/json')
      .replace('tel:+15145551234', '#')
      .replace('name="viewport"', 'name="vp"')
      .replace('prefers-reduced-motion', 'rien');
    const p = validerHtmlGenere(sans);
    expect(p).toContain('schema.org JSON-LD absent');
    expect(p).toContain('téléphone cliquable (tel:) absent');
    expect(p).toContain('meta viewport absente');
    expect(p).toContain('prefers-reduced-motion non géré');
  });
});
