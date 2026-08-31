'use strict';
// ── Novalis Rendez-vous — carnet + agenda (coquille d'app) ──────────
// L'agenda (regroupé par jour) est la vue principale ; la création passe par un
// slide-over (bouton primaire en tête), pas un formulaire permanent.

const { esc, page, icon } = require('./ui');
const { formatQuand, montrealWall, RECURRENCES } = require('./rdv');

// Regroupe les rendez-vous par jour (Aujourd'hui / Demain / date).
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
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px 24px;margin-bottom:16px}
.panel h3{font-size:15px;font-weight:660}
.panel .hint{font-size:12.5px;color:var(--muted);margin:2px 0 14px}
.msg{font-size:13px;margin-right:auto;color:var(--ok)}
.rdv{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--line-2)}
.rdv:last-child{border-bottom:none}
.rdv .when{flex:none;width:44px;height:44px;border-radius:11px;background:var(--brand-soft);color:var(--brand-600);display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:750;line-height:1}
.rdv .when .d{font-size:16px}.rdv .when .m{font-size:9px;letter-spacing:.04em;text-transform:uppercase;margin-top:1px}
.rdv .b{flex:1;min-width:0}
.rdv .t{font-weight:640;font-size:14.5px}
.rdv .s{font-size:13px;color:var(--muted)}
.rdv .rapp{font-size:11px;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);background:var(--ok-soft);color:var(--ok);white-space:nowrap}
.rdv .conf{font-size:11px;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);background:var(--ok-soft);color:var(--ok);white-space:nowrap}
.rdv .conf.report{background:var(--warn-soft);color:var(--warn)}
.rdv .recur{font-size:11px;font-weight:700;color:var(--brand-600);white-space:nowrap;margin-left:4px}
.rdv .act button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 11px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--panel);color:var(--ink-2);cursor:pointer;margin-left:6px}
.rdv .act button:hover{border-color:var(--brand);color:var(--brand-600)}
.empty{padding:40px;text-align:center;color:var(--muted)}
.daygroup{margin-top:8px}
.dayhead{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:720;letter-spacing:.04em;text-transform:uppercase;color:var(--brand-600);padding:12px 0 4px;border-top:1px solid var(--line-2)}
.daygroup:first-child .dayhead{border-top:none;padding-top:2px}
.dayhead span{font-size:11px;font-weight:700;color:var(--muted);background:var(--panel);border-radius:999px;padding:0 7px}
.bookshare{margin-top:16px;font-size:13px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:13px 15px}
.bookshare code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--panel);padding:3px 7px;border-radius:6px;word-break:break-all}
.bookshare a{color:var(--brand-600);font-weight:600;text-decoration:none}
.sheet .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:520px){.sheet .two{grid-template-columns:1fr}}
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
  <div class="section-label">Agenda</div>
  <div class="panel">
    <div class="card-h"><h3 style="margin:0">Prochains rendez-vous</h3><span class="muted" style="font-size:13px">${rdvs.length} à venir</span></div>
    <div class="hint">Regroupés par jour. Un badge « rappel prêt » apparaît quand Novalis a déposé le rappel.</div>
    ${rdvs.length ? regrouper(rdvs).map(g => `<div class="daygroup"><div class="dayhead">${esc(g.label)}<span>${g.items.length}</span></div>
      ${g.items.map(r => `<div class="rdv" data-id="${r.id}">
      <div class="when">${pastille(r.debut)}</div>
      <div class="b"><div class="t">${esc(r.client_nom || 'Client')}${r.service ? ' · ' + esc(r.service) : ''}${r.recurrence && RECURRENCES[r.recurrence] ? ` <span class="recur">↻ ${esc(RECURRENCES[r.recurrence].label)}</span>` : ''}</div>
        <div class="s">${esc(formatQuand(r.debut))}${r.client_courriel ? ' · ' + esc(r.client_courriel) : ''}</div></div>
      ${r.client_reponse === 'confirme' ? '<span class="conf">confirmé ✓</span>' : r.client_reponse === 'reporter' ? '<span class="conf report">à reporter</span>' : (r.rappel_prop_id ? '<span class="rapp">rappel prêt</span>' : '')}
      <div class="act"><button data-a="fait">Fait</button><button data-a="annule">Annuler</button></div>
    </div>`).join('')}</div>`).join('') : '<div class="empty">Aucun rendez-vous à venir. Cliquez « + Nouveau rendez-vous » en haut à droite.</div>'}
  </div>
  ${data.bookingUrl ? `<div class="bookshare">Lien de réservation à partager (vos clients demandent un RDV en ligne) : <code>${esc(data.bookingUrl)}</code> · <a href="${esc(data.bookingUrl)}" target="_blank" rel="noopener">ouvrir</a></div>` : ''}
  <div class="pagefoot">Novalis tient le carnet et prépare les rappels — vous approuvez, le client est prévenu.</div>

  <div class="sheet-ov" id="sheet-ov"></div>
  <aside class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Nouveau rendez-vous">
    <div class="sheet-h"><h2>Nouveau rendez-vous</h2><button class="x" id="sheet-x" aria-label="Fermer">×</button></div>
    <div class="sheet-b">
      <div style="font-size:13px;color:var(--muted)">Novalis préparera le rappel automatiquement, ~48 h avant, dans votre poste de commande.</div>
      <div class="two">
        <label>Client<input id="r-nom" placeholder="Ex. Marie Tremblay" autocomplete="off"></label>
        <label>Courriel du client<input id="r-mail" placeholder="client@courriel.ca" autocomplete="off"></label>
      </div>
      <label>Téléphone du client <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">— si présent, le rappel part par SMS</span><input id="r-tel" placeholder="514 555-0123" autocomplete="off"></label>
      <label>Date et heure<input id="r-debut" type="datetime-local"></label>
      <div class="two">
        <label>Service<input id="r-service" placeholder="Ex. Changement de pneus" autocomplete="off"></label>
        <label>Récurrence<select id="r-recur">
          <option value="">Rendez-vous ponctuel</option>
          ${Object.entries(RECURRENCES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}
        </select></label>
      </div>
      <label>Note (facultatif)<input id="r-note" placeholder="—" autocomplete="off"></label>
    </div>
    <div class="sheet-f"><span class="msg" id="r-msg"></span><button class="btn btn-ghost" id="r-cancel">Annuler</button><button class="btn btn-primary" id="r-add">Ajouter au carnet</button></div>
  </aside>`;

  const bodyScript = `var SOURCE=${JSON.stringify(data.source)};
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
async function poste(url,body){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});}
var ov=document.getElementById('sheet-ov'),sh=document.getElementById('sheet');
function open(){ov.classList.add('open');sh.classList.add('open');var i=document.getElementById('r-nom');if(i)i.focus();}
function close(){ov.classList.remove('open');sh.classList.remove('open');}
var bn=document.getElementById('rdv-new'); if(bn) bn.addEventListener('click',open);
ov.addEventListener('click',close);
document.getElementById('sheet-x').addEventListener('click',close);
document.getElementById('r-cancel').addEventListener('click',close);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sh.classList.contains('open'))close();});
document.getElementById('r-add').addEventListener('click', async function(){
  var msg=document.getElementById('r-msg'); msg.style.color=''; msg.textContent='';
  var debut=document.getElementById('r-debut').value;
  if(!debut){msg.style.color='#C0392B';msg.textContent='Date et heure requises';return;}
  var body={source:SOURCE,debut:debut,client_nom:document.getElementById('r-nom').value.trim(),
    client_courriel:document.getElementById('r-mail').value.trim(),client_telephone:document.getElementById('r-tel').value.trim(),service:document.getElementById('r-service').value.trim(),
    recurrence:document.getElementById('r-recur').value,
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
    active: 'rdv', source: data.source, sources: data.sources, pass: data.pass, alertes: data.alertes,
    actionsHtml: `<button class="btn btn-primary" id="rdv-new">${icon('plus')} Nouveau rendez-vous</button>`,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderRdv };
