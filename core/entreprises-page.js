'use strict';
// ── Novalis Entreprises — le hub d'agence (registre) ────────────────
// Un cabinet qui opère plusieurs commerces les lit comme un REGISTRE : une ligne
// par entreprise, triée par attention, chiffres alignés. Pas de tuiles. La
// création passe par un slide-over (bouton primaire en tête).

const { esc, icon, page } = require('./ui');

const EXTRA = `
.rost{width:100%;border-collapse:collapse;font-size:14px}
.rost thead th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:0 14px 9px;border-bottom:2px solid var(--ink);white-space:nowrap}
.rost thead th.r{text-align:right}
.rost tbody td{padding:14px;border-bottom:1px solid var(--line);vertical-align:middle}
.rost tbody tr{cursor:pointer}
.rost tbody tr:hover{background:var(--card)}
.rost .nm{font-family:var(--disp);font-size:17px;font-weight:600;letter-spacing:-.005em}
.rost .sl{font-size:12px;color:var(--faint);margin-top:1px}
.rost .st{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--ink-2);white-space:nowrap}
.rost .dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none}
.rost .dot.warn{background:var(--warn)} .rost .dot.urgent{background:var(--risk)}
.rost .n{text-align:right;font-variant-numeric:tabular-nums;font-size:15px;color:var(--ink);white-space:nowrap}
.rost .n.z{color:var(--faint)}
.rost .n.acc{color:var(--brand-600);font-weight:600}
.rost .go{text-align:right;color:var(--brand-600);font-weight:600;white-space:nowrap}
.rost tbody tr:hover .go{text-decoration:underline}
.rost-empty{padding:22px 14px;border-bottom:1px solid var(--line);color:var(--muted);font-size:14px}
.ne-msg{font-size:13px;margin-right:auto}
`;

function renderEntreprises(data) {
  const items = data.entreprises || [];
  const rows = items.map((e) => {
    const href = `/core/aujourdhui?source=${encodeURIComponent(e.source)}${data.pass ? '&pass=' + encodeURIComponent(data.pass) : ''}`;
    const ton = e.enAttente ? 'urgent' : (e.aApprouver || e.pretPct < 100) ? 'warn' : '';
    const stTxt = ton === 'urgent' ? 'Attention' : ton === 'warn' ? 'À compléter' : 'Actif';
    return `<tr onclick="location.href='${href}'">
      <td><div class="nm">${esc(e.nom || e.source)}</div><div class="sl">${esc(e.source)}</div></td>
      <td><span class="st"><span class="dot ${ton}"></span>${stTxt}</span></td>
      <td class="n ${e.aApprouver ? 'acc' : 'z'}">${e.aApprouver}</td>
      <td class="n ${e.contacts ? '' : 'z'}">${e.contacts}</td>
      <td class="n ${e.enAttente ? '' : 'z'}">${e.enAttente}</td>
      <td class="n ${e.rdvSoon ? '' : 'z'}">${e.rdvSoon}</td>
      <td class="n ${e.pretPct >= 100 ? '' : 'z'}">${e.pretPct} %</td>
      <td class="go">Gérer →</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="section-label">Vos entreprises${items.length ? ' · ' + items.length : ''}</div>
    <table class="rost">
      <thead><tr>
        <th>Entreprise</th><th>Statut</th>
        <th class="r">À approuver</th><th class="r">Contacts · 30 j</th>
        <th class="r">Sans réponse</th><th class="r">RDV bientôt</th><th class="r">Prêt</th><th></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="rost-empty">Aucune entreprise branchée. Cliquez « + Nouvelle entreprise » en haut à droite.</td></tr>'}</tbody>
    </table>
    <div class="pagefoot">Trié d'abord par ce qui demande votre attention.</div>

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
  if(src.length<2){msg.style.color='#9A3B3B';msg.textContent='Identifiant trop court (a-z 0-9 -).';return;}
  var r=await fetch('/core/entreprises',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({source:src,nom:nom})});
  if(r.ok){location.href='/core/branchement?source='+encodeURIComponent(src)+(pass()?'&pass='+encodeURIComponent(pass()):'');}
  else{var j=await r.json().catch(function(){return{};});msg.style.color='#9A3B3B';msg.textContent='Échec : '+(j.error||r.status);}
});`;

  return page({
    title: 'Entreprises',
    subtitle: 'Toutes vos entreprises — ce qui demande attention en premier',
    active: 'entreprises', pass: data.pass, sources: (data.entreprises || []).map((e) => e.source),
    actionsHtml: `<button class="btn btn-primary" id="ent-new">${icon('plus')} Nouvelle entreprise</button>`,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

module.exports = { renderEntreprises };
