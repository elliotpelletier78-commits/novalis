'use strict';
// ── Novalis Devis — catalogue de services + composeur (coquille d'app) ─
// Deux panneaux : « Préparer une soumission » et « Vos services & prix ».

const { esc, page } = require('./ui');

function dollars(cents) {
  if (cents == null) return 'sur devis';
  return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });
}

const EXTRA = `
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px 24px;box-shadow:var(--sh-sm);margin-bottom:16px}
.panel h3{font-size:15px;font-weight:660;letter-spacing:-.005em}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 16px}
.srv{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line-2)}
.srv:last-child{border-bottom:none}
.srv .pick{width:20px;height:20px;accent-color:var(--brand);cursor:pointer;flex:none}
.srv .nm{flex:1;font-weight:600;font-size:14.5px}
.srv .pr{font-variant-numeric:tabular-nums;color:var(--ink-2);font-size:14px;white-space:nowrap}
.srv .qt{width:58px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:8px;padding:6px 8px;text-align:center}
.srv .del{font-size:12px;color:var(--muted);background:none;border:none;cursor:pointer;text-decoration:underline}
.srv .del:hover{color:var(--risk)}
.drow{display:grid;grid-template-columns:2fr 1fr auto;gap:10px;align-items:end;margin-top:14px}
.panel label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.panel input{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.panel input:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.dbtn{font-family:var(--sans);font-size:14px;font-weight:640;color:#fff;background:var(--brand);border:none;border-radius:var(--r-sm);padding:11px 20px;cursor:pointer}
.dbtn:hover{filter:brightness(1.07)}
.dbtn.ghost{background:var(--panel);color:var(--ink-2);border:1px solid var(--line)}
.msg{margin-left:10px;font-size:13px;color:var(--ok)}
.cli{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px}
.empty{color:var(--muted);font-size:13.5px;padding:8px 0}
.total{margin-top:14px;font-size:22px;font-weight:800;letter-spacing:-.02em;text-align:right}
@media(max-width:640px){.drow,.cli{grid-template-columns:1fr}}
`;

function renderDevis(d) {
  const nom = d.nom || d.source;
  const services = d.services || [];
  const content = `
  <div class="panel">
    <h3>Préparer une soumission</h3>
    <div class="hint">Choisissez le client et les services. Novalis assemble le devis et le dépose dans votre poste de commande, prêt à approuver.</div>
    ${services.length ? `
    <div class="cli">
      <label>Nom du client<input id="cli-nom" placeholder="Ex. M. Tremblay"></label>
      <label>Courriel du client<input id="cli-mail" placeholder="client@courriel.ca"></label>
    </div>
    <div id="srv-pick">
      ${services.map(s => `<div class="srv">
        <input class="pick" type="checkbox" data-id="${s.id}" data-nom="${esc(s.nom)}" data-prix="${s.prix_cents == null ? '' : s.prix_cents}">
        <span class="nm">${esc(s.nom)}${s.unite ? ` <span style="color:var(--muted);font-weight:400">/ ${esc(s.unite)}</span>` : ''}</span>
        <input class="qt" type="number" min="1" value="1" data-qt="${s.id}">
        <span class="pr">${dollars(s.prix_cents)}</span>
      </div>`).join('')}
    </div>
    <div class="total" id="total">Total : ${dollars(0)}</div>
    <button class="dbtn" id="creer" style="margin-top:12px">Préparer le devis</button><span class="msg" id="msg-creer"></span>
    ` : '<div class="empty">Ajoutez d\'abord vos services ci-dessous.</div>'}
  </div>

  <div class="panel">
    <h3>Vos services & prix</h3>
    <div class="hint">Laissez le prix vide pour « sur devis ». Les taxes ne sont jamais incluses ici.</div>
    <div id="liste">
      ${services.length ? services.map(s => `<div class="srv">
        <span class="nm">${esc(s.nom)}${s.unite ? ` <span style="color:var(--muted);font-weight:400">/ ${esc(s.unite)}</span>` : ''}</span>
        <span class="pr">${dollars(s.prix_cents)}</span>
        <button class="del" data-del="${s.id}">retirer</button>
      </div>`).join('') : '<div class="empty">Aucun service pour l\'instant.</div>'}
    </div>
    <div class="drow">
      <label>Service<input id="s-nom" placeholder="Ex. Changement de pneus"></label>
      <label>Prix ($, vide = sur devis)<input id="s-prix" type="number" min="0" step="0.01" placeholder="—"></label>
      <button class="dbtn ghost" id="s-add">Ajouter</button>
    </div>
    <span class="msg" id="msg-add"></span>
  </div>
  <div class="pagefoot">Une soumission, pas une facture. Taxes en sus. Valide 30 jours.</div>`;

  const bodyScript = `var SOURCE=${JSON.stringify(d.source)};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
async function poste(url, body){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});}
function fmt(c){return (c/100).toLocaleString('fr-CA',{style:'currency',currency:'CAD',minimumFractionDigits:2});}
function recalc(){var t=0;document.querySelectorAll('#srv-pick .pick').forEach(function(p){
  if(p.checked && p.getAttribute('data-prix')!==''){var q=parseInt(document.querySelector('[data-qt="'+p.getAttribute('data-id')+'"]').value,10)||1;t+=parseInt(p.getAttribute('data-prix'),10)*q;}});
  var el=document.getElementById('total'); if(el) el.textContent='Total : '+fmt(t);}
document.querySelectorAll('#srv-pick .pick, #srv-pick .qt').forEach(function(el){el.addEventListener('input',recalc);});
var addBtn=document.getElementById('s-add');
if(addBtn) addBtn.addEventListener('click', async function(){
  var msg=document.getElementById('msg-add'); msg.style.color=''; msg.textContent='';
  var nom=document.getElementById('s-nom').value.trim(); var prix=document.getElementById('s-prix').value;
  if(!nom){msg.style.color='#C0392B';msg.textContent='Nom requis';return;}
  var body={source:SOURCE,nom:nom}; if(prix!=='') body.prix_cents=Math.round(parseFloat(prix)*100);
  var r=await poste('/core/devis/service',body);
  if(r.ok){location.reload();} else {msg.style.color='#C0392B';msg.textContent='Échec ('+r.status+')';}
});
document.querySelectorAll('[data-del]').forEach(function(b){
  b.addEventListener('click', async function(){var r=await poste('/core/devis/service/'+b.getAttribute('data-del')+'/suppr',{}); if(r.ok) location.reload();});
});
var creer=document.getElementById('creer');
if(creer) creer.addEventListener('click', async function(){
  var msg=document.getElementById('msg-creer'); msg.style.color=''; msg.textContent=''; var lignes=[];
  document.querySelectorAll('#srv-pick .pick').forEach(function(p){
    if(p.checked){var q=parseInt(document.querySelector('[data-qt="'+p.getAttribute('data-id')+'"]').value,10)||1;var prix=p.getAttribute('data-prix');
      lignes.push({nom:p.getAttribute('data-nom'),quantite:q,prix_cents:prix===''?null:parseInt(prix,10)});}});
  if(!lignes.length){msg.style.color='#C0392B';msg.textContent='Choisissez au moins un service';return;}
  creer.disabled=true;
  var r=await poste('/core/devis',{source:SOURCE,client:document.getElementById('cli-nom').value.trim(),courriel:document.getElementById('cli-mail').value.trim(),lignes:lignes});
  var j=await r.json().catch(function(){return{};});
  if(r.ok){ msg.style.color='#108000'; msg.textContent='✓ Devis déposé dans le poste de commande';
    setTimeout(function(){location.href='/core/propositions?source='+encodeURIComponent(SOURCE)+(pass()?'&pass='+encodeURIComponent(pass()):'');},900); }
  else { msg.style.color='#C0392B'; msg.textContent='Échec : '+(j.error||r.status); creer.disabled=false; }
});`;

  return page({
    title: 'Devis',
    subtitle: `${esc(nom)} · préparez des soumissions en un clic`,
    active: 'devis', source: d.source, sources: d.sources, pass: d.pass,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderDevis, esc };
