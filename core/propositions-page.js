'use strict';
// ── Novalis — Poste de commande (file d'approbation) ─────────────────
// Admin (coquille d'app) : console maître-détail dense — un tableau des
// propositions à gauche, un panneau de traitement à droite (brouillon modifiable
// + Approuver · Modifier · Rejeter). Commerçant (lien magique) : cartes empilées,
// pensées pour le téléphone. Rien ne part sans un oui — jamais de faux « envoyé ».

const { esc, page, statutBadge, UI_CSS } = require('./ui');
const { TYPE_LABEL } = require('./propositions');

// Pastille de couleur par type de proposition (repère visuel, jamais la seule info).
const TYPE_DOT = {
  reponse: 'var(--ok)', devis: 'var(--brand)', relance: 'var(--warn)',
  rappel: '#B0763A', avis: '#6E5AA6', fidelisation: 'var(--steel)', publication: '#3E7C79',
};

// « il y a … » compact à partir d'un datetime SQL UTC ('YYYY-MM-DD HH:MM:SS').
function ilya(ts) {
  if (!ts) return '';
  const t = Date.parse(String(ts).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'à l’instant';
  const m = Math.floor(s / 60); if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.floor(m / 60); if (h < 24) return 'il y a ' + h + ' h';
  const j = Math.floor(h / 24); if (j < 7) return 'il y a ' + j + ' j';
  return new Date(t).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
}

const EXTRA = `
/* ── Console maître-détail (admin) ──────────────────────────────────── */
.pc-tabs{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px;margin-bottom:16px}
.pc-tabs a{display:flex;align-items:center;gap:7px;padding:7px 13px;border-radius:8px;font-size:12.5px;font-weight:560;color:var(--muted);text-decoration:none}
.pc-tabs a .c{font-size:10.5px;font-weight:700;background:var(--card);border-radius:20px;padding:0 7px;color:var(--muted);font-variant-numeric:tabular-nums}
.pc-tabs a.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(40,34,20,.09);font-weight:640}
.pc-tabs a.on .c{background:var(--brand);color:var(--brand-ink)}
.pc{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:18px;align-items:start}
.pc-table{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden}
.pc-table .scr{overflow-x:auto}
.pctbl{width:100%;border-collapse:collapse;font-size:13.5px;table-layout:fixed}
.pctbl th:nth-child(1),.pctbl td:nth-child(1){width:15%}
.pctbl th:nth-child(2),.pctbl td:nth-child(2){width:24%}
.pctbl th:nth-child(3),.pctbl td:nth-child(3){width:27%}
.pctbl th:nth-child(4),.pctbl td:nth-child(4){width:15%}
.pctbl th:nth-child(5),.pctbl td:nth-child(5){width:19%}
.pctbl thead th{position:sticky;top:0;background:var(--panel);text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:11px 14px;border-bottom:1px solid var(--line);white-space:nowrap;z-index:1}
.pctbl tbody td{padding:12px 14px;border-bottom:1px solid var(--line-2);vertical-align:middle}
.pctbl tbody tr{cursor:pointer}
.pctbl tbody tr:last-child td{border-bottom:none}
.pctbl tbody tr:hover{background:var(--panel)}
.pctbl tbody tr.sel{background:var(--brand-soft)}
.pctbl tbody tr.prio td:first-child{box-shadow:inset 3px 0 0 var(--risk)}
.pctbl tbody tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--brand)}
.pctbl .typ{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:560;white-space:nowrap;color:var(--ink-2)}
.pctbl .typ .d{width:7px;height:7px;border-radius:2px;flex:none}
.pctbl .sj{display:block;font-weight:620;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pctbl .ap{display:block;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pctbl .wh{color:var(--faint);font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.pctbl .typ{max-width:100%;overflow:hidden;text-overflow:ellipsis}
.pc-tfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--line);background:var(--panel);font-size:12px;color:var(--muted)}
.pc-empty{padding:44px 30px;text-align:center;color:var(--muted)}
.pc-empty .big{font-family:var(--disp);font-size:19px;font-weight:600;color:var(--ink);margin-bottom:8px}
/* rail */
.pc-rail{position:sticky;top:88px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100vh - 108px)}
.pc-rail .rh{padding:16px 18px 14px;border-bottom:1px solid var(--line-2)}
.pc-rail .rtop{display:flex;align-items:center;justify-content:space-between;gap:10px}
.pc-rail .typ{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:560;color:var(--ink-2)}
.pc-rail .typ .d{width:7px;height:7px;border-radius:2px;flex:none}
.pc-rail .wh{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.pc-rail h3{font-family:var(--disp);font-size:18px;font-weight:600;letter-spacing:-.005em;margin:11px 0 2px}
.pc-rail .em{font-size:12.5px;color:var(--muted)}
.pc-rail .rb{padding:15px 18px;overflow:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}
.pc-rail .lbl{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);font-weight:700}
.pc-rail textarea{width:100%;min-height:168px;font-family:var(--sans);font-size:14px;line-height:1.6;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:10px;padding:13px 15px;resize:vertical}
.pc-rail textarea:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.pc-rail textarea[readonly]{background:var(--panel);color:var(--ink-2)}
.pc-rail .note{display:flex;gap:9px;font-size:12px;color:var(--muted);background:var(--brand-soft);border:1px solid var(--line);border-radius:9px;padding:11px 13px;line-height:1.45}
.pc-rail .note .sp{color:var(--brand);flex:none;font-size:14px}
.pc-rail .rf{padding:13px 18px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.pc-rail .rf .row{display:flex;gap:8px}
.pc-rail .bp{flex:1;justify-content:center;font-size:13px;font-weight:640;padding:11px;border-radius:9px;border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink);cursor:pointer;display:flex;align-items:center;gap:8px}
.pc-rail .bp:hover{filter:brightness(1.08)}
.pc-rail .bg{flex:1;justify-content:center;font-size:13px;font-weight:600;padding:11px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink-2);cursor:pointer;display:flex;align-items:center}
.pc-rail .bg:hover{border-color:var(--brand);color:var(--brand-600)}
.pc-rail .brej{width:100%;justify-content:center;font-size:12.5px;font-weight:560;padding:9px;border-radius:9px;border:1px solid transparent;background:none;color:var(--risk);cursor:pointer}
.pc-rail .brej:hover{background:var(--risk-soft)}
.pc-rail button:disabled{opacity:.5;cursor:not-allowed}
.pc-rmsg{font-size:12.5px;min-height:16px;text-align:center}
.share{margin-top:18px;font-size:13px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}
.share code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--panel);padding:3px 7px;border-radius:6px;word-break:break-all}
@media(max-width:1000px){.pc{grid-template-columns:1fr}.pc-rail{position:static;max-height:none}}
/* ── Cartes empilées (mode commerçant / lien magique) ───────────────── */
.tabs{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.tabs a{font-size:13px;font-weight:600;padding:8px 14px;border-radius:var(--r-pill);border:1px solid var(--line);color:var(--ink-2);text-decoration:none;background:var(--card)}
.tabs a:hover{border-color:var(--brand)}
.tabs a.on{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.count{display:inline-block;background:rgba(255,255,255,.22);color:inherit;border-radius:999px;font-size:12px;font-weight:700;padding:1px 8px;margin-left:7px}
.prop{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);margin-bottom:16px;overflow:hidden}
.prop.gone{opacity:.5}
.phead{display:flex;align-items:flex-start;gap:12px;padding:18px 22px 0}
.ptag{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:var(--r-pill);background:var(--brand-soft);color:var(--brand-600);white-space:nowrap;margin-top:2px}
.ptag.urgent{background:var(--warn-soft);color:var(--warn)}
.pttl{flex:1;min-width:0}
.pttl .t{font-family:var(--disp);font-size:17px;font-weight:600;letter-spacing:-.005em}
.pttl .ctx{font-size:13px;color:var(--muted);margin-top:2px}
.pbody{padding:14px 22px 20px}
.draft-lbl{font-size:11.5px;font-weight:660;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dest{font-size:12px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0}
.owner textarea,.prop textarea{width:100%;min-height:148px;font-family:var(--sans);font-size:14.5px;line-height:1.6;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;resize:vertical}
.owner textarea:focus,.prop textarea:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.acts{display:flex;gap:9px;margin-top:14px;flex-wrap:wrap}
.acts button{font-family:var(--sans);font-size:13.5px;font-weight:620;padding:10px 17px;border-radius:var(--r-sm);border:1px solid var(--line);cursor:pointer;transition:filter .12s,border-color .12s,color .12s}
.b-ok{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)} .b-ok:hover{filter:brightness(1.08)}
.b-mod{background:var(--panel);color:var(--ink-2)} .b-mod:hover{border-color:var(--brand);color:var(--brand-600)}
.b-no{background:transparent;color:var(--muted)} .b-no:hover{border-color:var(--risk);color:var(--risk)}
.acts button:disabled{opacity:.5;cursor:not-allowed}
.pmsg{font-size:13px;margin-top:10px;min-height:18px}
.empty{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:46px 30px;text-align:center;color:var(--muted)}
.empty .big{font-family:var(--disp);font-size:20px;font-weight:600;color:var(--ink);margin-bottom:8px}
.owner{max-width:780px;margin:0 auto;padding:clamp(20px,4vw,40px)}
.owner .obar{display:flex;align-items:center;gap:11px;margin-bottom:6px}
.owner .mk{width:30px;height:30px;border-radius:8px;background:var(--brand);display:flex;align-items:center;justify-content:center}
.owner .mk svg{width:18px;height:18px;color:var(--brand-ink)}
.owner .wm{font-family:var(--disp);font-size:19px;font-weight:600}.owner .wm span{color:var(--brand-600)}
.owner .osub{color:var(--muted);font-size:14px;margin:2px 0 22px}
`;

// ── Console admin (tableau + panneau de détail) ──────────────────────
function ligne(p) {
  const dot = TYPE_DOT[p.type] || 'var(--muted)';
  const label = TYPE_LABEL[p.type] || 'Proposition';
  const prio = p.priorite >= 10;
  return `<tr class="${prio ? 'prio' : ''}" data-id="${p.id}" data-type="${esc(label)}" data-dot="${esc(dot)}" data-titre="${esc(p.titre || '')}" data-brouillon="${esc(p.brouillon || '')}" data-dest="${esc(p.destinataire || '')}" data-when="${esc(ilya(p.cree_le))}">
    <td><span class="typ"><span class="d" style="background:${dot}"></span>${esc(label)}</span></td>
    <td><span class="sj">${esc(p.titre || '—')}</span></td>
    <td><div class="ap">${p.apercu ? esc(p.apercu) : '<span style="color:var(--faint)">—</span>'}</div></td>
    <td><span class="wh">${esc(ilya(p.cree_le))}</span></td>
    <td>${statutBadge(p.statut)}</td>
  </tr>`;
}

function consoleAdmin(data) {
  const c = data.compteurs || {};
  const statut = data.statut || 'en_attente';
  const q = (s) => '?source=' + encodeURIComponent(data.source)
    + (data.pass ? '&pass=' + encodeURIComponent(data.pass) : '') + '&statut=' + s;
  const tab = (s, l) => `<a href="${q(s)}"${s === statut ? ' class="on"' : ''}>${l}<span class="c">${c[s] || 0}</span></a>`;
  const table = data.items.length
    ? `<div class="scr"><table class="pctbl">
        <thead><tr><th>Type</th><th>Sujet</th><th>Aperçu</th><th>Préparé</th><th>Statut</th></tr></thead>
        <tbody>${data.items.map(ligne).join('')}</tbody></table></div>
       <div class="pc-tfoot"><span>${data.items.length} proposition${data.items.length > 1 ? 's' : ''}</span><span class="muted">Cliquez une ligne pour la traiter →</span></div>`
    : `<div class="pc-empty"><div class="big">${statut === 'en_attente' ? 'Rien à approuver.' : 'Rien ici.'}</div>${statut === 'en_attente' ? 'Dès qu’un client écrit, Novalis prépare la réponse et la dépose ici pour votre oui.' : ''}</div>`;
  return `<div class="pc-tabs">
    ${tab('en_attente', 'À approuver')}${tab('approuve', 'Approuvés')}${tab('envoye', 'Envoyés')}${tab('rejete', 'Rejetés')}
  </div>
  <div class="pc">
    <div class="pc-table" id="pc-table">${table}</div>
    <aside class="pc-rail" id="rail" aria-live="polite"><div class="pc-empty" style="padding:52px 24px">Sélectionnez une proposition.</div></aside>
  </div>
  ${data.lienEspace ? `<div class="share">Lien privé du commerçant (il approuve lui-même, sans mot de passe)&nbsp;: <code>${esc(data.lienEspace)}</code></div>` : ''}`;
}

function scriptAdmin(data) {
  const statut = data.statut || 'en_attente';
  return `var ACTIONNABLE=${statut === 'en_attente' ? 'true' : 'false'};
var ACTION_BASE='/core/propositions';
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
function esc(s){return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var rail=document.getElementById('rail');
var rows=[].slice.call(document.querySelectorAll('.pctbl tbody tr'));
function renderRail(tr){
  rows.forEach(function(r){r.classList.remove('sel');});
  if(!tr){rail.innerHTML='<div class="pc-empty" style="padding:52px 24px">Rien à traiter ici.</div>';return;}
  tr.classList.add('sel');
  var d=tr.dataset;
  var actions = ACTIONNABLE ? ('<div class="rf"><div class="row">'
    +'<button class="bp" data-a="approuver"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'+(d.dest?'Approuver &amp; envoyer':'Approuver')+'</button>'
    +'<button class="bg" data-a="modifier">Enregistrer</button></div>'
    +'<button class="brej" data-a="rejeter">Rejeter cette proposition</button>'
    +'<div class="pc-rmsg" id="rmsg"></div></div>') : '';
  rail.innerHTML='<div class="rh"><div class="rtop"><span class="typ"><span class="d" style="background:'+d.dot+'"></span>'+esc(d.type)+'</span><span class="wh">'+esc(d.when)+'</span></div>'
    +'<h3>'+esc(d.titre||'—')+'</h3><div class="em">'+(d.dest?esc(d.dest):'aucun destinataire')+'</div></div>'
    +'<div class="rb"><div class="lbl">Brouillon préparé par Novalis</div>'
    +'<textarea id="rdraft"'+(ACTIONNABLE?'':' readonly')+'>'+esc(d.brouillon)+'</textarea>'
    +'<div class="note"><span class="sp">✳</span><span>Rien ne part sans votre oui. '+(d.dest?('À l’approbation, Novalis l’envoie à '+esc(d.dest)+'.'):'Aucun destinataire — à copier à la main après approbation.')+'</span></div></div>'
    +actions;
  bindRail(tr);
}
function bindRail(tr){
  var id=tr.dataset.id;var ta=document.getElementById('rdraft');var msg=document.getElementById('rmsg');
  rail.querySelectorAll('[data-a]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var a=btn.getAttribute('data-a');var body={action:a};
      if(a==='approuver'||a==='modifier') body.brouillon=ta.value;
      rail.querySelectorAll('button').forEach(function(b){b.disabled=true;});
      msg.style.color='';msg.textContent='…';
      try{
        var r=await fetch(ACTION_BASE+'/'+id,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});
        var j=await r.json().catch(function(){return{};});
        if(r.ok){
          if(a==='modifier'){msg.style.color='var(--ok)';msg.textContent='✓ Changements enregistrés';tr.dataset.brouillon=ta.value;rail.querySelectorAll('button').forEach(function(b){b.disabled=false;});return;}
          var idx=rows.indexOf(tr);tr.remove();rows=rows.filter(function(x){return x!==tr;});
          renderRail(rows[idx]||rows[idx-1]||null);majFooter();
        } else {msg.style.color='var(--risk)';msg.textContent='Échec : '+(j.raison||r.status);rail.querySelectorAll('button').forEach(function(b){b.disabled=false;});}
      }catch(e){msg.style.color='var(--risk)';msg.textContent='Erreur réseau';rail.querySelectorAll('button').forEach(function(b){b.disabled=false;});}
    });
  });
}
function majFooter(){
  var f=document.querySelector('.pc-tfoot span');if(f)f.textContent=rows.length+' proposition'+(rows.length>1?'s':'');
  if(!rows.length){document.getElementById('pc-table').innerHTML='<div class="pc-empty"><div class="big">Vous êtes à jour.</div>Tout est traité — rien n’attend votre oui.</div>';}
}
rows.forEach(function(tr){tr.addEventListener('click',function(e){if(e.target.closest('a'))return;renderRail(tr);});});
if(rows.length) renderRail(rows[0]);`;
}

// ── Cartes empilées (mode commerçant, lien magique) ──────────────────
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

function ownerCorps(data) {
  const c = data.compteurs;
  const statut = data.statut || 'en_attente';
  const tab = (s, label) => `<a href="?statut=${s}"${s === statut ? ' class="on"' : ''}>${label}</a>`;
  const corps = data.items.length
    ? data.items.map(carte).join('')
    : `<div class="empty"><div class="big">${statut === 'en_attente' ? 'Rien à approuver.' : 'Rien ici.'}</div>
        ${statut === 'en_attente' ? 'Dès qu’un client écrit, Novalis prépare la réponse et la dépose ici pour votre oui.' : ''}</div>`;
  return `<div class="tabs">
    ${tab('en_attente', `À approuver${c.en_attente ? '<span class="count">' + c.en_attente + '</span>' : ''}`)}
    ${tab('approuve', 'Approuvés')}
    ${tab('envoye', 'Envoyés')}
    ${tab('rejete', 'Rejetés')}
  </div>${corps}`;
}

function ownerScript(data) {
  return `var ACTION_BASE=${JSON.stringify(`/e/${data.source}/${data.token}/prop`)};
document.querySelectorAll('.prop').forEach(function(card){
  var id=card.getAttribute('data-id');var ta=card.querySelector('[data-draft]');var msg=card.querySelector('.pmsg');
  card.querySelectorAll('.acts button').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var a=btn.getAttribute('data-a');var body={action:a};
      if(a==='approuver'||a==='modifier') body.brouillon=ta.value;
      card.querySelectorAll('button').forEach(function(b){b.disabled=true;});
      msg.style.color=''; msg.textContent='…';
      try{
        var r=await fetch(ACTION_BASE+'/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        var j=await r.json().catch(function(){return {};});
        if(r.ok){
          if(a==='modifier'){ msg.style.color='var(--ok)'; msg.textContent='✓ Changements enregistrés';
            card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); return; }
          msg.style.color='var(--ok)';
          msg.textContent = a==='rejeter' ? '✗ Rejeté' : (j.envoye ? '✓ Approuvé et envoyé' : '✓ Approuvé — à envoyer à la main ('+(j.note||'')+')');
          card.classList.add('gone'); setTimeout(function(){ card.style.display='none'; }, 1200);
        } else { msg.style.color='var(--risk)'; msg.textContent='Échec : '+(j.raison||r.status);
          card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); }
      }catch(e){ msg.style.color='var(--risk)'; msg.textContent='Erreur réseau';
        card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); }
    });
  });
});`;
}

/** @param {{source, nom?, items, compteurs, statut, mode?, token?, pass?, lienEspace?, sources?}} data */
function renderPropositions(data) {
  const nom = data.nom || data.source;
  if (data.mode === 'owner') {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Poste de commande — ${esc(nom)}</title><style>${UI_CSS}${EXTRA}</style></head>
<body><div class="owner">
  <div class="obar"><span class="mk"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12h4l2-6 4 12 2-6h5"/></svg></span><span class="wm">nova<span>lis</span></span></div>
  <div class="osub">${esc(nom)} · Novalis a déjà fait le travail — vous n'avez qu'à dire oui.</div>
  ${ownerCorps(data)}
  <div class="pagefoot">Rien ne part sans votre approbation. Ceci est votre espace privé Novalis.</div>
</div><script>${ownerScript(data)}</script></body></html>`;
  }
  return page({
    title: 'Poste de commande',
    subtitle: `${esc(nom)} · Novalis a déjà fait le travail`,
    active: 'propositions',
    source: data.source, sources: data.sources, pass: data.pass, alertes: data.alertes,
    extraCss: EXTRA,
    contentHtml: consoleAdmin(data),
    bodyScript: scriptAdmin(data),
  });
}

module.exports = { renderPropositions, esc };
