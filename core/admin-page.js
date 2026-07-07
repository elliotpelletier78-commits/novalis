'use strict';
// ── Page admin des runs : l'outil d'exploitation quotidien ───────────
// Server-rendered + vanilla JS, aucun framework : c'est une page interne
// pour UNE personne. Le mot de passe vient de l'URL (?pass=) au premier
// accès, stocké en localStorage, puis envoyé en header x-admin-pass.
// Volontairement AUCUNE valeur de credential affichable ici.

function renderAdminHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>Novalis — Runs</title>
<style>
  :root{--noir:#15110B;--panel:#241C12;--cream:#F2E9DA;--dim:#C2B49A;--gold:#C9A24B;--copper:#B5651D;--ok:#7BAE7F;--err:#C96B4B}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--noir);color:var(--cream);font:14px/1.6 -apple-system,'Segoe UI',sans-serif;padding:28px}
  h1{font-size:20px;margin-bottom:4px} h1 em{color:var(--gold);font-style:normal}
  .sub{color:var(--dim);font-size:12px;margin-bottom:24px}
  section{background:var(--panel);border-radius:8px;padding:18px 20px;margin-bottom:20px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.14em;color:var(--gold);margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{color:var(--dim);text-align:left;font-weight:500;padding:6px 10px;border-bottom:1px solid rgba(242,233,218,.12)}
  td{padding:7px 10px;border-bottom:1px solid rgba(242,233,218,.06);vertical-align:top}
  .badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;letter-spacing:.04em}
  .b-done{background:rgba(123,174,127,.16);color:var(--ok)} .b-running{background:rgba(201,162,75,.16);color:var(--gold)}
  .b-queued{background:rgba(194,180,154,.14);color:var(--dim)} .b-dead,.b-failed{background:rgba(201,107,75,.16);color:var(--err)}
  button{background:var(--gold);color:var(--noir);border:0;border-radius:16px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer}
  button.ghost{background:transparent;border:1px solid rgba(242,233,218,.3);color:var(--cream)}
  button:hover{opacity:.85}
  .steps{margin:6px 0 4px;padding-left:0;list-style:none;font-size:12px;color:var(--dim)}
  .steps li{padding:2px 0}
  .err-txt{color:var(--err);font-size:12px;max-width:520px;word-break:break-word}
  form{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input,select{background:var(--noir);border:1px solid rgba(242,233,218,.2);color:var(--cream);border-radius:6px;padding:7px 10px;font-size:13px}
  input[name=url]{min-width:320px}
  #msg{font-size:12px;color:var(--gold);margin-left:6px}
  .num{text-align:right;font-variant-numeric:tabular-nums}
</style>
</head>
<body>
<h1>Novalis <em>· exploitation</em></h1>
<p class="sub">File de jobs, traçabilité par step, coûts IA par client. Rafraîchissement auto (10 s).</p>

<section>
  <h2>Lancer un audit</h2>
  <form id="frm">
    <select name="type" id="selType">
      <option value="demo-prospect">demo-prospect (audit + site démo)</option>
      <option value="audit-prospect">audit-prospect (audit seul)</option>
    </select>
    <input name="clientId" type="number" value="1" min="1" style="width:80px" title="ID client">
    <input name="url" type="url" placeholder="https://site-de-la-pme.com" required>
    <select name="secteur" id="selSecteur">
      <option value="restaurant">restaurant</option><option value="garage">garage</option>
      <option value="salon">salon</option><option value="construction">construction</option>
      <option value="health">santé</option><option value="fitness">fitness</option>
      <option value="plombier">plombier</option><option value="electricien">électricien</option>
    </select>
    <input name="ville" placeholder="Ville (optionnel)" style="width:140px">
    <button type="submit">Lancer</button><span id="msg"></span>
  </form>
</section>

<section>
  <h2>Runs récents</h2>
  <table>
    <thead><tr><th>#</th><th>Type</th><th>Client</th><th>Statut</th><th>Tentatives</th><th>Créé</th><th>Détail / erreur</th><th></th></tr></thead>
    <tbody id="runs"><tr><td colspan="8" style="color:var(--dim)">Chargement…</td></tr></tbody>
  </table>
</section>

<section>
  <h2>Coûts IA du mois — par client</h2>
  <table>
    <thead><tr><th>Client</th><th class="num">Appels</th><th class="num">Tokens in</th><th class="num">Tokens out</th><th class="num">Coût</th></tr></thead>
    <tbody id="costs"><tr><td colspan="5" style="color:var(--dim)">Chargement…</td></tr></tbody>
  </table>
</section>

<script>
(function(){
  const qs=new URLSearchParams(location.search);
  if(qs.get('pass')){localStorage.setItem('novalis_admin',qs.get('pass'));history.replaceState(null,'',location.pathname);}
  const PASS=localStorage.getItem('novalis_admin')||'';
  const H={'x-admin-pass':PASS,'Content-Type':'application/json'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function api(path,opts){
    const r=await fetch(path,Object.assign({headers:H},opts));
    if(r.status===401){document.body.innerHTML='<p style="padding:40px">Accès refusé — rouvre la page avec ?pass=TON_MOT_DE_PASSE</p>';throw new Error('401');}
    return r.json();
  }

  const detailsOuverts=new Set();
  async function chargerRuns(){
    const {runs}=await api('/core/runs?limit=60');
    const tb=document.getElementById('runs');
    tb.innerHTML=runs.length?'':'<tr><td colspan="8" style="color:var(--dim)">Aucun run — lance un audit ci-dessus.</td></tr>';
    for(const j of runs){
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+j.id+'</td><td>'+esc(j.type)+'</td><td>'+esc(j.client_nom)+'</td>'+
        '<td><span class="badge b-'+j.status+'">'+j.status+'</span></td>'+
        '<td>'+j.attempts+'/'+j.max_attempts+'</td><td>'+esc(j.created_at)+'</td>'+
        '<td>'+(j.error_text?'<div class="err-txt">'+esc(j.error_text)+'</div>':'')+
          (j.output&&j.output.demo_url?'<a href="'+esc(j.output.demo_url)+'" target="_blank" style="color:var(--gold)">Voir la démo →</a>':'')+
          '<ul class="steps" id="st-'+j.id+'"></ul></td>'+
        '<td>'+(j.status==='dead'||j.status==='failed'
          ?'<button data-rq="'+j.id+'">Relancer</button> '
          :'')+'<button class="ghost" data-st="'+j.id+'">Steps</button></td>';
      tb.appendChild(tr);
      if(detailsOuverts.has(j.id))chargerSteps(j.id);
    }
    tb.querySelectorAll('[data-rq]').forEach(b=>b.onclick=async()=>{await api('/core/runs/'+b.dataset.rq+'/requeue',{method:'POST'});chargerRuns();});
    tb.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{const id=+b.dataset.st;detailsOuverts.has(id)?detailsOuverts.delete(id):detailsOuverts.add(id);chargerRuns();});
  }
  async function chargerSteps(id){
    const {steps}=await api('/core/runs/'+id);
    const ul=document.getElementById('st-'+id);
    if(!ul)return;
    ul.innerHTML=steps.map(s=>'<li>'+(s.status==='done'?'✅':s.status==='failed'?'❌':'⏳')+' '+esc(s.step_name)+
      ' <span style="opacity:.6">(essai '+s.attempt+', '+esc(s.started_at)+')</span>'+
      (s.error_text?' — <span class="err-txt">'+esc(s.error_text)+'</span>':'')+'</li>').join('');
  }
  async function chargerCouts(){
    const {mois_courant}=await api('/core/costs');
    document.getElementById('costs').innerHTML=mois_courant.map(c=>
      '<tr><td>'+esc(c.nom)+'</td><td class="num">'+c.appels+'</td><td class="num">'+c.tokens_in.toLocaleString()+'</td>'+
      '<td class="num">'+c.tokens_out.toLocaleString()+'</td><td class="num">'+(c.cout_cents/100).toFixed(2)+' $US</td></tr>').join('');
  }
  // Le champ secteur ne concerne que demo-prospect
  const majSecteur=()=>{const demo=document.getElementById('selType').value==='demo-prospect';
    document.getElementById('selSecteur').style.display=demo?'':'none';
    document.querySelector('input[name=ville]').style.display=demo?'':'none';};
  document.getElementById('selType').onchange=majSecteur;majSecteur();

  document.getElementById('frm').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const payload={url:f.get('url')};
    if(f.get('type')==='demo-prospect'){payload.secteur=f.get('secteur');if(f.get('ville'))payload.ville=f.get('ville');}
    const r=await api('/core/enqueue',{method:'POST',body:JSON.stringify({type:f.get('type'),clientId:+f.get('clientId'),payload})});
    document.getElementById('msg').textContent=r.ok?('✓ job #'+r.id+' en file'):('Erreur: '+(r.error||'?'));
    chargerRuns();
  };
  chargerRuns();chargerCouts();
  setInterval(()=>{chargerRuns();chargerCouts();},10000);
})();
</script>
</body>
</html>`;
}

module.exports = { renderAdminHtml };
