'use strict';
// ── Novalis Rendez-vous — carnet (coquille d'app) ───────────────────
// Ajouter un rendez-vous, voir les prochains. Novalis prépare le rappel
// automatiquement (déposé dans le poste de commande).

const { esc, page, icon } = require('./ui');
const { formatQuand, montrealWall } = require('./rdv');

// Regroupe les rendez-vous par jour (Aujourd'hui / Demain / date), puis étiquette
// chaque groupe. debut est déjà en heure murale de Montréal.
function regrouper(rdvs) {
  const today = montrealWall(Date.now()).slice(0, 10);
  const tomorrow = montrealWall(Date.now() + 86400000).slice(0, 10);
  const groupes = new Map();
  for (const r of rdvs) {
    const jour = String(r.debut).slice(0, 10);
    if (!groupes.has(jour)) groupes.set(jour, []);
    groupes.get(jour).push(r);
  }
  return [...groupes.entries()].map(([jour, items]) => {
    let label;
    if (jour === today) label = 'Aujourd’hui';
    else if (jour === tomorrow) label = 'Demain';
    else {
      const d = new Date(jour + 'T12:00:00');
      label = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
      label = label.charAt(0).toUpperCase() + label.slice(1);
    }
    return { jour, label, items };
  });
}

const EXTRA = `
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px 24px;box-shadow:var(--sh-sm);margin-bottom:16px}
.panel h3{font-size:15px;font-weight:660}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 16px}
.rgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rgrid.wide{grid-template-columns:1fr 1fr 1fr}
.rgrid label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.rgrid input{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.rgrid input:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.rbtn{font-family:var(--sans);font-size:14px;font-weight:640;color:#fff;background:var(--brand);border:none;border-radius:var(--r-sm);padding:11px 20px;cursor:pointer;margin-top:16px}
.rbtn:hover{filter:brightness(1.07)}
.msg{margin-left:10px;font-size:13px;color:var(--ok)}
.rdv{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--line-2)}
.rdv:last-child{border-bottom:none}
.rdv .when{flex:none;width:44px;height:44px;border-radius:11px;background:var(--brand-soft);color:var(--brand-600);display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:750;line-height:1}
.rdv .when .d{font-size:16px}.rdv .when .m{font-size:9px;letter-spacing:.04em;text-transform:uppercase;margin-top:1px}
.rdv .b{flex:1;min-width:0}
.rdv .t{font-weight:640;font-size:14.5px}
.rdv .s{font-size:13px;color:var(--muted)}
.rdv .rapp{font-size:11px;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);background:var(--ok-soft);color:var(--ok);white-space:nowrap}
.rdv .act button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 11px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--panel);color:var(--ink-2);cursor:pointer;margin-left:6px}
.rdv .act button:hover{border-color:var(--brand);color:var(--brand-600)}
.empty{padding:34px;text-align:center;color:var(--muted)}
.daygroup{margin-top:8px}
.dayhead{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:720;letter-spacing:.04em;text-transform:uppercase;color:var(--brand-600);padding:12px 0 4px;border-top:1px solid var(--line-2)}
.daygroup:first-child .dayhead{border-top:none;padding-top:2px}
.dayhead span{font-size:11px;font-weight:700;color:var(--muted);background:var(--panel);border-radius:999px;padding:0 7px}
`;

const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function pastille(debut) {
  const t = Date.parse(String(debut).replace(' ', 'T'));
  if (!Number.isFinite(t)) return '<div class="d">?</div>';
  const d = new Date(t);
  return `<div class="d">${d.getDate()}</div><div class="m">${MOIS[d.getMonth()]}</div>`;
}

function renderRdv(data) {
  const nom = data.nom || data.source;
  const rdvs = data.rdvs || [];
  const content = `
  <div class="panel">
    <h3>Nouveau rendez-vous</h3>
    <div class="hint">Novalis préparera le rappel automatiquement, ~48 h avant, dans votre poste de commande.</div>
    <div class="rgrid">
      <label>Client<input id="r-nom" placeholder="Ex. Marie Tremblay"></label>
      <label>Courriel du client<input id="r-mail" placeholder="client@courriel.ca"></label>
    </div>
    <div class="rgrid wide" style="margin-top:14px">
      <label>Date et heure<input id="r-debut" type="datetime-local"></label>
      <label>Service<input id="r-service" placeholder="Ex. Changement de pneus"></label>
      <label>Note (facultatif)<input id="r-note" placeholder="—"></label>
    </div>
    <button class="rbtn" id="r-add">Ajouter au carnet</button><span class="msg" id="r-msg"></span>
  </div>
  <div class="section-label">Agenda</div>
  <div class="panel">
    <div class="card-h"><h3 style="margin:0">Prochains rendez-vous</h3><span class="muted" style="font-size:13px">${rdvs.length} à venir</span></div>
    <div class="hint">Regroupés par jour. Un badge « rappel prêt » apparaît quand Novalis a déposé le rappel.</div>
    ${rdvs.length ? regrouper(rdvs).map(g => `<div class="daygroup"><div class="dayhead">${esc(g.label)}<span>${g.items.length}</span></div>
      ${g.items.map(r => `<div class="rdv" data-id="${r.id}">
      <div class="when">${pastille(r.debut)}</div>
      <div class="b"><div class="t">${esc(r.client_nom || 'Client')}${r.service ? ' · ' + esc(r.service) : ''}</div>
        <div class="s">${esc(formatQuand(r.debut))}${r.client_courriel ? ' · ' + esc(r.client_courriel) : ''}</div></div>
      ${r.rappel_prop_id ? '<span class="rapp">rappel prêt</span>' : ''}
      <div class="act"><button data-a="fait">Fait</button><button data-a="annule">Annuler</button></div>
    </div>`).join('')}</div>`).join('') : '<div class="empty">Aucun rendez-vous à venir. Ajoutez-en un ci-dessus.</div>'}
  </div>
  <div class="pagefoot">Novalis tient le carnet et prépare les rappels — vous approuvez, le client est prévenu.</div>`;

  const bodyScript = `var SOURCE=${JSON.stringify(data.source)};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
async function poste(url,body){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});}
var add=document.getElementById('r-add');
add&&add.addEventListener('click', async function(){
  var msg=document.getElementById('r-msg'); msg.style.color=''; msg.textContent='';
  var debut=document.getElementById('r-debut').value;
  if(!debut){msg.style.color='#C0392B';msg.textContent='Date et heure requises';return;}
  var body={source:SOURCE,debut:debut,client_nom:document.getElementById('r-nom').value.trim(),
    client_courriel:document.getElementById('r-mail').value.trim(),service:document.getElementById('r-service').value.trim(),
    note:document.getElementById('r-note').value.trim()};
  var r=await poste('/core/rdv',body);
  if(r.ok){location.reload();}else{msg.style.color='#C0392B';msg.textContent='Échec ('+r.status+')';}
});
document.querySelectorAll('.rdv .act button').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var id=btn.closest('.rdv').getAttribute('data-id');
    var r=await poste('/core/rdv/'+id,{statut:btn.getAttribute('data-a')});
    if(r.ok)location.reload();
  });
});`;

  return page({
    title: 'Rendez-vous',
    subtitle: `${esc(nom)} · le carnet et les rappels`,
    active: 'rdv', source: data.source, sources: data.sources, pass: data.pass,
    extraCss: EXTRA, contentHtml: content, bodyScript,
    actionsHtml: `<span class="badge badge-brand">${icon('clock')}&nbsp;${rdvs.length} à venir</span>`,
  });
}

module.exports = { renderRdv };
