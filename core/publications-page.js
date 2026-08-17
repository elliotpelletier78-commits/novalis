'use strict';
// ── Novalis Publications — marketing opéré, honnête ─────────────────
// Le commerçant choisit un thème et fournit l'essentiel (la vraie info) ; Nova
// met en forme une publication propre, déposée dans le poste de commande. Rien
// n'est inventé. La publication automatique (réseaux branchés) viendra ; pour
// l'instant : « à publier à la main ».

const { esc, page, statutBadge } = require('./ui');

const THEMES = [
  { v: 'promo', l: 'Offre / promotion' },
  { v: 'dispo', l: 'Disponibilités' },
  { v: 'conseil', l: 'Conseil / astuce' },
  { v: 'merci', l: 'Remerciement clientèle' },
  { v: 'annonce', l: 'Annonce générale' },
];

const EXTRA = `
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px 24px;box-shadow:var(--sh-sm);margin-bottom:16px}
.panel h3{font-size:15px;font-weight:660}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 16px}
.prow{display:grid;grid-template-columns:1fr;gap:14px}
label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
select,textarea{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
select:focus,textarea:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
textarea{min-height:100px;line-height:1.5;resize:vertical}
.pbtn{font-family:var(--sans);font-size:14px;font-weight:640;color:#fff;background:var(--brand);border:none;border-radius:var(--r-sm);padding:11px 20px;cursor:pointer;margin-top:16px}
.pbtn:hover{filter:brightness(1.07)}
.msg{margin-left:10px;font-size:13px;color:var(--ok)}
.apercu{margin-top:16px;padding:16px 18px;border-radius:var(--r);background:var(--panel);white-space:pre-wrap;font-size:14px;line-height:1.55;min-height:60px;color:var(--ink)}
.apercu.vide{color:var(--muted)}
.prow-h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap}
.prow-h .cnt{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.prow-h .tip{font-size:12px;color:var(--muted)}
.rline{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line-2)}
.rline:last-child{border-bottom:none}
.rline .b{flex:1;min-width:0}
.rline .t{font-size:14px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

function renderPublications(data) {
  const nom = data.nom || data.source;
  const content = `
  <div class="panel">
    <h3>Préparer une publication</h3>
    <div class="hint">Choisissez un thème et écrivez l'essentiel — l'offre, la disponibilité, le conseil. Nova met en forme. Rien n'est inventé : c'est votre message, propre et prêt.</div>
    <div class="prow">
      <label>Thème<select id="p-theme">${THEMES.map(t => `<option value="${t.v}">${esc(t.l)}</option>`).join('')}</select></label>
      <label>L'essentiel (ce que vous voulez dire)<textarea id="p-ess" maxlength="1200" placeholder="Ex. Rabais de 15 % sur les pneus d'hiver jusqu'au 30 novembre."></textarea></label>
    </div>
    <div class="prow-h"><span class="cnt" id="p-cnt">0 caractère</span><span class="tip">Astuce : une info concrète (offre, date, disponibilité) marche mieux qu'un slogan.</span></div>
    <div class="apercu vide" id="p-apercu">L'aperçu s'affichera ici.</div>
    <button class="pbtn" id="p-add">Déposer dans le poste de commande</button><span class="msg" id="p-msg"></span>
  </div>
  ${(data.recents && data.recents.length) ? `<div class="panel">
    <h3>Publications récentes</h3>
    <div class="hint">Vos derniers messages déposés dans le poste de commande.</div>
    ${data.recents.map(r => `<div class="rline"><div class="b"><div class="t">${esc((r.apercu || r.brouillon || '').slice(0, 90))}</div></div>${statutBadge(r.statut)}</div>`).join('')}
  </div>` : ''}
  <div class="pagefoot">Une fois approuvée, copiez-la sur vos réseaux. La publication automatique viendra avec vos comptes branchés.</div>`;

  const bodyScript = `var SOURCE=${JSON.stringify(data.source)};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
var theme=document.getElementById('p-theme'),ess=document.getElementById('p-ess'),ap=document.getElementById('p-apercu');
async function apercu(){
  var e=(ess.value||'').trim();
  if(!e){ap.classList.add('vide');ap.textContent='L\\'aperçu s\\'affichera ici.';return;}
  try{ var r=await fetch('/core/publications/apercu',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},
    body:JSON.stringify({source:SOURCE,theme:theme.value,essentiel:e})});
    var j=await r.json().catch(function(){return{};}); ap.classList.remove('vide'); ap.textContent=j.apercu||''; }catch(_){}
}
var cnt=document.getElementById('p-cnt');
function maj(){var l=(ess.value||'').length; if(cnt) cnt.textContent=l+' caractère'+(l>1?'s':'');}
var tmr; ess.addEventListener('input',function(){maj();clearTimeout(tmr);tmr=setTimeout(apercu,300);}); maj();
theme.addEventListener('change',apercu);
document.getElementById('p-add').addEventListener('click', async function(){
  var msg=document.getElementById('p-msg'); msg.style.color=''; msg.textContent='';
  var e=(ess.value||'').trim(); if(!e){msg.style.color='#C0392B';msg.textContent='Écrivez l\\'essentiel d\\'abord.';return;}
  var r=await fetch('/core/publications',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},
    body:JSON.stringify({source:SOURCE,theme:theme.value,essentiel:e})});
  if(r.ok){ msg.style.color='#108000'; msg.textContent='✓ Déposée dans le poste de commande';
    setTimeout(function(){location.href='/core/propositions?source='+encodeURIComponent(SOURCE)+(pass()?'&pass='+encodeURIComponent(pass()):'');},900); }
  else{ msg.style.color='#C0392B'; msg.textContent='Échec ('+r.status+')'; }
});`;

  return page({
    title: 'Publications',
    subtitle: `${esc(nom)} · préparez un message pour vos réseaux`,
    active: 'publications', source: data.source, sources: data.sources, pass: data.pass, alertes: data.alertes,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderPublications };
