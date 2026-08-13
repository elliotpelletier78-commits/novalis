'use strict';
// ── Novalis Entreprises — le hub d'agence ───────────────────────────
// La vue d'ensemble de tous les commerces opérés : ce qui a besoin d'attention
// en premier, et un bouton pour brancher une nouvelle entreprise.

const { esc, icon, page } = require('./ui');

const EXTRA = `
.ent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.ent{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:18px 20px;text-decoration:none;color:inherit;display:block;transition:border-color .12s,box-shadow .12s}
.ent:hover{border-color:var(--brand);box-shadow:var(--sh)}
.ent .nm{font-size:16px;font-weight:720;letter-spacing:-.01em}
.ent .src{font-size:12px;color:var(--muted);margin-top:1px}
.ent .stats{display:flex;gap:18px;margin-top:14px}
.ent .st .v{font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1}
.ent .st .v.act{color:var(--brand-600)} .ent .st .v.warn{color:var(--warn)}
.ent .st .k{font-size:11px;color:var(--muted);margin-top:3px}
.ent .pret{margin-top:14px;height:6px;border-radius:5px;background:var(--panel);overflow:hidden}
.ent .pret>span{display:block;height:100%;background:var(--brand)}
.ent .pret-l{font-size:11.5px;color:var(--muted);margin-top:5px}
.newcard{border:1.5px dashed var(--line);border-radius:var(--r-lg);padding:18px 20px}
.newcard h3{font-size:15px;font-weight:660;display:flex;align-items:center;gap:8px}
.newcard h3 svg{width:18px;height:18px;color:var(--brand)}
.newcard .hint{font-size:12.5px;color:var(--muted);margin:2px 0 14px}
.newcard .row{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}
.newcard label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.newcard input{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.newcard input:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.newcard .b{font-family:var(--sans);font-size:14px;font-weight:640;color:#fff;background:var(--brand);border:none;border-radius:var(--r-sm);padding:11px 18px;cursor:pointer}
.newcard .b:hover{filter:brightness(1.07)}
.newcard .msg{font-size:13px;margin-top:8px}
@media(max-width:560px){.newcard .row{grid-template-columns:1fr}}
`;

function renderEntreprises(data) {
  const items = data.entreprises || [];
  const cartes = items.map(e => {
    const href = `/core/aujourdhui?source=${encodeURIComponent(e.source)}${data.pass ? '&pass=' + encodeURIComponent(data.pass) : ''}`;
    return `<a class="ent" href="${href}">
      <div class="nm">${esc(e.nom || e.source)}</div><div class="src">${esc(e.source)}</div>
      <div class="stats">
        <div class="st"><div class="v act">${e.aApprouver}</div><div class="k">à approuver</div></div>
        <div class="st"><div class="v ${e.enAttente ? 'warn' : ''}">${e.enAttente}</div><div class="k">en attente</div></div>
      </div>
      <div class="pret"><span style="width:${e.pretPct}%"></span></div>
      <div class="pret-l">Prêt à opérer&nbsp;: ${e.pretPct}%</div>
    </a>`;
  }).join('');

  const content = `
    <div class="section-label">Vos entreprises${items.length ? ' · ' + items.length : ''}</div>
    <div class="ent-grid">
      ${cartes || '<div class="muted" style="grid-column:1/-1;padding:20px">Aucune entreprise branchée pour l\'instant. Ajoutez-en une ci-dessous.</div>'}
    </div>
    <div class="newcard" style="margin-top:18px">
      <h3>${icon('plus')} Nouvelle entreprise</h3>
      <div class="hint">Un identifiant court (le « slug » de son site, ex. garage-beauchemin) et son nom. Vous complétez le branchement ensuite.</div>
      <div class="row">
        <label>Identifiant (slug)<input id="ne-src" placeholder="garage-beauchemin"></label>
        <label>Nom du commerce<input id="ne-nom" placeholder="Garage Beauchemin"></label>
        <button class="b" id="ne-add">Créer</button>
      </div>
      <div class="msg" id="ne-msg"></div>
    </div>
    <div class="pagefoot">Le tableau montre d'abord les commerces qui demandent votre attention.</div>`;

  const bodyScript = `function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
var add=document.getElementById('ne-add');
add&&add.addEventListener('click', async function(){
  var msg=document.getElementById('ne-msg'); msg.style.color=''; msg.textContent='';
  var src=(document.getElementById('ne-src').value||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  var nom=document.getElementById('ne-nom').value.trim();
  if(src.length<2){msg.style.color='#C0392B';msg.textContent='Identifiant trop court (min. 2 caractères, a-z 0-9 -)';return;}
  var r=await fetch('/core/entreprises',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({source:src,nom:nom})});
  if(r.ok){location.href='/core/branchement?source='+encodeURIComponent(src)+(pass()?'&pass='+encodeURIComponent(pass()):'');}
  else{var j=await r.json().catch(function(){return{};});msg.style.color='#C0392B';msg.textContent='Échec : '+(j.error||r.status);}
});`;

  return page({
    title: 'Entreprises',
    subtitle: 'Toutes vos entreprises — ce qui demande attention en premier',
    active: 'entreprises', pass: data.pass,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderEntreprises };
