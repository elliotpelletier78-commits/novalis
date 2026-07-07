'use strict';
// ── Pipeline « demo-prospect » : la machine de vente complète ────────
// Entrée : { url, secteur, ville?, nom?, adresse?, telephone? }
// Chaîne : télécharger le site du prospect → audit → extraire les infos
// d'entreprise → générer le site démo → dossier de vente prêt.
// Le pipeline S'ARRÊTE là volontairement : un humain relit la démo et
// décide de l'approche. L'envoi automatique d'outreach viendra quand la
// qualité générée sera prouvée sur plusieurs prospects réels.
// Chaque step est repris individuellement : si la génération échoue, le
// retry ne re-télécharge ni ne ré-audite (sorties déjà en base).

const fs = require('fs');
const path = require('path');
const { fetchSiteHtml, extractName } = require('../../discover');
const { generate, extractBrandColor, slugify } = require('../../generate');
const { analyserHtml } = require('./audit-prospect');

/** Téléphone nord-américain depuis le HTML (href tel: prioritaire). */
function extraireTelephone(html) {
  const tel = html.match(/href=["']tel:\+?1?([0-9\-. ()]{10,14})/i);
  if (tel) return tel[1].replace(/\D/g, '').slice(-10).replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2-$3');
  const brut = html.match(/\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/);
  return brut ? `${brut[1]} ${brut[2]}-${brut[3]}` : null;
}

module.exports = {
  type: 'demo-prospect',
  steps: [
    {
      name: 'telecharger-accueil',
      async run(ctx) {
        const { url } = ctx.job.payload;
        if (!url || !/^https?:\/\//.test(url)) throw new Error('demo-prospect: payload.url http(s) requis');
        if (!ctx.job.payload.secteur) throw new Error('demo-prospect: payload.secteur requis (restaurant, garage, salon, construction, health, fitness…)');
        const { html, finalUrl } = await fetchSiteHtml(url);
        if (!html || html.length < 500) throw new Error(`page vide ou inaccessible (${url})`);
        return { finalUrl: finalUrl || url, html: String(html).slice(0, 400_000) };
      },
    },
    {
      name: 'audit',
      async run(ctx) {
        const { html, finalUrl } = ctx.outputs['telecharger-accueil'];
        return analyserHtml(html, finalUrl);
      },
    },
    {
      name: 'extraire-infos',
      async run(ctx) {
        const { html, finalUrl } = ctx.outputs['telecharger-accueil'];
        const p = ctx.job.payload;
        const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
        // Les valeurs fournies dans le payload priment toujours sur
        // l'extraction automatique (l'humain connaît mieux le prospect).
        return {
          nom: p.nom || extractName(null, title) || new URL(finalUrl).hostname.replace(/^www\./, ''),
          secteur: p.secteur,
          ville: p.ville || null,
          adresse: p.adresse || null,
          telephone: p.telephone || extraireTelephone(html),
          brandColor: extractBrandColor(html) || null,
          siteExistant: finalUrl,
        };
      },
    },
    {
      name: 'generer-demo',
      async run(ctx) {
        const infos = ctx.outputs['extraire-infos'];
        const audit = ctx.outputs['audit'];
        // Anti-collision : si une démo porte déjà ce slug (démo semée,
        // showcase bespoke, ou prospect homonyme d'un autre client), on
        // suffixe avec l'id du job au lieu d'écraser silencieusement.
        const slugBase = slugify(infos.nom);
        const dejaPris = fs.existsSync(path.join(__dirname, '..', '..', 'output', `${slugBase}.html`));
        const result = await generate({
          slugSuffix: dejaPris ? `p${ctx.job.id}` : undefined,
          nom: infos.nom,
          secteur: infos.secteur,
          ville: infos.ville,
          adresse: infos.adresse,
          telephone: infos.telephone,
          brandColor: infos.brandColor,
          auditProblemes: audit.problemes,
          auditScore: audit.score,
        });
        if (!result || !result.slug) throw new Error('generate() n\'a pas retourné de slug');
        return { slug: result.slug };
      },
    },
    {
      name: 'dossier-de-vente',
      async run(ctx) {
        const infos = ctx.outputs['extraire-infos'];
        const audit = ctx.outputs['audit'];
        const { slug } = ctx.outputs['generer-demo'];
        // La sortie du job = tout ce qu'il faut pour décrocher le téléphone.
        return {
          prospect: {
            nom: infos.nom, secteur: infos.secteur, ville: infos.ville,
            telephone: infos.telephone, site_actuel: infos.siteExistant,
          },
          audit: { score: audit.score, problemes: audit.problemes },
          demo_url: `/demo/${slug}.html`,
          prochaine_action: 'Relire la démo, puis appeler le prospect avec l\'audit en main.',
          genere_le: new Date().toISOString(),
        };
      },
    },
  ],
};
