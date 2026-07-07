'use strict';
// ── Pipeline « modifie-site-ia » : l'édition par conversation ────────
// Entrée : { slug, instruction }
// C'est le « pas d'éditeur visuel à construire » du produit : le chat
// EST l'éditeur. Le LLM reçoit le document entier + l'instruction et
// rend le document entier modifié. Simple et robuste sous ~150 ko.
// Sécurité : uniquement les slugs enregistrés dans la table sites —
// jamais les démos semées ni les showcases bespoke.
// Chaque modification sauvegarde l'état précédent dans output/versions/.

const fs = require('fs');
const path = require('path');
const { DESIGN_SYSTEM } = require('../design-system');
const { validerHtmlGenere } = require('./genere-site-ia');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');
const VERSIONS_DIR = path.join(OUTPUT_DIR, 'versions');

function extraireHtml(texte) {
  let h = String(texte).trim();
  h = h.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '');
  const debut = h.indexOf('<!DOCTYPE');
  if (debut > 0) h = h.slice(debut);
  return h.trim();
}

module.exports = {
  type: 'modifie-site-ia',
  steps: [
    {
      name: 'charger-site',
      async run(ctx) {
        const { slug, instruction } = ctx.job.payload;
        if (!slug || !instruction) throw new Error('modifie-site-ia: payload.slug et payload.instruction requis');
        const site = ctx.deps.db.prepare('SELECT * FROM sites WHERE slug = ? AND statut = ?').get(slug, 'actif');
        if (!site) throw new Error(`site « ${slug} » introuvable dans la table sites (seuls les sites générés par le moteur sont éditables)`);
        // Isolation multi-tenant : un job du client X ne modifie pas le site du client Y.
        if (site.client_id !== ctx.job.client_id) {
          throw new Error(`le site « ${slug} » appartient au client ${site.client_id}, pas au client ${ctx.job.client_id}`);
        }
        const fichier = path.join(OUTPUT_DIR, `${slug}.html`);
        if (!fs.existsSync(fichier)) throw new Error(`fichier ${slug}.html absent du volume`);
        const html = fs.readFileSync(fichier, 'utf8');
        if (html.length > 250_000) throw new Error('site trop volumineux pour l\'édition intégrale');
        return { slug, instruction: String(instruction).slice(0, 3000), taille_avant: html.length };
      },
    },
    {
      name: 'modification',
      async run(ctx) {
        const { slug, instruction } = ctx.outputs['charger-site'];
        // Relu du disque plutôt que stocké dans l'output du step (poids DB)
        const html = fs.readFileSync(path.join(OUTPUT_DIR, `${slug}.html`), 'utf8');
        const { text } = await ctx.deps.llm.claude(ctx.job.client_id, {
          jobId: ctx.job.id,
          stepName: 'modification',
          maxTokens: 60_000,
          system: DESIGN_SYSTEM + `

MODE ÉDITION : tu reçois un site existant et une instruction de modification. Applique UNIQUEMENT ce que l'instruction demande — conserve tout le reste à l'identique (textes, palette, structure, animations). Ne « réimagine » rien qui n'a pas été demandé. Rends le document HTML COMPLET modifié, de <!DOCTYPE html> à </html>, sans fence ni commentaire.`,
          messages: [{
            role: 'user',
            content: `INSTRUCTION DU CLIENT :\n${instruction}\n\nDOCUMENT ACTUEL :\n${html}`,
          }],
        });
        const nouveau = extraireHtml(text);
        const tmp = path.join(OUTPUT_DIR, `.tmp-job-${ctx.job.id}.html`);
        fs.writeFileSync(tmp, nouveau, 'utf8');
        return { tmp, taille_apres: nouveau.length };
      },
    },
    {
      name: 'validation-versionnage',
      async run(ctx) {
        const { slug, taille_avant } = ctx.outputs['charger-site'];
        const { tmp, taille_apres } = ctx.outputs['modification'];
        if (!fs.existsSync(tmp)) throw new Error('fichier temporaire introuvable (retente le run)');
        const nouveau = fs.readFileSync(tmp, 'utf8');

        const problemes = validerHtmlGenere(nouveau);
        // Garde-fou spécifique à l'édition : une « modification » qui
        // fait fondre le document de moitié a probablement tout détruit.
        if (taille_apres < taille_avant * 0.5) problemes.push(`document réduit de ${taille_avant} à ${taille_apres} caractères`);
        if (problemes.length) {
          fs.unlinkSync(tmp);
          ctx.deps.queue.invalidateStep(ctx.job.id, 'modification');
          throw new Error('validation échouée: ' + problemes.join(' ; '));
        }

        // Versionnage : l'état courant part en sauvegarde datée AVANT le remplacement.
        fs.mkdirSync(VERSIONS_DIR, { recursive: true });
        const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
        const cible = path.join(OUTPUT_DIR, `${slug}.html`);
        fs.copyFileSync(cible, path.join(VERSIONS_DIR, `${slug}-${horodatage}.html`));
        fs.renameSync(tmp, cible);
        ctx.deps.db.prepare(`UPDATE sites SET updated_at = datetime('now') WHERE slug = ?`).run(slug);

        return {
          slug,
          demo_url: `/demo/${slug}.html`,
          version_precedente: `versions/${slug}-${horodatage}.html`,
          taille_ko: Math.round(nouveau.length / 1024),
          modifie_le: new Date().toISOString(),
        };
      },
    },
  ],
};
