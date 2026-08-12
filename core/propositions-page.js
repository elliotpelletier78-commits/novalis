'use strict';
// ── Novalis — Poste de commande (file d'approbation) ─────────────────
// Admin : dans la coquille d'application. Commerçant (lien magique) : page
// autonome épurée. Pour chaque proposition : contexte, brouillon modifiable,
// et trois gestes — Approuver · Modifier · Rejeter.

const { esc, page, UI_CSS } = require('./ui');

const EXTRA = `
.tabs{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.tabs a{font-size:13px;font-weight:600;padding:8px 14px;border-radius:var(--r-pill);border:1px solid var(--line);color:var(--ink-2);text-decoration:none;background:var(--card)}
.tabs a:hover{border-color:var(--brand)}
.tabs a.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.count{display:inline-block;background:rgba(255,255,255,.25);color:inherit;border-radius:999px;font-size:12px;font-weight:700;padding:1px 8px;margin-left:7px}
.tabs a.on .count{background:rgba(255,255,255,.28);color:#fff}
.prop{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);margin-bottom:16px;overflow:hidden}
.prop.gone{opacity:.5}
.phead{display:flex;align-items:flex-start;gap:12px;padding:18px 22px 0}
.ptag{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:var(--r-pill);background:var(--brand-soft);color:var(--brand-600);white-space:nowrap;margin-top:2px}
.ptag.urgent{background:var(--warn-soft);color:var(--warn)}
.pttl{flex:1;min-width:0}
.pttl .t{font-size:17px;font-weight:720;letter-spacing:-.01em}
.pttl .ctx{font-size:13px;color:var(--muted);margin-top:2px}
.pbody{padding:14px 22px 20px}
.draft-lbl{font-size:11.5px;font-weight:660;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dest{font-size:12px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0}
textarea{width:100%;min-height:148px;font-family:var(--sans);font-size:14.5px;line-height:1.6;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;resize:vertical}
textarea:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.acts{display:flex;gap:9px;margin-top:14px;flex-wrap:wrap}
.acts button{font-family:var(--sans);font-size:13.5px;font-weight:620;padding:10px 17px;border-radius:var(--r-sm);border:1px solid var(--line);cursor:pointer;transition:filter .12s,border-color .12s,color .12s}
.b-ok{background:var(--brand);color:#fff;border-color:var(--brand)} .b-ok:hover{filter:brightness(1.07)}
.b-mod{background:var(--panel);color:var(--ink-2)} .b-mod:hover{border-color:var(--brand);color:var(--brand-600)}
.b-no{background:transparent;color:var(--muted)} .b-no:hover{border-color:var(--risk);color:var(--risk)}
.acts button:disabled{opacity:.5;cursor:not-allowed}
.pmsg{font-size:13px;margin-top:10px;min-height:18px}
.empty{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:46px 30px;text-align:center;color:var(--muted)}
.empty .big{font-size:20px;font-weight:700;color:var(--ink);margin-bottom:8px}
.share{margin-top:18px;font-size:13px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}
.share code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--panel);padding:3px 7px;border-radius:6px;word-break:break-all}
/* Page autonome commerçant */
.owner{max-width:780px;margin:0 auto;padding:clamp(20px,4vw,40px)}
.owner .obar{display:flex;align-items:center;gap:11px;margin-bottom:6px}
.owner .mk{width:30px;height:30px;border-radius:8px;background:var(--brand);display:flex;align-items:center;justify-content:center}
.owner .mk svg{width:18px;height:18px;color:#fff}
.owner .wm{font-size:18px;font-weight:750;letter-spacing:-.02em}.owner .wm span{color:var(--brand-600)}
.owner .osub{color:var(--muted);font-size:14px;margin:2px 0 22px}
`;

const TYPE_LABEL = { reponse: 'Réponse', avis: 'Avis', devis: 'Devis', relance: 'Relance', publication: 'Publication' };

function carte(p) {
  const urgent = p.priorite >= 10;
  const label = TYPE_LABEL[p.type] || 'Proposition';
  return `<div class="prop" data-id="${p.id}">
    <div class="phead">
      <span class="ptag ${urgent ? 'urgent' : ''}">${urgent ? label + ' · prioritaire' : label}</span>
      <div class="pttl"><div class="t">${esc(p.titre)}</div>
        <div class="ctx">${p.apercu ? '« ' + esc(p.apercu) + ' »' : ''}</div></div>
    </div>
    <div class="pbody">
      <div class="draft-lbl">Brouillon préparé par Novalis
        ${p.destinataire ? `<span class="dest">→ ${esc(p.destinataire)}</span>` : '<span class="dest">→ aucun destinataire</span>'}</div>
      <textarea data-draft>${esc(p.brouillon)}</textarea>
      <div class="acts">
        <button class="b-ok" data-a="approuver">✓ Approuver ${p.destinataire ? '&amp; envoyer' : ''}</button>
        <button class="b-mod" data-a="modifier">Enregistrer les changements</button>
        <button class="b-no" data-a="rejeter">Rejeter</button>
      </div>
      <div class="pmsg"></div>
    </div>
  </div>`;
}

function corpsHtml(data) {
  const c = data.compteurs;
  const statut = data.statut || 'en_attente';
  const owner = data.mode === 'owner';
  const tab = (s, label) => `<a href="${owner ? '' : '?source=' + encodeURIComponent(data.source) + (data.pass ? '&pass=' + encodeURIComponent(data.pass) : '')}${owner ? '?' : '&'}statut=${s}"${s === statut ? ' class="on"' : ''}>${label}</a>`;
  const corps = data.items.length
    ? data.items.map(carte).join('')
    : `<div class="empty"><div class="big">${statut === 'en_attente' ? 'Rien à approuver.' : 'Rien ici.'}</div>
        ${statut === 'en_attente' ? 'Dès qu\'un client écrit, Novalis prépare la réponse et la dépose ici pour votre oui.' : ''}</div>`;
  return `<div class="tabs">
    ${tab('en_attente', `À approuver${c.en_attente ? '<span class="count">' + c.en_attente + '</span>' : ''}`)}
    ${tab('approuve', 'Approuvés')}
    ${tab('envoye', 'Envoyés')}
    ${tab('rejete', 'Rejetés')}
  </div>
  ${corps}
  ${!owner && data.lienEspace ? `<div class="share">Lien privé du commerçant (il approuve lui-même, sans mot de passe)&nbsp;: <code>${esc(data.lienEspace)}</code></div>` : ''}`;
}

function scriptHtml(data) {
  const owner = data.mode === 'owner';
  return `var OWNER=${owner ? 'true' : 'false'};
var ACTION_BASE=${owner ? JSON.stringify(`/e/${data.source}/${data.token}/prop`) : JSON.stringify('/core/propositions')};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
document.querySelectorAll('.prop').forEach(function(card){
  var id=card.getAttribute('data-id');var ta=card.querySelector('[data-draft]');var msg=card.querySelector('.pmsg');
  card.querySelectorAll('.acts button').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var a=btn.getAttribute('data-a');var body={action:a};
      if(a==='approuver'||a==='modifier') body.brouillon=ta.value;
      card.querySelectorAll('button').forEach(function(b){b.disabled=true;});
      msg.style.color=''; msg.textContent='…';
      try{
        var headers={'Content-Type':'application/json'}; if(!OWNER) headers['x-admin-pass']=pass();
        var r=await fetch(ACTION_BASE+'/'+id,{method:'POST',headers:headers,body:JSON.stringify(body)});
        var j=await r.json().catch(function(){return {};});
        if(r.ok){
          if(a==='modifier'){ msg.style.color='#108000'; msg.textContent='✓ Changements enregistrés';
            card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); return; }
          msg.style.color='#108000';
          msg.textContent = a==='rejeter' ? '✗ Rejeté' : (j.envoye ? '✓ Approuvé et envoyé' : '✓ Approuvé — à envoyer à la main ('+(j.note||'')+')');
          card.classList.add('gone'); setTimeout(function(){ card.style.display='none'; }, 1200);
        } else { msg.style.color='#C0392B'; msg.textContent='Échec : '+(j.raison||r.status);
          card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); }
      }catch(e){ msg.style.color='#C0392B'; msg.textContent='Erreur réseau';
        card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); }
    });
  });
});`;
}

/** @param {{source, nom?, items, compteurs, statut, mode?, token?, pass?, lienEspace?}} data */
function renderPropositions(data) {
  const nom = data.nom || data.source;
  if (data.mode === 'owner') {
    // Page autonome (aucun accès admin) — la marque, les onglets, les cartes.
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Poste de commande — ${esc(nom)}</title><style>${UI_CSS}${EXTRA}</style></head>
<body><div class="owner">
  <div class="obar"><span class="mk"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12h4l2-6 4 12 2-6h5"/></svg></span><span class="wm">nova<span>lis</span></span></div>
  <div class="osub">${esc(nom)} · Novalis a déjà fait le travail — vous n'avez qu'à dire oui.</div>
  ${corpsHtml(data)}
  <div class="pagefoot">Rien ne part sans votre approbation. Ceci est votre espace privé Novalis.</div>
</div><script>${scriptHtml(data)}</script></body></html>`;
  }
  return page({
    title: 'Poste de commande',
    subtitle: `${esc(nom)} · Novalis a déjà fait le travail`,
    active: 'propositions',
    source: data.source, pass: data.pass,
    extraCss: EXTRA,
    contentHtml: corpsHtml(data),
    bodyScript: scriptHtml(data),
  });
}

module.exports = { renderPropositions, esc };
