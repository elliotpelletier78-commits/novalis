'use strict';
// ── Novalis Branchement — l'écran « remettez-nous les clés » ─────────
// Rendu côté serveur, sans build. Même identité visuelle que le cockpit
// Réception. Trois blocs : l'identité de l'entreprise, les clés (connexions)
// et les autorisations. En tête, une progression « prêt à opérer ».

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
  --hair:rgba(236,235,224,.15); --hair-2:rgba(236,235,224,.08);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 36px rgba(0,0,0,.4);
}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:920px;margin:0 auto;padding:clamp(20px,4vw,40px)}
.brand{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.01em}
.brand em{font-style:normal;color:var(--jade)}
.sub{color:var(--muted);font-size:14px;margin:4px 0 24px}
.prog{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow);margin-bottom:16px}
.prog .top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.prog h2{font-family:var(--serif);font-size:19px;font-weight:700}
.prog .pct{font-family:var(--serif);font-size:30px;font-weight:700;color:var(--jade);font-variant-numeric:tabular-nums}
.pbar{height:12px;border-radius:8px;background:var(--panel);overflow:hidden;margin:14px 0 4px}
.pbar>span{display:block;height:100%;background:linear-gradient(90deg,var(--jade),var(--steel));transition:width .4s}
.steps{list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px}
.steps li{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:7px}
.steps li.on{color:var(--ink)}
.dot{width:15px;height:15px;border-radius:50%;flex:none;border:2px solid var(--hair);display:inline-flex;align-items:center;justify-content:center;font-size:10px;line-height:1}
.steps li.on .dot{background:var(--ok);border-color:var(--ok);color:#fff}
.ready{margin-top:14px;padding:11px 15px;border-radius:11px;font-size:14px;font-weight:600}
.ready.yes{background:var(--ok-soft);color:var(--ok)}
.ready.no{background:var(--warn-soft);color:var(--warn)}
.panel{background:var(--card);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;box-shadow:var(--shadow);margin-bottom:16px}
.panel h3{font-family:var(--serif);font-size:17px;font-weight:700}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.grid input,.grid select{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--paper);
  border:1px solid var(--hair);border-radius:9px;padding:10px 12px}
.grid input:focus,.grid select:focus{outline:2px solid var(--jade);outline-offset:1px}
.btn{font-family:var(--sans);font-size:14px;font-weight:650;color:#fff;background:var(--jade);border:none;border-radius:10px;padding:11px 20px;cursor:pointer;margin-top:16px}
.btn:hover{filter:brightness(1.08)}
.btn.ghost{background:var(--panel);color:var(--ink-2);border:1px solid var(--hair)}
.msg{margin-left:12px;font-size:13px;color:var(--ok)}
.cx{display:flex;align-items:flex-start;gap:14px;padding:16px 0;border-bottom:1px solid var(--hair-2)}
.cx:last-child{border-bottom:none}
.cx .body{flex:1;min-width:0}
.cx .t{font-weight:650;font-size:15px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cx .r{font-size:13px;color:var(--muted);margin-top:3px}
.cx .lab{font-size:12.5px;color:var(--ink-2);margin-top:5px}
.chip{font-size:11px;font-weight:700;letter-spacing:.03em;padding:3px 9px;border-radius:999px;white-space:nowrap}
.chip.branche{background:var(--ok-soft);color:var(--ok)}
.chip.a_brancher{background:var(--panel);color:var(--muted)}
.chip.erreur{background:var(--warn-soft);color:var(--warn)}
.chip.soon{background:var(--jade-soft);color:var(--jade)}
.cx .act{flex:none;display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.cx button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid var(--hair);
  background:var(--panel);color:var(--ink-2);cursor:pointer}
.cx button:hover{border-color:var(--jade);color:var(--jade)}
.cx button:disabled{opacity:.5;cursor:not-allowed}
.consent{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid var(--hair-2)}
.consent:last-child{border-bottom:none}
.consent input{width:20px;height:20px;margin-top:2px;accent-color:var(--jade);flex:none;cursor:pointer}
.consent .t{font-weight:650;font-size:15px}
.consent .r{font-size:13px;color:var(--muted);margin-top:2px}
.foot{margin-top:26px;color:var(--faint);font-size:12.5px;text-align:center}
.vault-note{font-size:12px;color:var(--muted);margin-top:8px;padding:10px 14px;background:var(--panel);border-radius:10px}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
`;

function chip(statut, dispo) {
  if (!dispo && statut !== 'branche') return '<span class="chip soon">bientôt</span>';
  const label = { branche: 'branché', a_brancher: 'à brancher', erreur: 'erreur' }[statut] || statut;
  return `<span class="chip ${statut}">${label}</span>`;
}

function ligneConnexion(c) {
  const peut = c.dispo || c.statut === 'branche';
  const btn = c.statut === 'branche'
    ? `<button data-cx="${esc(c.type)}" data-op="debrancher">Débrancher</button>`
    : `<button data-cx="${esc(c.type)}" data-op="brancher"${peut ? '' : ' disabled'}>Brancher</button>`;
  return `<div class="cx">
    <div class="body">
      <div class="t">${esc(c.titre)} ${chip(c.statut, c.dispo)}${c.requis ? '<span class="chip a_brancher">requis</span>' : ''}</div>
      <div class="r">${esc(c.role)}</div>
      ${c.compte_label ? `<div class="lab">Compte&nbsp;: ${esc(c.compte_label)}</div>` : ''}
      ${c.detail ? `<div class="lab" style="color:var(--warn)">${esc(c.detail)}</div>` : ''}
    </div>
    <div class="act">${btn}</div>
  </div>`;
}

/** @param e sortie de branchement.etat() */
function renderBranchement(e) {
  const nom = e.nom || e.source;
  const secteurs = ['', 'garage', 'plombier', 'electricien', 'restaurant', 'salon', 'health', 'construction', 'fitness'];
  const secteurLbl = { garage: 'Garage', plombier: 'Plombier', electricien: 'Électricien', restaurant: 'Restaurant', salon: 'Salon', health: 'Clinique', construction: 'Construction', fitness: 'Gym' };

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Branchement — ${esc(nom)}</title><style>${CSS}</style></head><body><div class="wrap">
  <div class="brand">Novalis <em>Branchement</em></div>
  <div class="sub">${esc(nom)} · remettez les clés, Novalis s'occupe du reste.</div>

  <div class="prog">
    <div class="top"><h2>Prêt à opérer</h2><div class="pct">${e.pret_pct}%</div></div>
    <div class="pbar"><span style="width:${e.pret_pct}%"></span></div>
    <ul class="steps">${e.etapes.map(s =>
      `<li class="${s.fait ? 'on' : ''}"><span class="dot">${s.fait ? '✓' : ''}</span>${esc(s.titre)}</li>`).join('')}</ul>
    <div class="ready ${e.pret ? 'yes' : 'no'}">${e.pret
      ? '✓ Tout est en place — Novalis peut commencer à travailler pour vous.'
      : 'Complétez les étapes ci-dessus pour que Novalis se mette au travail.'}</div>
  </div>

  <div class="panel">
    <h3>Votre entreprise</h3>
    <div class="hint">L'essentiel pour que tout ce qu'on prépare vous ressemble.</div>
    <div class="grid">
      <label>Nom du commerce<input id="f-nom" value="${esc(e.identite.nom || '')}" placeholder="Ex. Garage Beauchemin"></label>
      <label>Secteur<select id="f-secteur">${secteurs.map(s =>
        `<option value="${s}"${s === (e.identite.secteur || '') ? ' selected' : ''}>${s ? secteurLbl[s] : '—'}</option>`).join('')}</select></label>
      <label>Ville<input id="f-ville" value="${esc(e.identite.ville || '')}" placeholder="Montréal"></label>
      <label>Téléphone<input id="f-tel" value="${esc(e.identite.telephone || '')}" placeholder="514 555-0123"></label>
      <label>Courriel du commerce<input id="f-courriel" value="${esc(e.identite.courriel || '')}" placeholder="info@commerce.ca"></label>
      <label>Site web<input id="f-site" value="${esc(e.identite.site_url || '')}" placeholder="https://…"></label>
    </div>
    <button class="btn" id="save-ent">Enregistrer</button><span class="msg" id="msg-ent"></span>
  </div>

  <div class="panel">
    <h3>Les clés</h3>
    <div class="hint">Ce que vous branchez, Novalis peut le tenir à jour et l'opérer — jamais sans votre autorisation.</div>
    ${e.connexions.map(ligneConnexion).join('')}
    <div class="vault-note">🔒 Vos accès sont chiffrés dans un coffre (chiffrement à deux niveaux). Ils ne sont jamais affichés, jamais dans nos journaux, et ne servent qu'au moment d'exécuter une action que vous avez approuvée.</div>
  </div>

  <div class="panel">
    <h3>Vos autorisations</h3>
    <div class="hint">Vous décidez de ce que Novalis a le droit de faire. Rien de plus.</div>
    ${e.consentements.map(c => `<label class="consent">
      <input type="checkbox" data-consent="${esc(c.cle)}"${c.actif ? ' checked' : ''}>
      <span><span class="t">${esc(c.titre)}</span><div class="r">${esc(c.role)}</div></span></label>`).join('')}
    <button class="btn" id="save-consent">Enregistrer mes choix</button><span class="msg" id="msg-consent"></span>
  </div>

  <div class="foot">Novalis Branchement · vos clés, vos règles. Vous pouvez tout débrancher à tout moment.</div>
</div>
<script>
var SOURCE=${JSON.stringify(e.source)};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
async function poste(url, body, msgId){
  var msg=document.getElementById(msgId); if(msg){msg.style.color='';msg.textContent='';}
  try{
    var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});
    if(r.ok){ if(msg){msg.textContent='✓ Enregistré';} setTimeout(function(){location.reload();},500); return true; }
    if(msg){msg.style.color='#8A5E22';msg.textContent='Non enregistré ('+r.status+')';}
  }catch(e){ if(msg){msg.style.color='#8A5E22';msg.textContent='Erreur réseau';} }
  return false;
}
document.getElementById('save-ent').addEventListener('click',function(){
  poste('/core/branchement',{source:SOURCE,
    nom:document.getElementById('f-nom').value.trim(),
    secteur:document.getElementById('f-secteur').value,
    ville:document.getElementById('f-ville').value.trim(),
    telephone:document.getElementById('f-tel').value.trim(),
    courriel:document.getElementById('f-courriel').value.trim(),
    site_url:document.getElementById('f-site').value.trim()},'msg-ent');
});
document.getElementById('save-consent').addEventListener('click',function(){
  var c={};document.querySelectorAll('[data-consent]').forEach(function(el){c[el.getAttribute('data-consent')]=el.checked;});
  poste('/core/branchement/consentement',{source:SOURCE,consentements:c},'msg-consent');
});
document.querySelectorAll('[data-cx]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var type=btn.getAttribute('data-cx'), op=btn.getAttribute('data-op');
    if(op==='debrancher'){ poste('/core/branchement/connexion',{source:SOURCE,type:type,statut:'a_brancher'}); return; }
    var label=prompt('Identifiant du compte à brancher (ex. adresse courriel). Le secret, lui, restera dans le coffre chiffré :');
    if(label===null) return;
    var secret=prompt('Clé ou jeton d\\'accès (optionnel — laissez vide si non applicable). Il sera chiffré, jamais affiché :')||'';
    poste('/core/branchement/connexion',{source:SOURCE,type:type,statut:'branche',label:label,secret:secret});
  });
});
</script>
</body></html>`;
}

module.exports = { renderBranchement, esc };
