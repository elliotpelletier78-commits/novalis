'use strict';
// ── Pipeline « genere-site-ia » : le moteur Novalis Studio ───────────
// Entrée : { nom, secteur, ville?, description?, telephone?, adresse?,
//            avisGoogle?, avisCount?, siteExistant? }
// Deux appels LLM séparés — direction artistique (JSON court, réfléchi)
// puis génération du HTML complet — parce qu'un modèle qui décide de la
// palette PENDANT qu'il écrit du CSS fait les deux moyennement.
// Chaque step est repris individuellement : si la génération échoue, la
// direction artistique (déjà payée) n'est pas refaite.

const fs = require('fs');
const path = require('path');
const { DESIGN_SYSTEM } = require('../design-system');
const { slugify } = require('../../generate');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');

/** Extrait le premier objet JSON d'une réponse LLM (tolère les fences). */
function extraireJson(texte) {
  const m = String(texte).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('réponse LLM sans objet JSON');
  return JSON.parse(m[0]);
}

/** Nettoie une réponse LLM censée être un document HTML complet. */
function extraireHtml(texte) {
  let h = String(texte).trim();
  h = h.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '');
  const debut = h.indexOf('<!DOCTYPE');
  if (debut > 0) h = h.slice(debut);
  return h.trim();
}

/**
 * Validation stricte du HTML généré — un site qui échoue ici n'est pas
 * sauvegardé. Exporté pur pour les tests.
 * @returns {string[]} liste des problèmes (vide = valide)
 */
function validerHtmlGenere(html) {
  const problemes = [];
  const h = String(html);
  if (!/^<!DOCTYPE html>/i.test(h.trim())) problemes.push('ne commence pas par <!DOCTYPE html>');
  if (h.length < 15_000) problemes.push(`trop court (${h.length} caractères — un site complet fait 30-90k)`);
  if (h.length > 400_000) problemes.push('anormalement long (>400k)');
  if (!/<title>[^<]{5,}<\/title>/i.test(h)) problemes.push('<title> absent ou vide');
  if (!/application\/ld\+json/i.test(h)) problemes.push('schema.org JSON-LD absent');
  if (!/tel:\+?1?\d/i.test(h)) problemes.push('téléphone cliquable (tel:) absent');
  if (!/<meta[^>]+viewport/i.test(h)) problemes.push('meta viewport absente');
  if (!/<\/html>\s*$/i.test(h)) problemes.push('document tronqué (</html> final manquant)');
  if (/```/.test(h)) problemes.push('fences markdown résiduelles');
  if (/lorem ipsum/i.test(h)) problemes.push('lorem ipsum détecté');
  if (/\bTODO\b/.test(h)) problemes.push('TODO résiduel');
  if (!/prefers-reduced-motion/i.test(h)) problemes.push('prefers-reduced-motion non géré');
  return problemes;
}

module.exports = {
  type: 'genere-site-ia',
  validerHtmlGenere, // exporté pour les tests
  steps: [
    {
      name: 'brief',
      async run(ctx) {
        const p = ctx.job.payload;
        if (!p.nom || !p.secteur) throw new Error('genere-site-ia: payload.nom et payload.secteur requis');
        return {
          nom: String(p.nom).slice(0, 80),
          secteur: String(p.secteur).slice(0, 60),
          ville: p.ville ? String(p.ville).slice(0, 60) : null,
          description: p.description ? String(p.description).slice(0, 2000) : null,
          telephone: p.telephone || null,
          adresse: p.adresse || null,
          avisGoogle: p.avisGoogle || null,
          avisCount: p.avisCount || null,
          siteExistant: p.siteExistant || null,
        };
      },
    },
    {
      name: 'direction-artistique',
      async run(ctx) {
        const b = ctx.outputs['brief'];
        const { text } = await ctx.deps.llm.claude(ctx.job.client_id, {
          jobId: ctx.job.id,
          stepName: 'direction-artistique',
          maxTokens: 2000,
          system: DESIGN_SYSTEM,
          messages: [{
            role: 'user',
            content: `Avant d'écrire la moindre ligne de code, pose la direction artistique de ce site. Brief client :
${JSON.stringify(b, null, 1)}

Réponds UNIQUEMENT avec un objet JSON :
{
 "concept": "l'idée narrative du site en 2 phrases (quelle histoire le scroll raconte)",
 "palette": {"nomToken": "#hex", ...} (5-7 tokens sémantiques),
 "fonts": {"display": "Nom Google Font", "body": "Nom Google Font"},
 "ton": "3-5 adjectifs du ton rédactionnel",
 "sections": ["liste ordonnée des sections avec leur angle en 5-8 mots chacune"],
 "accroche_hero": "la tagline du héros, en français, spécifique à CE commerce",
 "mot_signature": "le mot unique en gros caractères pour la section kinetic (ex: SUR MESURE)"
}`,
          }],
        });
        return extraireJson(text);
      },
    },
    {
      name: 'generation-html',
      async run(ctx) {
        const b = ctx.outputs['brief'];
        const da = ctx.outputs['direction-artistique'];
        const { text } = await ctx.deps.llm.claude(ctx.job.client_id, {
          jobId: ctx.job.id,
          stepName: 'generation-html',
          maxTokens: 60_000,
          system: DESIGN_SYSTEM,
          messages: [{
            role: 'user',
            content: `Écris maintenant le site complet.

BRIEF CLIENT :
${JSON.stringify(b, null, 1)}

DIRECTION ARTISTIQUE VALIDÉE (respecte-la exactement) :
${JSON.stringify(da, null, 1)}

Réponds UNIQUEMENT avec le document HTML complet, de <!DOCTYPE html> à </html>. Aucun texte avant ou après, aucune fence markdown.`,
          }],
        });
        const html = extraireHtml(text);
        // On ne stocke pas 60k de HTML dans l'output du step (poids DB) :
        // fichier temporaire par job, le step suivant valide puis déplace.
        const tmp = path.join(OUTPUT_DIR, `.tmp-job-${ctx.job.id}.html`);
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(tmp, html, 'utf8');
        return { tmp, taille: html.length };
      },
    },
    {
      name: 'validation-sauvegarde',
      async run(ctx) {
        const b = ctx.outputs['brief'];
        const { tmp } = ctx.outputs['generation-html'];
        if (!fs.existsSync(tmp)) throw new Error('fichier temporaire du step précédent introuvable (retente le run)');
        const html = fs.readFileSync(tmp, 'utf8');

        const problemes = validerHtmlGenere(html);
        if (problemes.length) {
          // HTML rejeté : on jette le fichier ET on invalide le step de
          // génération — au retry du job, une NOUVELLE génération aura
          // lieu (sinon la reprise rejouerait le même HTML raté).
          fs.unlinkSync(tmp);
          ctx.deps.queue.invalidateStep(ctx.job.id, 'generation-html');
          throw new Error('validation échouée: ' + problemes.join(' ; '));
        }

        // Anti-collision de slug (même logique que demo-prospect)
        let slug = slugify(b.nom);
        if (fs.existsSync(path.join(OUTPUT_DIR, `${slug}.html`))) slug = `${slug}-s${ctx.job.id}`;
        fs.renameSync(tmp, path.join(OUTPUT_DIR, `${slug}.html`));

        // Enregistrer le site (source de vérité pour l'édition par chat)
        ctx.deps.db.prepare(`INSERT INTO sites (client_id, slug, nom, brief) VALUES (?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET updated_at = datetime('now')`)
          .run(ctx.job.client_id, slug, b.nom, JSON.stringify(b));

        return {
          slug,
          demo_url: `/demo/${slug}.html`,
          taille_ko: Math.round(html.length / 1024),
          concept: ctx.outputs['direction-artistique'].concept,
          genere_le: new Date().toISOString(),
        };
      },
    },
  ],
};
