'use strict';
// ── Novalis — Aujourd'hui (le poste de commande unifié) ──────────────
// Le seul écran qu'un commerçant ouvre le matin. Il rassemble tout : ce qui
// attend son oui, ses contacts et sa vitesse de réponse, où ses visiteurs
// décrochent, et l'état de son branchement. Chaque bloc renvoie vers la vue
// détaillée. Même identité visuelle que Réception.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const CSS = `
:root{
  --paper:#FAF9F4; --card:#FFFFFF; --panel:#F3F1E9; --ink:#181B14; --ink-2:#3C4034;
  --muted:#6A6F60; --faint:rgba(24,27,20,.5);
  --jade:#2B5B42; --jade-soft:rgba(43,91,66,.10); --steel:#3E5F7D;
  --ok:#2E6B45; --ok-soft:rgba(46,107,69,.12);
  --warn:#8A5E22; --warn-soft:rgba(138,94,34,.13);
  --risk:#9C4632; --risk-soft:rgba(156,70,50,.11);
  --hair:rgba(24,27,20,.12); --hair-2:rgba(24,27,20,.07);
  --shadow:0 1px 2px rgba(24,27,20,.04), 0 10px 34px rgba(24,27,20,.06);
  --serif:'Iowan Old Style',Palatino,Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
}
@media(prefers-color-scheme:dark){:root{
  --paper:#14160F; --card:#1E2118; --panel:#1B1E15; --ink:#ECEBE0; --ink-2:#C7C9BB;
  --muted:#9AA08D; --faint:rgba(236,235,224,.5);
  --jade:#7FB894; --jade-soft:rgba(127,184,148,.12); --steel:#8FB3D4;
  --ok:#7FB894; --ok-soft:rgba(127,184,148,.14);
  --warn:#D8B071; --warn-soft:rgba(216,176,113,.14);
  --risk:#E0967F; --risk-soft:rgba(224,150,127,.14);
  --hair:rgba(236,235,224,.15); --hair-2:rgba(236,235,224,.08);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 36px rgba(0,0,0,.4);
}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:clamp(20px,4vw,40px)}
.topbar{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.01em}
.brand em{font-style:normal;color:var(--jade)}
.sel{font-family:var(--sans);font-size:14px;padding:8px 12px;border:1px solid var(--hair);border-radius:10px;background:var(--card);color:var(--ink)}
.hello{font-family:var(--serif);font-size:clamp(22px,3vw,28px);font-weight:700;margin:16px 0 3px}
.date{color:var(--muted);font-size:14px;margin-bottom:22px}
.nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.nav a{font-size:13px;font-weight:600;padding:8px 14px;border-radius:999px;border:1px solid var(--hair);color:var(--ink-2);text-decoration:none;background:var(--card)}
.nav a:hover{border-color:var(--jade);color:var(--jade)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow);text-decoration:none;color:inherit;display:block}
.tile:hover{border-color:var(--jade)}
.tile .k{font-size:11.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.tile .v{font-family:var(--serif);font-size:clamp(30px,4vw,40px);font-weight:700;line-height:1;margin-top:10px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.tile .d{font-size:12.5px;color:var(--muted);margin-top:8px}
.tile.act .v{color:var(--jade)} .tile.warn .v{color:var(--warn)}
.panel{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow);margin-bottom:16px}
.panel h3{font-family:var(--serif);font-size:17px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.panel h3 a{font-family:var(--sans);font-size:13px;font-weight:600;color:var(--jade);text-decoration:none}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 14px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.item{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--hair-2)}
.item:last-child{border-bottom:none}
.item .tag{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:var(--jade-soft);color:var(--jade);white-space:nowrap;margin-top:1px}
.item .tag.avis{background:var(--warn-soft);color:var(--warn)}
.item .b{flex:1;min-width:0}
.item .t{font-weight:620;font-size:14.5px}
.item .c{font-size:13px;color:var(--muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.diag{padding:15px 17px;border-radius:12px;background:var(--warn-soft);border:1px solid var(--hair)}
.diag .dt{font-family:var(--serif);font-size:15.5px;font-weight:700;margin-bottom:5px}
.diag .dd{font-size:13.5px;color:var(--ink-2);margin-bottom:8px}
.diag .dl{font-size:13.5px}.diag .dl b{color:var(--jade)}
.calm{padding:15px 17px;border-radius:12px;background:var(--ok-soft);color:var(--ok);font-size:14px;font-weight:600}
.thin{font-size:13.5px;color:var(--muted);padding:8px 0}
.foot{margin-top:26px;color:var(--faint);font-size:12.5px;text-align:center}
@media(max-width:820px){.tiles{grid-template-columns:1fr 1fr}.row2{grid-template-columns:1fr}}
`;

const TYPE_LABEL = { reponse: 'Réponse', avis: 'Avis', facture: 'Devis', publication: 'Publication' };

function lienSrc(base, source) {
  return `${base}?source=${encodeURIComponent(source)}`;
}

/**
 * @param {object} d données agrégées :
 *   { source, nom, salutation, dateLabel, signaux, propositions, fuite, leads_attente, pret_pct, sources }
 */
function renderAujourdhui(d) {
  const nom = d.nom || d.source;
  const s = d.signaux;
  const selecteur = (d.sources && d.sources.length > 1)
    ? `<select class="sel" onchange="location.search='?source='+encodeURIComponent(this.value)">${d.sources.map(x =>
        `<option value="${esc(x)}"${x === d.source ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`
    : '';

  const props = d.propositions.length
    ? d.propositions.map(p => `<div class="item">
        <span class="tag ${p.type === 'avis' ? 'avis' : ''}">${esc(TYPE_LABEL[p.type] || 'Proposition')}</span>
        <div class="b"><div class="t">${esc(p.titre)}</div>
          ${p.apercu ? `<div class="c">« ${esc(p.apercu)} »</div>` : ''}</div></div>`).join('')
    : '<div class="calm">✓ Rien à approuver — vous êtes à jour.</div>';

  const attente = d.leads_attente.length
    ? d.leads_attente.map(l => `<div class="item">
        <span class="tag" style="background:var(--risk-soft);color:var(--risk)">${esc(l.ilya)}</span>
        <div class="b"><div class="t">${esc(l.nom)}</div>
          <div class="c">${esc(l.apercu)}</div></div></div>`).join('')
    : '<div class="calm">✓ Tous les contacts ont eu une réponse.</div>';

  const fuiteBloc = (d.fuite && d.fuite.fiable && d.fuite.fuite)
    ? `<div class="diag">
        <div class="dt">${esc(d.fuite.fuite.titre)}</div>
        <div class="dd">${esc(d.fuite.fuite.diagnostic)}</div>
        <div class="dl"><b>À changer :</b> ${esc(d.fuite.fuite.levier)}</div></div>`
    : `<div class="thin">${d.fuite && d.fuite.visiteurs
        ? `Encore trop peu de visiteurs (${d.fuite.visiteurs}) pour un diagnostic fiable — il s'affichera bientôt.`
        : 'La mesure démarre dès les premières visites. Aucun témoin, conforme à la Loi 25.'}</div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Aujourd'hui — ${esc(nom)}</title><style>${CSS}</style></head><body><div class="wrap">
  <div class="topbar"><div class="brand">Novalis <em>Aujourd'hui</em></div>${selecteur}</div>
  <div class="hello">${esc(d.salutation || 'Bonjour')} — voici ${esc(nom)} aujourd'hui.</div>
  <div class="date">${esc(d.dateLabel || '')}</div>

  <div class="nav">
    <a href="/core/propositions?source=${encodeURIComponent(d.source)}">Poste de commande</a>
    <a href="/core/reception?source=${encodeURIComponent(d.source)}">Réception</a>
    <a href="/core/branchement?source=${encodeURIComponent(d.source)}">Branchement</a>
  </div>

  <div class="tiles">
    <a class="tile act" href="/core/propositions?source=${encodeURIComponent(d.source)}">
      <div class="k">À approuver</div><div class="v">${s.a_approuver}</div>
      <div class="d">préparé par Novalis</div></a>
    <a class="tile" href="/core/reception?source=${encodeURIComponent(d.source)}">
      <div class="k">Contacts (30 j)</div><div class="v">${s.contacts}</div>
      <div class="d">messages + appels</div></a>
    <a class="tile ${s.en_attente ? 'warn' : ''}" href="/core/reception?source=${encodeURIComponent(d.source)}">
      <div class="k">En attente</div><div class="v">${s.en_attente}</div>
      <div class="d">sans réponse</div></a>
    <a class="tile" href="/core/branchement?source=${encodeURIComponent(d.source)}">
      <div class="k">Prêt à opérer</div><div class="v">${d.pret_pct}%</div>
      <div class="d">branchement</div></a>
  </div>

  <div class="panel">
    <h3>À approuver ce matin <a href="/core/propositions?source=${encodeURIComponent(d.source)}">Tout voir →</a></h3>
    <div class="hint">Novalis a déjà préparé le travail. Vous n'avez qu'à dire oui.</div>
    ${props}
  </div>

  <div class="row2">
    <div class="panel">
      <h3>En attente de réponse <a href="/core/reception?source=${encodeURIComponent(d.source)}">Réception →</a></h3>
      <div class="hint">Répondre en moins d'une heure multiplie les ventes.</div>
      ${attente}
    </div>
    <div class="panel">
      <h3>Ce qui décroche <a href="/core/reception?source=${encodeURIComponent(d.source)}">Pulse →</a></h3>
      <div class="hint">Où vos visiteurs quittent — et quoi changer.</div>
      ${fuiteBloc}
    </div>
  </div>

  <div class="foot">Novalis · tout votre commerce dans un seul écran. Rien ne part sans votre oui.</div>
</div></body></html>`;
}

module.exports = { renderAujourdhui, esc, _lienSrc: lienSrc };
