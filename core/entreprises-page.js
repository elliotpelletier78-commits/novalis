'use strict';
// ── Novalis Entreprises — le hub d'agence ───────────────────────────
// Vue d'ensemble des commerces opérés, triés par attention. La création passe
// par un slide-over (bouton primaire en tête), pas un formulaire permanent.

const { esc, icon, page } = require('./ui');

const ARROW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const EXTRA = `
.ent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
.ent{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:18px 20px 16px;text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:border-color .14s,box-shadow .14s,transform .14s}
.ent:hover{border-color:var(--brand);box-shadow:var(--sh)}
.ent .hd{display:flex;align-items:center;gap:9px}
.ent .sdot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--ok)}
.ent .sdot.warn{background:var(--warn)} .ent .sdot.urgent{background:var(--risk)}
.ent .nm{font-size:16px;font-weight:720;letter-spacing:-.01em;flex:1;min-width:0}
.ent .stpill{font-size:10.5px;font-weight:700;letter-spacing:.02em;padding:3px 9px;border-radius:var(--r-pill);background:var(--ok-soft);color:var(--ok);white-space:nowrap}
.ent .stpill.warn{background:var(--warn-soft);color:var(--warn)} .ent .stpill.urgent{background:var(--risk-soft);color:var(--risk)}
.ent .src{font-size:12px;color:var(--muted);margin:2px 0 0 18px}
.ent .stats{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:16px}
.ent .st .v{font-size:24px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--ink)}
.ent .st .v.act{color:var(--brand-600)} .ent .st .v.warn{color:var(--warn)}
.ent .st .k{font-size:10.5px;color:var(--muted);margin-top:4px}
.ent .pret{margin-top:16px;height:5px;border-radius:5px;background:var(--panel);overflow:hidden}
.ent .pret>span{display:block;height:100%;background:var(--brand)}
.ent .foot{display:flex;align-items:center;justify-content:space-between;margin-top:9px}
.ent .pret-l{font-size:11.5px;color:var(--muted)}
.ent .cta{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:640;color:var(--brand-600)}
.ent .cta svg{transition:transform .14s}
.ent:hover .cta svg{transform:translateX(2px)}
.ne-msg{font-size:13px;margin-right:auto}
`;

function renderEntreprises(data) {
  const items = data.entreprises || [];
  const cartes = items.map((e) => {
    const href = `/core/aujourdhui?source=${encodeURIComponent(e.source)}${data.pass ? '&pass=' + encodeURIComponent(data.pass) : ''}`;
    const ton = e.enAttente ? 'urgent' : (e.aApprouver || e.pretPct < 100) ? 'warn' : '';
    const stTxt = ton === 'urgent' ? 'Attention' : ton === 'warn' ? 'À compléter' : 'Actif';
    return `<a class="ent" href="${href}">
      <div class="hd"><span class="sdot ${ton}"></span><div class="nm">${esc(e.nom || e.source)}</div><span class="stpill ${ton}">${stTxt}</span></div>
      <div class="src">${esc(e.source)}</div>
      <div class="stats">
        <div class="st"><div class="v act">${e.aApprouver}</div><div class="k">à approuver</div></div>
        <div class="st"><div class="v ${e.enAttente ? 'warn' : ''}">${e.enAttente}</div><div class="k">en attente</div></div>
        <div class="st"><div class="v">${e.contacts}</div><div class="k">contacts 30j</div></div>
        <div class="st"><div class="v">${e.rdvSoon}</div><div class="k">RDV bientôt</div></div>
      </div>
      <div class="pret"><span style="width:${e.pretPct}%"></span></div>
      <div class="foot"><span class="pret-l">Prêt à opérer · ${e.pretPct}%</span><span class="cta">Gérer ${ARROW}</span></div>
    </a>`;
  }).join('');

  const content = `
    <div class="section-label">Vos entreprises${items.length ? ' · ' + items.length : ''}</div>
    <div class="ent-grid">
      ${cartes || '<div class="muted" style="grid-column:1/-1;padding:24px;border:1px dashed var(--line);border-radius:var(--r-lg);text-align:center">Aucune entreprise branchée. Cliquez « + Nouvelle entreprise » en haut à droite.</div>'}
    </div>
    <div class="pagefoot">Le tableau montre d'abord les commerces qui demandent votre attention.</div>

    <div class="sheet-ov" id="sheet-ov"></div>
    <aside class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Nouvelle entreprise">
      <div class="sheet-h"><h2>Nouvelle entreprise</h2><button class="x" id="sheet-x" aria-label="Fermer">×</button></div>
      <div class="sheet-b">
        <div style="font-size:13px;color:var(--muted)">Un identifiant court (le « slug » de son site, ex. garage-beauchemin) et son nom. Vous complétez le branchement ensuite.</div>
        <label>Identifiant (slug)<input id="ne-src" placeholder="garage-beauchemin" autocomplete="off"></label>
        <label>Nom du commerce<input id="ne-nom" placeholder="Garage Beauchemin" autocomplete="off"></label>
      </div>
      <div class="sheet-f"><span class="ne-msg" id="ne-msg"></span><button class="btn btn-ghost" id="ne-cancel">Annuler</button><button class="btn btn-primary" id="ne-add">Créer &amp; brancher</button></div>
    </aside>`;

  const bodyScript = `function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
var ov=document.getElementById('sheet-ov'),sh=document.getElementById('sheet');
function open(){ov.classList.add('open');sh.classList.add('open');var i=document.getElementById('ne-src');if(i)i.focus();}
function close(){ov.classList.remove('open');sh.classList.remove('open');}
var btnNew=document.getElementById('ent-new'); if(btnNew) btnNew.addEventListener('click',open);
ov.addEventListener('click',close);
document.getElementById('sheet-x').addEventListener('click',close);
document.getElementById('ne-cancel').addEventListener('click',close);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sh.classList.contains('open'))close();});
document.getElementById('ne-add').addEventListener('click', async function(){
  var msg=document.getElementById('ne-msg'); msg.style.color=''; msg.textContent='';
  var src=(document.getElementById('ne-src').value||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  var nom=document.getElementById('ne-nom').value.trim();
  if(src.length<2){msg.style.color='#C0392B';msg.textContent='Identifiant trop court (a-z 0-9 -).';return;}
  var r=await fetch('/core/entreprises',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({source:src,nom:nom})});
  if(r.ok){location.href='/core/branchement?source='+encodeURIComponent(src)+(pass()?'&pass='+encodeURIComponent(pass()):'');}
  else{var j=await r.json().catch(function(){return{};});msg.style.color='#C0392B';msg.textContent='Échec : '+(j.error||r.status);}
});`;

  return page({
    title: 'Entreprises',
    subtitle: 'Toutes vos entreprises — ce qui demande attention en premier',
    active: 'entreprises', pass: data.pass,
    actionsHtml: `<button class="btn btn-primary" id="ent-new">${icon('plus')} Nouvelle entreprise</button>`,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderEntreprises };
