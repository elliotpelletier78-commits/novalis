'use strict';
// ── Novalis Branchement — « remettez les clés » (coquille d'app) ─────
// Progression « prêt à opérer », identité, connexions (coffre chiffré),
// autorisations.

const { esc, page } = require('./ui');

const EXTRA = `
.prog{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px 24px;box-shadow:var(--sh-sm);margin-bottom:16px}
.prog .top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.prog h2{font-size:16px;font-weight:680}
.prog .pct{font-size:40px;font-weight:800;letter-spacing:-.03em;color:var(--brand-600);line-height:1}
.pbar{height:10px;border-radius:6px;background:var(--panel);overflow:hidden;margin:14px 0 4px}
.pbar>span{display:block;height:100%;background:var(--brand);transition:width .4s}
.steps{list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;padding:0}
.steps li{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:7px}
.steps li.on{color:var(--ink)}
.dot{width:16px;height:16px;border-radius:50%;flex:none;border:2px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:10px;line-height:1}
.steps li.on .dot{background:var(--ok);border-color:var(--ok);color:#fff}
.ready{margin-top:16px;padding:11px 15px;border-radius:var(--r);font-size:14px;font-weight:600}
.ready.yes{background:var(--ok-soft);color:var(--ok)} .ready.no{background:var(--warn-soft);color:var(--warn)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px 24px;box-shadow:var(--sh-sm);margin-bottom:16px}
.panel h3{font-size:15px;font-weight:660}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 16px}
.bgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.bgrid label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.bgrid input,.bgrid select{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.bgrid input:focus,.bgrid select:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.bbtn{font-family:var(--sans);font-size:14px;font-weight:640;color:#fff;background:var(--brand);border:none;border-radius:var(--r-sm);padding:11px 20px;cursor:pointer;margin-top:16px}
.bbtn:hover{filter:brightness(1.07)}
.msg{margin-left:12px;font-size:13px;color:var(--ok)}
.cx{display:flex;align-items:flex-start;gap:14px;padding:16px 0;border-bottom:1px solid var(--line-2)}
.cx:last-child{border-bottom:none}
.cx .body{flex:1;min-width:0}
.cx .t{font-weight:640;font-size:15px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cx .r{font-size:13px;color:var(--muted);margin-top:3px}
.cx .lab{font-size:12.5px;color:var(--ink-2);margin-top:5px}
.chip{font-size:11px;font-weight:700;letter-spacing:.03em;padding:3px 9px;border-radius:var(--r-pill);white-space:nowrap}
.chip.branche{background:var(--ok-soft);color:var(--ok)} .chip.a_brancher{background:var(--panel);color:var(--muted)}
.chip.erreur{background:var(--warn-soft);color:var(--warn)} .chip.soon{background:var(--brand-soft);color:var(--brand-600)}
.cx .act{flex:none}
.cx button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--panel);color:var(--ink-2);cursor:pointer}
.cx button:hover{border-color:var(--brand);color:var(--brand-600)} .cx button:disabled{opacity:.5;cursor:not-allowed}
.consent{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid var(--line-2)}
.consent:last-child{border-bottom:none}
.consent input{width:20px;height:20px;margin-top:2px;accent-color:var(--brand);flex:none;cursor:pointer}
.consent .t{font-weight:640;font-size:15px} .consent .r{font-size:13px;color:var(--muted);margin-top:2px}
.vault-note{font-size:12px;color:var(--muted);margin-top:8px;padding:10px 14px;background:var(--panel);border-radius:var(--r)}
.cxmsg{margin-bottom:14px;padding:10px 14px;border-radius:var(--r);font-size:13.5px;font-weight:600}
.cxmsg.ok{background:var(--ok-soft);color:var(--ok)} .cxmsg.no{background:var(--warn-soft);color:var(--warn)}
.cx a.bbtn{margin-top:0;display:inline-block;text-decoration:none;padding:8px 16px;font-size:13px}
.cxtest{font-size:12.5px;margin-top:7px;font-weight:600} .cxtest:empty{display:none}
.cxtest.ok{color:var(--ok)} .cxtest.err{color:var(--warn)}
.cx .act{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:640px){.bgrid{grid-template-columns:1fr}}
`;

function cx1clic(x, pass, source) {
  const q = 'source=' + encodeURIComponent(source) + (pass ? '&pass=' + encodeURIComponent(pass) : '');
  if (x.connecte) {
    return `<div class="cx"><div class="body">
      <div class="t">${esc(x.titre)} <span class="chip branche">connecté</span></div>
      <div class="r">Autorisé par vous. Novalis agit dans votre compte, en votre nom.</div>
      ${x.label ? `<div class="lab">Compte&nbsp;: ${esc(x.label)}</div>` : ''}
      <div class="cxtest" data-cxtest="${esc(x.provider)}"></div>
    </div><div class="act"><button data-oauth-test="${esc(x.provider)}">Tester</button> <button data-oauth-off="${esc(x.provider)}">Débrancher</button></div></div>`;
  }
  if (!x.configure) {
    return `<div class="cx"><div class="body">
      <div class="t">${esc(x.titre)} <span class="chip soon">à activer</span></div>
      <div class="r">Ce branchement s'active dès que la clé d'application est configurée.</div>
    </div><div class="act"><button disabled>Connecter</button></div></div>`;
  }
  return `<div class="cx"><div class="body">
      <div class="t">${esc(x.titre)} <span class="chip a_brancher">à brancher</span></div>
      <div class="r">Un clic ouvre l'écran de ${esc(x.titre)} pour votre autorisation.</div>
    </div><div class="act"><a class="bbtn" href="/core/connexion/${esc(x.provider)}/start?${q}">Connecter</a></div></div>`;
}

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
  return `<div class="cx"><div class="body">
      <div class="t">${esc(c.titre)} ${chip(c.statut, c.dispo)}${c.requis ? '<span class="chip a_brancher">requis</span>' : ''}</div>
      <div class="r">${esc(c.role)}</div>
      ${c.compte_label ? `<div class="lab">Compte&nbsp;: ${esc(c.compte_label)}</div>` : ''}
      ${c.detail ? `<div class="lab" style="color:var(--warn)">${esc(c.detail)}</div>` : ''}
    </div><div class="act">${btn}</div></div>`;
}

function renderBranchement(e) {
  const nom = e.nom || e.source;
  const secteurs = ['', 'garage', 'plombier', 'electricien', 'restaurant', 'salon', 'health', 'construction', 'fitness'];
  const secteurLbl = { garage: 'Garage', plombier: 'Plombier', electricien: 'Électricien', restaurant: 'Restaurant', salon: 'Salon', health: 'Clinique', construction: 'Construction', fitness: 'Gym' };

  const content = `
  <div class="prog">
    <div class="top"><h2>Prêt à opérer</h2><div class="pct num">${e.pret_pct}%</div></div>
    <div class="pbar"><span style="width:${e.pret_pct}%"></span></div>
    <ul class="steps">${e.etapes.map(s => `<li class="${s.fait ? 'on' : ''}"><span class="dot">${s.fait ? '✓' : ''}</span>${esc(s.titre)}</li>`).join('')}</ul>
    <div class="ready ${e.pret ? 'yes' : 'no'}">${e.pret
      ? '✓ Tout est en place — Novalis peut commencer à travailler pour vous.'
      : 'Complétez les étapes ci-dessus pour que Novalis se mette au travail.'}</div>
  </div>
  <div class="panel">
    <h3>Votre entreprise</h3>
    <div class="hint">L'essentiel pour que tout ce qu'on prépare vous ressemble.</div>
    <div class="bgrid">
      <label>Nom du commerce<input id="f-nom" value="${esc(e.identite.nom || '')}" placeholder="Ex. Garage Beauchemin"></label>
      <label>Secteur<select id="f-secteur">${secteurs.map(s => `<option value="${s}"${s === (e.identite.secteur || '') ? ' selected' : ''}>${s ? secteurLbl[s] : '—'}</option>`).join('')}</select></label>
      <label>Ville<input id="f-ville" value="${esc(e.identite.ville || '')}" placeholder="Montréal"></label>
      <label>Téléphone<input id="f-tel" value="${esc(e.identite.telephone || '')}" placeholder="514 555-0123"></label>
      <label>Courriel du commerce<input id="f-courriel" value="${esc(e.identite.courriel || '')}" placeholder="info@commerce.ca"></label>
      <label>Site web<input id="f-site" value="${esc(e.identite.site_url || '')}" placeholder="https://…"></label>
    </div>
    <button class="bbtn" id="save-ent">Enregistrer</button><span class="msg" id="msg-ent"></span>
  </div>
  ${(e.connexions1clic && e.connexions1clic.length) ? `<div class="panel">
    <h3>Connexions en un clic</h3>
    <div class="hint">Autorisez Novalis sur l'écran de Google ou d'Intuit. Novalis n'accède qu'à VOTRE compte, jamais à un autre — et vous retirez l'accès quand vous voulez.</div>
    ${e.cxMsg ? `<div class="cxmsg ${e.cxMsg.ok ? 'ok' : 'no'}">${esc(e.cxMsg.texte)}</div>` : ''}
    ${e.connexions1clic.map(x => cx1clic(x, e.pass, e.source)).join('')}
  </div>` : ''}
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
    <button class="bbtn" id="save-consent">Enregistrer mes choix</button><span class="msg" id="msg-consent"></span>
  </div>
  <div class="pagefoot">Vos clés, vos règles. Vous pouvez tout débrancher à tout moment.</div>`;

  const bodyScript = `var SOURCE=${JSON.stringify(e.source)};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
async function poste(url, body, msgId){
  var msg=msgId?document.getElementById(msgId):null; if(msg){msg.style.color='';msg.textContent='';}
  try{
    var r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});
    if(r.ok){ if(msg){msg.textContent='✓ Enregistré';} setTimeout(function(){location.reload();},500); return true; }
    if(msg){msg.style.color='#9A5A17';msg.textContent='Non enregistré ('+r.status+')';}
  }catch(e){ if(msg){msg.style.color='#9A5A17';msg.textContent='Erreur réseau';} }
  return false;
}
document.getElementById('save-ent').addEventListener('click',function(){
  poste('/core/branchement',{source:SOURCE,nom:document.getElementById('f-nom').value.trim(),secteur:document.getElementById('f-secteur').value,
    ville:document.getElementById('f-ville').value.trim(),telephone:document.getElementById('f-tel').value.trim(),
    courriel:document.getElementById('f-courriel').value.trim(),site_url:document.getElementById('f-site').value.trim()},'msg-ent');
});
document.getElementById('save-consent').addEventListener('click',function(){
  var c={};document.querySelectorAll('[data-consent]').forEach(function(el){c[el.getAttribute('data-consent')]=el.checked;});
  poste('/core/branchement/consentement',{source:SOURCE,consentements:c},'msg-consent');
});
document.querySelectorAll('[data-oauth-off]').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(!confirm('Débrancher ce compte ? Novalis n\\'y accédera plus.')) return;
    poste('/core/connexion/'+btn.getAttribute('data-oauth-off')+'/disconnect',{source:SOURCE});
  });
});
document.querySelectorAll('[data-oauth-test]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var prov=btn.getAttribute('data-oauth-test');
    var out=document.querySelector('[data-cxtest="'+prov+'"]');
    btn.disabled=true; if(out){out.textContent='Test en cours…';out.className='cxtest';}
    fetch('/core/connexion/'+prov+'/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:SOURCE})})
      .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
      .then(function(x){ if(!out)return;
        if(x.ok&&x.j.ok){out.className='cxtest ok';out.textContent='Connexion vérifiée — '+(x.j.detail||'')+(x.j.messages!=null?' · '+x.j.messages+' courriels':'');}
        else{out.className='cxtest err';out.textContent='Échec — '+((x.j&&x.j.raison)||'non vérifié');}
      })
      .catch(function(){if(out){out.className='cxtest err';out.textContent='Échec — réseau';}})
      .finally(function(){btn.disabled=false;});
  });
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
});`;

  return page({
    title: 'Branchement',
    subtitle: `${esc(nom)} · remettez les clés, Novalis s'occupe du reste`,
    active: 'branchement', source: e.source, sources: e.sources, pass: e.pass, alertes: e.alertes,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderBranchement, esc };
