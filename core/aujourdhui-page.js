'use strict';
// ── Novalis — Aujourd'hui (poste de commande unifié), style QuickBooks ─
// Grand format : salutation, actions rapides, « en un coup d'œil » (cartes
// funnel à bordure colorée et gros chiffres), puis « à faire » (à approuver +
// en attente) et un panneau latéral récapitulatif.

const { esc, icon, page } = require('./ui');

const TYPE_LABEL = { reponse: 'Réponse', avis: 'Avis', devis: 'Devis', relance: 'Relance', publication: 'Publication' };
const ICN = { reponse: 'inbox', avis: 'phone', devis: 'file', relance: 'phone', publication: 'file' };

const EXTRA = `
.prio{display:flex;gap:15px;align-items:center;border-radius:var(--r-lg);padding:16px 20px;margin-bottom:16px;border:1px solid var(--line);background:var(--card);box-shadow:var(--sh-sm);text-decoration:none;color:inherit;position:relative;overflow:hidden}
.prio::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--brand)}
.prio.urgent::before{background:var(--risk)} .prio.info::before{background:var(--warn)} .prio.calme::before{background:var(--ok)}
.prio .ic{width:40px;height:40px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--brand-soft);color:var(--brand-600)}
.prio.urgent .ic{background:var(--risk-soft);color:var(--risk)} .prio.info .ic{background:var(--warn-soft);color:var(--warn)} .prio.calme .ic{background:var(--ok-soft);color:var(--ok)}
.prio .ic svg{width:21px;height:21px}
.prio .pk{font-size:11px;font-weight:720;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.prio .pt{font-size:17px;font-weight:720;letter-spacing:-.01em;margin:2px 0}
.prio .ps{font-size:13.5px;color:var(--ink-2)}
.list .row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--line-2)}
.list .row:last-child{border-bottom:none}
.list .row .b{flex:1;min-width:0}
.list .row .t{font-weight:620;font-size:14px}
.list .row .c{font-size:13px;color:var(--muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.list .row>svg{width:18px;height:18px;flex:none;color:var(--faint);margin-top:2px}
.list .row .badge{flex:none;margin-top:1px}
.calm{padding:14px 16px;border-radius:var(--r);background:var(--ok-soft);color:var(--ok);font-size:13.5px;font-weight:600}
.diag .dt{font-size:14.5px;font-weight:720;margin-bottom:5px}
.diag .dd{font-size:13.5px;color:var(--ink-2);margin-bottom:8px}
.diag .dl{font-size:13.5px}.diag .dl b{color:var(--brand-600)}
.thin{font-size:13.5px;color:var(--muted)}
.prog{height:8px;border-radius:6px;background:var(--panel);overflow:hidden;margin:12px 0 6px}
.prog>span{display:block;height:100%;background:var(--brand);border-radius:6px}
.pbig{font-size:38px;font-weight:800;letter-spacing:-.03em;color:var(--brand-600);line-height:1}
`;

function renderAujourdhui(d) {
  const nom = d.nom || d.source;
  const s = d.signaux;
  const href = (base) => `${base}?source=${encodeURIComponent(d.source)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}`;

  const prioHtml = (() => {
    const p = d.priorite; if (!p) return '';
    const ic = { urgent: 'phone', action: 'inbox', info: 'pulse', calme: 'today' }[p.ton] || 'today';
    const dest = { reception: '/core/reception', propositions: '/core/propositions', branchement: '/core/branchement', aujourdhui: '/core/aujourdhui' }[p.lien] || '/core/aujourdhui';
    return `<a class="prio ${p.ton}" href="${href(dest)}">
      <span class="ic">${icon(ic)}</span>
      <span><span class="pk">Priorité du jour</span>
        <div class="pt">${esc(p.titre)}</div><div class="ps">${esc(p.sousTitre)}</div></span></a>`;
  })();

  const qa = `<div class="qact">
    <a href="${href('/core/propositions')}">${icon('inbox')} Approuver</a>
    <a href="${href('/core/devis')}">${icon('file')} Nouveau devis</a>
    <a href="${href('/core/reception')}">${icon('phone')} Contacts</a>
    <a href="${href('/core/branchement')}">${icon('plug')} Branchement</a>
  </div>`;

  const funnel = `<div class="grid g4">
    <a class="fcard g" href="${href('/core/propositions')}"><div class="fl">À approuver</div><div class="fv num">${s.a_approuver}</div><div class="fc">${icon('inbox')} préparé par Novalis</div></a>
    <a class="fcard b" href="${href('/core/reception')}"><div class="fl">Contacts (30 j)</div><div class="fv num">${s.contacts}</div><div class="fc">${icon('phone')} messages + appels</div></a>
    <a class="fcard ${s.en_attente ? 'a' : 'g'}" href="${href('/core/reception')}"><div class="fl">En attente</div><div class="fv num">${s.en_attente}</div><div class="fc">sans réponse</div></a>
    <a class="fcard g" href="${href('/core/branchement')}"><div class="fl">Prêt à opérer</div><div class="fv num">${d.pret_pct}%</div><div class="fc">${icon('plug')} branchement</div></a>
  </div>`;

  const props = d.propositions.length
    ? `<div class="list">${d.propositions.map(p => `<div class="row">
        <span class="badge ${p.type === 'avis' ? 'badge-warn' : 'badge-brand'}">${esc(TYPE_LABEL[p.type] || 'Proposition')}</span>
        <div class="b"><div class="t">${esc(p.titre)}</div>${p.apercu ? `<div class="c">« ${esc(p.apercu)} »</div>` : ''}</div>
        ${icon(ICN[p.type] || 'inbox')}</div>`).join('')}</div>`
    : '<div class="calm">Rien à approuver — vous êtes à jour.</div>';

  const attente = d.leads_attente.length
    ? `<div class="list">${d.leads_attente.map(l => `<div class="row">
        <span class="badge badge-risk">${esc(l.ilya)}</span>
        <div class="b"><div class="t">${esc(l.nom)}</div><div class="c">${esc(l.apercu)}</div></div></div>`).join('')}</div>`
    : '<div class="calm">Tous les contacts ont eu une réponse.</div>';

  const fuiteBloc = (d.fuite && d.fuite.fiable && d.fuite.fuite)
    ? `<div class="diag"><div class="dt">${esc(d.fuite.fuite.titre)}</div>
        <div class="dd">${esc(d.fuite.fuite.diagnostic)}</div>
        <div class="dl"><b>À changer :</b> ${esc(d.fuite.fuite.levier)}</div></div>`
    : `<div class="thin">${d.fuite && d.fuite.visiteurs
        ? `Encore trop peu de visiteurs (${d.fuite.visiteurs}) pour un diagnostic fiable.`
        : 'La mesure démarre dès les premières visites. Aucun témoin, conforme à la Loi 25.'}</div>`;

  const content = `${prioHtml}${qa}
    <div class="section-label">Votre commerce en un coup d’œil</div>
    ${funnel}
    <div class="section-label">À faire</div>
    <div class="cols">
      <div>
        <div class="card">
          <div class="card-h"><h2>À approuver ce matin</h2><a href="${href('/core/propositions')}">Tout voir →</a></div>
          <div class="hint">Novalis a déjà préparé le travail. Vous n'avez qu'à dire oui.</div>${props}
        </div>
        <div class="card">
          <div class="card-h"><h2>En attente de réponse</h2><a href="${href('/core/reception')}">Réception →</a></div>
          <div class="hint">Répondre en moins d'une heure multiplie les ventes.</div>${attente}
        </div>
      </div>
      <div class="aside">
        <div class="card">
          <div class="card-h"><h2>Ce qui décroche</h2><a href="${href('/core/reception')}">Pulse →</a></div>
          <div class="hint">Où vos visiteurs quittent.</div>${fuiteBloc}
        </div>
        <div class="card">
          <div class="card-h"><h2>Branchement</h2></div>
          <div class="pbig num">${d.pret_pct}%</div>
          <div class="prog"><span style="width:${d.pret_pct}%"></span></div>
          <div class="thin">${d.pret_pct >= 100 ? 'Tout est en place — Novalis opère pour vous.' : 'Complétez le branchement pour activer tous les automatismes.'}</div>
          <a class="btn btn-ghost" style="margin-top:12px" href="${href('/core/branchement')}">${icon('plug')} Ouvrir le branchement</a>
        </div>
      </div>
    </div>
    <div class="pagefoot">Tout votre commerce dans un seul écran. Rien ne part sans votre oui.</div>`;

  return page({
    title: nom,
    subtitle: `${d.salutation || 'Bonjour'} · ${d.dateLabel || ''}`,
    active: 'aujourdhui',
    source: d.source, sources: d.sources, pass: d.pass,
    extraCss: EXTRA,
    contentHtml: content,
  });
}

module.exports = { renderAujourdhui, esc };
