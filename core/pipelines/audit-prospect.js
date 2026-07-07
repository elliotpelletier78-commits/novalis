'use strict';
// ── Pipeline « audit-prospect » : premier pipeline réel du noyau ─────
// Entrée  : { url } dans le payload du job.
// Sortie  : un rapport d'audit structuré (les problèmes concrets du site
//           d'une PME), exactement le document qui sert d'argumentaire
//           de vente avant de générer le site démo.
// Chaque étape est un step tracé/repris individuellement par la file.

const { fetchSiteHtml } = require('../../discover');

/** Auditables sans navigateur : structure, méta, NAP, schema.org, poids. */
function analyserHtml(html, url) {
  const h = String(html);
  const probleme = [];
  const points = [];

  const title = (h.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || '';
  if (!title) probleme.push('Aucune balise <title> — invisible dans Google');
  else if (title.length < 12) probleme.push(`<title> trop court (« ${title} »)`);
  else points.push(`Titre présent : « ${title.slice(0, 60)} »`);

  const metaDesc = (h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || '';
  if (!metaDesc) probleme.push('Aucune meta description — extraits Google aléatoires');

  if (!/application\/ld\+json/i.test(h)) {
    probleme.push('Aucune donnée structurée schema.org — pas d\'étoiles ni d\'infos enrichies dans Google');
  } else points.push('Données structurées schema.org présentes');

  if (!/tel:/i.test(h) && !/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(h)) {
    probleme.push('Aucun numéro de téléphone cliquable détecté');
  } else points.push('Téléphone détecté');

  if (!/viewport/i.test(h)) probleme.push('Pas de meta viewport — site probablement cassé sur mobile');

  const imgs = h.match(/<img[^>]+>/gi) || [];
  const sansAlt = imgs.filter(i => !/alt=/.test(i)).length;
  if (imgs.length && sansAlt / imgs.length > 0.5) {
    probleme.push(`${sansAlt}/${imgs.length} images sans texte alternatif (accessibilité + SEO)`);
  }

  const https = url.startsWith('https://');
  if (!https) probleme.push('Site servi en HTTP non sécurisé');

  return {
    url,
    titre: title,
    problemes: probleme,
    points_forts: points,
    score: Math.max(0, 100 - probleme.length * 15),
    taille_html_ko: Math.round(h.length / 1024),
  };
}

/**
 * Définition du pipeline pour le worker.
 * @type {{type: string, steps: Array<{name:string, run:(ctx:any)=>Promise<any>}>}}
 */
module.exports = {
  type: 'audit-prospect',
  analyserHtml, // réutilisé par le pipeline demo-prospect
  steps: [
    {
      name: 'telecharger-accueil',
      async run(ctx) {
        const url = ctx.job.payload.url;
        if (!url || !/^https?:\/\//.test(url)) {
          throw new Error('audit-prospect: payload.url http(s) requis');
        }
        const { html, finalUrl } = await fetchSiteHtml(url);
        if (!html || html.length < 500) throw new Error(`page vide ou inaccessible (${url})`);
        // On ne stocke pas le HTML complet en sortie de step (poids DB) :
        // seulement ce dont l'analyse a besoin, tronqué à 400 ko.
        return { finalUrl: finalUrl || url, html: String(html).slice(0, 400_000) };
      },
    },
    {
      name: 'analyser',
      async run(ctx) {
        const { html, finalUrl } = ctx.outputs['telecharger-accueil'];
        return analyserHtml(html, finalUrl);
      },
    },
    {
      name: 'rapport',
      async run(ctx) {
        const a = ctx.outputs['analyser'];
        // Le rapport final est la sortie du job — sans le HTML brut.
        return {
          url: a.url,
          score: a.score,
          problemes: a.problemes,
          points_forts: a.points_forts,
          genere_le: new Date().toISOString(),
        };
      },
    },
  ],
};
