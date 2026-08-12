'use strict';
// ── Novalis Devis — page : catalogue de services + composeur ─────────
// Deux panneaux : « Vos services & prix » (définis une fois) et « Préparer une
// soumission » (choisir client + services + quantités → dépose un devis dans la
// file d'approbation). Même identité visuelle que Réception.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function dollars(cents) {
  if (cents == null) return 'sur devis';
  return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });
}

const CSS = `
:root{
  --paper:#FAF9F4; --card:#FFFFFF; --panel:#F3F1E9; --ink:#181B14; --ink-2:#3C4034;
  --muted:#6A6F60; --faint:rgba(24,27,20,.5);
  --jade:#2B5B42; --jade-soft:rgba(43,91,66,.10); --steel:#3E5F7D;
  --ok:#2E6B45; --ok-soft:rgba(46,107,69,.12);
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
  --hair:rgba(236,235,224,.15); --hair-2:rgba(236,235,224,.08);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 36px rgba(0,0,0,.4);
}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:clamp(20px,4vw,40px)}
.brand{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.01em}
.brand em{font-style:normal;color:var(--jade)}
.sub{color:var(--muted);font-size:14px;margin:4px 0 22px}
.panel{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow);margin-bottom:16px}
.panel h3{font-family:var(--serif);font-size:17px;font-weight:700}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 16px}
.srv{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--hair-2)}
.srv:last-child{border-bottom:none}
.srv .pick{width:20px;height:20px;accent-color:var(--jade);cursor:pointer;flex:none}
.srv .nm{flex:1;font-weight:600;font-size:14.5px}
.srv .pr{font-variant-numeric:tabular-nums;color:var(--ink-2);font-size:14px;white-space:nowrap}
.srv .qt{width:58px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--hair);border-radius:8px;padding:6px 8px;text-align:center}
.srv .del{font-size:12px;color:var(--muted);background:none;border:none;cursor:pointer;text-decoration:underline}
.srv .del:hover{color:#9C4632}
.row{display:grid;grid-template-columns:2fr 1fr auto;gap:10px;align-items:end;margin-top:14px}
label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
input{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--hair);border-radius:9px;padding:10px 12px}
input:focus{outline:2px solid var(--jade);outline-offset:1px}
.btn{font-family:var(--sans);font-size:14px;font-weight:650;color:#fff;background:var(--jade);border:none;border-radius:10px;padding:11px 20px;cursor:pointer}
.btn:hover{filter:brightness(1.08)}
.btn.ghost{background:var(--panel);color:var(--ink-2);border:1px solid var(--hair)}
.msg{margin-left:10px;font-size:13px;color:var(--ok)}
.cli{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px}
.empty{color:var(--muted);font-size:13.5px;padding:8px 0}
.total{margin-top:14px;font-family:var(--serif);font-size:18px;font-weight:700;text-align:right}
.foot{margin-top:26px;color:var(--faint);font-size:12.5px;text-align:center}
@media(max-width:640px){.row,.cli{grid-template-columns:1fr}}
`;

function renderDevis(d) {
  const nom = d.nom || d.source;
  const services = d.services || [];
  const S = JSON.stringify(d.source);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Devis — ${esc(nom)}</title><style>${CSS}</style></head><body><div class="wrap">
  <div class="brand">Novalis <em>Devis</em></div>
  <div class="sub">${esc(nom)} · définissez vos services une fois, préparez des soumissions en un clic.</div>

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
    <button class="btn" id="creer" style="margin-top:12px">Préparer le devis</button><span class="msg" id="msg-creer"></span>
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
    <div class="row">
      <label>Service<input id="s-nom" placeholder="Ex. Changement de pneus"></label>
      <label>Prix ($, vide = sur devis)<input id="s-prix" type="number" min="0" step="0.01" placeholder="—"></label>
      <button class="btn ghost" id="s-add">Ajouter</button>
    </div>
    <span class="msg" id="msg-add"></span>
  </div>

  <div class="foot">Une soumission, pas une facture. Taxes en sus. Valide 30 jours.</div>
</div>
<script>
var SOURCE=${S};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
async function poste(url, body){
  var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});
  return r;
}
function fmt(c){return (c/100).toLocaleString('fr-CA',{style:'currency',currency:'CAD',minimumFractionDigits:2});}
function recalc(){
  var t=0; document.querySelectorAll('#srv-pick .pick').forEach(function(p){
    if(p.checked && p.getAttribute('data-prix')!==''){
      var q=parseInt(document.querySelector('[data-qt="'+p.getAttribute('data-id')+'"]').value,10)||1;
      t+=parseInt(p.getAttribute('data-prix'),10)*q;
    }});
  var el=document.getElementById('total'); if(el) el.textContent='Total : '+fmt(t);
}
document.querySelectorAll('#srv-pick .pick, #srv-pick .qt').forEach(function(el){el.addEventListener('input',recalc);});
var addBtn=document.getElementById('s-add');
if(addBtn) addBtn.addEventListener('click', async function(){
  var msg=document.getElementById('msg-add'); msg.style.color=''; msg.textContent='';
  var nom=document.getElementById('s-nom').value.trim();
  var prix=document.getElementById('s-prix').value;
  if(!nom){msg.style.color='#9C4632';msg.textContent='Nom requis';return;}
  var body={source:SOURCE,nom:nom};
  if(prix!=='') body.prix_cents=Math.round(parseFloat(prix)*100);
  var r=await poste('/core/devis/service',body);
  if(r.ok){location.reload();} else {msg.style.color='#9C4632';msg.textContent='Échec ('+r.status+')';}
});
document.querySelectorAll('[data-del]').forEach(function(b){
  b.addEventListener('click', async function(){
    var r=await poste('/core/devis/service/'+b.getAttribute('data-del')+'/suppr',{});
    if(r.ok) location.reload();
  });
});
var creer=document.getElementById('creer');
if(creer) creer.addEventListener('click', async function(){
  var msg=document.getElementById('msg-creer'); msg.style.color=''; msg.textContent='';
  var lignes=[];
  document.querySelectorAll('#srv-pick .pick').forEach(function(p){
    if(p.checked){
      var q=parseInt(document.querySelector('[data-qt="'+p.getAttribute('data-id')+'"]').value,10)||1;
      var prix=p.getAttribute('data-prix');
      lignes.push({nom:p.getAttribute('data-nom'),quantite:q,prix_cents:prix===''?null:parseInt(prix,10)});
    }});
  if(!lignes.length){msg.style.color='#9C4632';msg.textContent='Choisissez au moins un service';return;}
  creer.disabled=true;
  var r=await poste('/core/devis',{source:SOURCE,client:document.getElementById('cli-nom').value.trim(),
    courriel:document.getElementById('cli-mail').value.trim(),lignes:lignes});
  var j=await r.json().catch(function(){return{};});
  if(r.ok){ msg.style.color='#2E6B45'; msg.textContent='✓ Devis déposé dans le poste de commande';
    setTimeout(function(){location.href='/core/propositions?source='+encodeURIComponent(SOURCE);},900); }
  else { msg.style.color='#9C4632'; msg.textContent='Échec : '+(j.error||r.status); creer.disabled=false; }
});
</script>
</body></html>`;
}

module.exports = { renderDevis, esc };
