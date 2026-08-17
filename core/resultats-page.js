'use strict';
// ── Novalis — Résultats (le relevé de valeur) ───────────────────────
// Prouve ce que le back-office opéré a rapporté : contacts captés, vitesse de
// réponse, travail préparé, résultats clients. Registre « document ». Chiffres
// COMPTÉS sur les vraies données — jamais inventés ; seule la « valeur estimée »
// est marquée comme telle.

const { esc, page } = require('./ui');
const { TYPE_LABEL } = require('./propositions');

function dollars(cents) {
  return (Math.round((cents || 0) / 100)).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function fmtDelai(min) {
  if (min == null) return '—';
  return min < 60 ? `${Math.round(min)} min` : `${(min / 60).toFixed(1)} h`;
}
const pl = (n, s, p) => (n === 1 ? s : p);

const ORDRE = ['reponse', 'devis', 'relance', 'avis', 'rappel', 'fidelisation', 'publication'];

function renderResultats(d) {
  const nom = d.nom || d.source;
  const r = d.recu;

  const vitesse = [
    ['Réponses sous 1 heure', r.pct_sous_1h == null ? null : r.pct_sous_1h, r.pct_sous_1h == null ? 'aucune réponse encore mesurée' : 'plus vite = plus de ventes', '%'],
    ['Délai médian de réponse', r.repondus ? fmtDelai(r.mediane_minutes) : null, `${r.repondus} ${pl(r.repondus, 'contact répondu', 'contacts répondus')}`, ''],
    ['Réponses instantanées 24/7', r.accuses || 0, r.accuses_hors_heures ? `dont ${r.accuses_hors_heures} hors de vos heures` : 'accusés envoyés en secondes', ''],
  ].map(([t, v, s, u]) => `<div class="rrow"><div class="t">${t}<span class="s">${esc(s)}</span></div>
    <div class="v ${v == null || v === 0 ? 'z' : ''}">${v == null ? '—' : v}${u && v != null ? `<span class="u">${u}</span>` : ''}</div></div>`).join('');

  const prep = ORDRE.filter((t) => (d.prep[t] || {}).prepares).map((t) => {
    const p = d.prep[t];
    return `<div class="rrow"><div class="t">${esc(TYPE_LABEL[t] || t)}<span class="s">${p.traites} ${pl(p.traites, 'approuvé ou envoyé', 'approuvés ou envoyés')}</span></div>
      <div class="v">${p.prepares}<span class="u">${pl(p.prepares, 'préparé', 'préparés')}</span></div></div>`;
  }).join('') || '<div class="rrow"><div class="t">Rien encore préparé sur la période.</div><div class="v z">—</div></div>';

  const c = d.clients;
  const clients = [
    ['Clients gagnés', c.gagne, 'acc'],
    ['En discussion', c.contacte, ''],
    ['Nouveaux à traiter', c.nouveau, ''],
    ['Perdus', c.perdu, ''],
  ].map(([t, v, cls]) => `<div class="rrow"><div class="t">${t}</div><div class="v ${v ? cls : 'z'}">${v}</div></div>`).join('');

  const content = `
    <div class="section-label">Vos résultats · ${d.jours} derniers jours</div>
    <div class="led">
      <div class="it"><div class="k">Contacts captés</div><div class="v">${r.contacts}</div><div class="sub">${r.leads} ${pl(r.leads, 'message', 'messages')} · ${r.taps} ${pl(r.taps, 'clic', 'clics')}</div></div>
      <div class="it"><div class="k">Hors des heures</div><div class="v">${r.hors_heures}</div><div class="sub">captés quand personne ne répondait</div></div>
      <div class="it"><div class="k">Valeur estimée</div><div class="v">${dollars(r.valeur_captee_cents)}</div><div class="sub">demande estimée par le site</div></div>
    </div>
    <div class="deyebrow">Vitesse de réponse</div>
    ${vitesse}
    <div class="deyebrow">Travail préparé par Novalis</div>
    ${prep}
    <div class="deyebrow">Résultats clients</div>
    ${clients}
    <div class="dnote">Chiffres comptés sur les vraies données de votre commerce. Seule la « valeur estimée » est une estimation, identifiée comme telle — rien n'est inventé.</div>`;

  return page({
    title: 'Résultats',
    subtitle: `${esc(nom)} · ce que Novalis a rapporté`,
    active: 'resultats', source: d.source, sources: d.sources, pass: d.pass, alertes: d.alertes,
    contentHtml: content,
  });
}

module.exports = { renderResultats };
