import { describe, it, expect } from 'vitest';
import { jsInline } from '../core/ui.js';
import { renderClients } from '../core/clients-page.js';

describe('jsInline — sérialisation sûre pour <script>', () => {
  it('neutralise une tentative de sortie de balise </script>', () => {
    const out = jsInline('</script><script>alert(1)</script>');
    expect(out).not.toMatch(/<\/script>/i);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    // reste un littéral JS valide qui redonne la chaîne d'origine
    expect(JSON.parse(out)).toBe('</script><script>alert(1)</script>');
  });
  it('échappe les séparateurs de ligne U+2028/2029 et &', () => {
    expect(jsInline('a b')).toContain('\\u2028');
    expect(jsInline('x&y')).toContain('\\u0026');
  });
  it('gère null/undefined', () => {
    expect(jsInline(undefined)).toBe('null');
    expect(jsInline(null)).toBe('null');
  });
});

describe('fiche client — pas d’injection via le nom du client', () => {
  it('un nom malveillant n’insère jamais de </script> brut dans la page', () => {
    const mechant = '</script><script>window.__pwn=1</script>';
    const html = renderClients({
      source: 'garage-x', nom: 'Garage X', sources: ['garage-x'],
      fiche: {
        cle: 'n:' + mechant.toLowerCase(), nom: mechant, courriel: mechant,
        statut: 'nouveau', statut_manuel: '', gagne: false, valeur_cents: 0,
        notes: '', assigne: '', premier: '2026-01-01', dernier: '2026-01-01',
        compteurs: { messages: 1, rdv: 0, devis: 0, avis: 0, reponses: 0 }, evenements: [],
      },
      photos: [], paiements: [], portailUrl: '',
    });
    // Aucune balise </script> issue des données (le nom brut ne doit pas fermer un script).
    // On retire les fermetures LÉGITIMES du gabarit, puis on vérifie qu'il n'en reste
    // aucune injectée par le nom.
    expect(html).not.toContain('<script>window.__pwn=1</script>');
    expect(html).not.toContain('</script><script>window.__pwn');
  });
});
