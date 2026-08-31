'use strict';
// ── Novalis — Clients (le répertoire + la fiche 360) ────────────────
// Registre « document » : une ligne par personne, triée par activité récente,
// chiffres alignés. Un clic ouvre la fiche : résumé + toute la chronologie
// (messages, rendez-vous, devis) au même endroit. Rien d'inventé.

const { esc, jsInline, icon, page } = require('./ui');

function dollars(cents) {
  return (Math.round((cents || 0) / 100)).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function jour(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0].slice(2)}` : String(d);
}
const pl = (n, s, p) => (n === 1 ? s : p);
const ETIQ_STATUT = { gagne: ['Gagné', 'ok'], contacte: ['Contacté', 'br'], nouveau: ['Nouveau', 'muted'], perdu: ['Perdu', 'warn'] };
const ORDRE_STATUT = ['nouveau', 'contacte', 'gagne', 'perdu'];

const EXTRA = `
.rost{width:100%;border-collapse:collapse;font-size:14px}
.rost thead th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:0 14px 9px;border-bottom:2px solid var(--ink);white-space:nowrap}
.rost thead th.r{text-align:right}
.rost tbody td{padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.rost tbody tr{cursor:pointer}
.rost tbody tr:hover{background:var(--card)}
.rost .nm{font-family:var(--disp);font-size:16px;font-weight:600;letter-spacing:-.005em}
.rost .sl{font-size:12px;color:var(--faint);margin-top:1px}
.rost .n{text-align:right;font-variant-numeric:tabular-nums;font-size:15px;color:var(--ink);white-space:nowrap}
.rost .n.z{color:var(--faint)} .rost .n.acc{color:var(--brand-600);font-weight:600}
.rost .go{text-align:right;color:var(--brand-600);font-weight:600;white-space:nowrap}
.rost tbody tr:hover .go{text-decoration:underline}
.rost-empty{padding:22px 14px;border-bottom:1px solid var(--line);color:var(--muted);font-size:14px}
.tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:var(--r-pill);border:1px solid var(--line-strong);color:var(--ink-2);white-space:nowrap}
.tag.ok{color:var(--ok);border-color:var(--ok-soft);background:var(--ok-soft)}
.tag.br{color:var(--brand-600);border-color:var(--brand-soft);background:var(--brand-soft)}
.tag.warn{color:var(--warn);border-color:var(--warn-soft);background:var(--warn-soft)}
.tag.muted{color:var(--muted)}
.srch{display:flex;gap:8px;align-items:center;margin:2px 0 14px}
.srch input{flex:1;font-family:var(--sans);font-size:14px;padding:9px 12px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--card);color:var(--ink)}
.srch input:focus{outline:none;border-color:var(--brand)}
.srch .cnt{font-size:12.5px;color:var(--muted);white-space:nowrap}
/* Fiche */
.fiche-h{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:6px 0 4px}
.fiche-id .nm{font-family:var(--disp);font-size:26px;font-weight:600;letter-spacing:-.01em}
.fiche-id .courriel{font-size:13.5px;color:var(--muted);margin-top:3px}
.fiche-id .courriel a{color:var(--brand-600);text-decoration:none} .fiche-id .courriel a:hover{text-decoration:underline}
.back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--brand-600);text-decoration:none;font-weight:600;margin-bottom:6px}
.back:hover{text-decoration:underline}
.tl{list-style:none;margin:6px 0 0;padding:0;position:relative}
.tl:before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--line)}
.tl li{position:relative;padding:0 0 20px 30px}
.tl .mk{position:absolute;left:0;top:3px;width:16px;height:16px;border-radius:50%;background:var(--card);border:2px solid var(--line-strong)}
.tl li.message .mk{border-color:var(--brand)} .tl li.rdv .mk{border-color:var(--ok)} .tl li.devis .mk{border-color:var(--warn)}
.tl .tt{font-weight:640;font-size:14.5px}
.tl .dd{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.tl .ap{font-size:13.5px;color:var(--ink-2);margin-top:3px;white-space:pre-wrap}
.tl .mt{font-size:12px;color:var(--muted);margin-top:3px}
.tl-empty{color:var(--muted);font-size:14px;padding:14px 0}
/* Édition du dossier */
.dform{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px;margin:8px 0 2px}
.dform label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.dform .full{grid-column:1/-1}
.dform select,.dform input,.dform textarea{font-family:var(--sans);font-size:14px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink);padding:9px 11px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--card)}
.dform textarea{min-height:84px;resize:vertical;line-height:1.5}
.dform select:focus,.dform input:focus,.dform textarea:focus{outline:none;border-color:var(--brand)}
.dsave{display:flex;align-items:center;gap:12px;margin-top:12px}
.dsave .msg{font-size:12.5px;font-weight:600}.dsave .msg.ok{color:var(--ok)}.dsave .msg.err{color:var(--warn)}
.pipe{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
.pcol{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:12px;min-height:80px}
.pcol h4{margin:0 0 10px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-2);display:flex;justify-content:space-between}
.pcol h4 .c{color:var(--faint)}
.pcard{display:block;background:var(--card);border:1px solid var(--line);border-radius:var(--r-sm);padding:9px 11px;margin-bottom:9px;text-decoration:none;color:inherit}
.pcard:hover{border-color:var(--brand)}
.pcard .nm{font-family:var(--disp);font-size:14.5px;font-weight:600}
.pcard .mt{font-size:11.5px;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}
.pcard .as{font-size:11px;color:var(--brand-600);font-weight:600;margin-top:3px}
.pcol-empty{color:var(--faint);font-size:12.5px;padding:6px 2px}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin:6px 0 2px}
.pph{position:relative;margin:0;border:1px solid var(--line-strong);border-radius:var(--r);overflow:hidden;background:var(--panel)}
.pph img{display:block;width:100%;height:120px;object-fit:cover}
.pph figcaption{font-size:11.5px;color:var(--ink-2);padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pph .pdel{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(20,20,18,.62);color:#fff;font-size:15px;line-height:1;cursor:pointer;display:grid;place-items:center}
.pph .pdel:hover{background:var(--risk)}
.padd{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:auto;min-height:150px;border:1.5px dashed var(--line-strong);border-radius:var(--r);color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;background:var(--card)}
.padd:hover{border-color:var(--brand);color:var(--brand-600)}
.padd .plus{font-size:22px;line-height:1}
.pmsg{font-size:12.5px;font-weight:600;margin-top:8px;min-height:1em}
.pmsg.ok{color:var(--ok)} .pmsg.err{color:var(--warn)}
.paylist{margin:4px 0 10px}
.payrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}
.payrow .pd{font-weight:640;font-size:14px}
.payrow .pm{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;margin-top:1px}
.paycopy,.paymark,.paycancel{font-family:var(--sans);font-size:12px;font-weight:600;padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-strong);background:var(--card);color:var(--brand-600);cursor:pointer}
.paycopy:hover,.paymark:hover{border-color:var(--brand)}
.paycancel{color:var(--muted)} .paycancel:hover{border-color:var(--warn);color:var(--warn)}
.payadd{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:4px 0 2px}
.payadd input{font-family:var(--sans);font-size:14px;padding:9px 11px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--card);color:var(--ink);flex:1;min-width:160px}
.payadd input:focus{outline:none;border-color:var(--brand)}
.portlink{font-size:12.5px;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:10px 14px;margin:14px 0 2px}
.portlink code{font-size:12px;color:var(--ink-2);word-break:break-all}
.portlink a{color:var(--brand-600);text-decoration:none;font-weight:600}
@media(max-width:820px){.dform{grid-template-columns:1fr}.pipe{grid-template-columns:1fr 1fr}}
`;

// ── Répertoire (roster) ─────────────────────────────────────────────
function renderRepertoire(d) {
  const rows = (d.clients || []).map((c) => {
    const href = `/core/clients?source=${encodeURIComponent(d.source)}&client=${encodeURIComponent(c.cle)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}`;
    const [lab, ton] = ETIQ_STATUT[c.statut] || ETIQ_STATUT.nouveau;
    return `<tr onclick="location.href='${href}'">
      <td><div class="nm">${esc(c.nom)}</div>${c.courriel ? `<div class="sl">${esc(c.courriel)}</div>` : ''}${c.assigne ? `<div class="sl" style="color:var(--brand-600)">→ ${esc(c.assigne)}</div>` : ''}</td>
      <td><span class="tag ${ton}">${lab}</span></td>
      <td class="n ${c.messages ? '' : 'z'}">${c.messages}</td>
      <td class="n ${c.rdv ? '' : 'z'}">${c.rdv}</td>
      <td class="n ${c.devis ? 'acc' : 'z'}">${c.devis}</td>
      <td class="n ${c.valeur_cents ? 'acc' : 'z'}">${c.valeur_cents ? dollars(c.valeur_cents) : '—'}</td>
      <td class="n ${c.dernier ? '' : 'z'}">${jour(c.dernier)}</td>
      <td class="go">Ouvrir →</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="deyebrow">Répertoire<a href="/core/clients?source=${encodeURIComponent(d.source)}&vue=pipeline${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}">Vue pipeline →</a></div>
    <div class="led" style="margin-top:16px">
      <div class="it"><div class="k">Personnes connues</div><div class="v">${d.total}</div><div class="sub">tout contact enregistré</div></div>
      <div class="it"><div class="k">Clients gagnés</div><div class="v">${d.gagnes}</div><div class="sub">marqués « gagné »</div></div>
      <div class="it"><div class="k">Valeur gagnée</div><div class="v">${dollars(d.valeur_cents)}</div><div class="sub">somme des clients gagnés</div></div>
    </div>
    <form class="srch" method="get" action="/core/clients">
      <input type="hidden" name="source" value="${esc(d.source)}">
      ${d.pass ? `<input type="hidden" name="pass" value="${esc(d.pass)}">` : ''}
      <input name="q" value="${esc(d.q || '')}" placeholder="Rechercher un nom ou un courriel…" autocomplete="off" aria-label="Rechercher un client">
      <span class="cnt">${d.affiches} ${pl(d.affiches, 'personne', 'personnes')}${d.q ? ` sur ${d.total}` : ''}</span>
      <a class="cnt" style="color:var(--brand-600);text-decoration:none;white-space:nowrap" href="/core/clients/export.csv?source=${encodeURIComponent(d.source)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}">Exporter (CSV)</a>
    </form>
    <table class="rost">
      <thead><tr>
        <th>Client</th><th>Statut</th>
        <th class="r">Messages</th><th class="r">RDV</th><th class="r">Devis</th>
        <th class="r">Valeur</th><th class="r">Dernière activité</th><th></th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="rost-empty">${d.q ? 'Aucun client ne correspond à cette recherche.' : 'Aucun client encore. Ils apparaissent dès le premier message, rendez-vous ou devis.'}</td></tr>`}</tbody>
    </table>
    <div class="pagefoot">Une personne = tous ses échanges au même endroit. Regroupé par courriel, sinon par nom.</div>`;

  return page({
    title: 'Clients',
    subtitle: 'Chaque personne et tout son historique — messages, rendez-vous, devis',
    active: 'clients', source: d.source, pass: d.pass, sources: d.sources, alertes: d.alertes,
    extraCss: EXTRA, contentHtml: content,
  });
}

// ── Fiche (détail d'une personne) ───────────────────────────────────
function renderFiche(d) {
  const f = d.fiche;
  const back = `/core/clients?source=${encodeURIComponent(d.source)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}`;
  const [lab, ton] = ETIQ_STATUT[f.statut] || ETIQ_STATUT.nouveau;
  const cc = f.compteurs;

  const strip = [
    ['Messages', cc.messages, 'reçus'],
    ['Rendez-vous', cc.rdv, 'au carnet'],
    ['Devis préparés', cc.devis, ''],
    ['Valeur gagnée', f.gagne ? dollars(f.valeur_cents) : '—', f.gagne ? 'client gagné' : 'pas encore gagné'],
  ].map(([k, v, s]) => `<div class="it"><div class="k">${k}</div><div class="v">${v}</div><div class="sub">${esc(s)}</div></div>`).join('');

  const tl = (f.evenements || []).map((e) => `<li class="${esc(e.genre)}">
      <span class="mk"></span>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap">
        <span class="tt">${esc(e.titre)}</span><span class="dd">${jour(e.date)}</span>
      </div>
      ${e.apercu ? `<div class="ap">${esc(e.apercu)}</div>` : ''}
      ${e.meta ? `<div class="mt">${esc(e.meta)}</div>` : ''}
    </li>`).join('');

  const content = `
    <a class="back" href="${back}">← Répertoire</a>
    <div class="fiche-h">
      <div class="fiche-id">
        <div class="nm">${esc(f.nom)}</div>
        ${f.courriel ? `<div class="courriel"><a href="mailto:${esc(f.courriel)}">${esc(f.courriel)}</a></div>` : '<div class="courriel">Aucun courriel enregistré</div>'}
      </div>
      <span class="tag ${ton}" style="font-size:12.5px;padding:5px 12px">${lab}</span>
    </div>
    <div class="led" style="margin-top:14px">${strip}</div>

    <div class="section-label">Dossier</div>
    <div class="panel" style="margin:0 0 4px">
      <div class="dform">
        <label>Étape
          <select id="d-statut">
            ${ORDRE_STATUT.map(s => `<option value="${s}"${f.statut === s ? ' selected' : ''}>${ETIQ_STATUT[s][0]}${!f.statut_manuel && f.statut === s ? ' (auto)' : ''}</option>`).join('')}
          </select>
        </label>
        <label>Responsable
          <input id="d-assigne" value="${esc(f.assigne || '')}" placeholder="Nom de l’employé" autocomplete="off">
        </label>
        <label class="full">Notes internes <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">— privées, jamais envoyées au client</span>
          <textarea id="d-notes" placeholder="Ex. : préfère les rendez-vous le matin. Client fidèle depuis 2021. Véhicule : Honda Civic 2019.">${esc(f.notes || '')}</textarea>
        </label>
      </div>
      <div class="dsave">
        <button class="btn btn-primary" id="d-save">Enregistrer le dossier</button>
        <span class="msg" id="d-msg"></span>
      </div>
    </div>

    <div class="section-label">Photos &amp; pièces <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">— internes (avant/après, plaque, pièce). Jamais montrées au client.</span></div>
    <div class="pgrid" id="pgrid">
      ${(d.photos || []).map((ph) => `<figure class="pph" data-id="${ph.id}">
        <a href="/core/clients/photo/${ph.id}?source=${encodeURIComponent(d.source)}" target="_blank" rel="noopener"><img loading="lazy" src="/core/clients/photo/${ph.id}?source=${encodeURIComponent(d.source)}" alt="${esc(ph.legende || ph.nom || 'photo')}"></a>
        <figcaption>${esc(ph.legende || ph.nom || '')}</figcaption>
        <button class="pdel" data-pid="${ph.id}" title="Supprimer" aria-label="Supprimer la photo">×</button>
      </figure>`).join('')}
      <label class="padd">
        <input type="file" id="p-file" accept="image/*" hidden>
        <span class="plus">＋</span><span>Ajouter une photo</span>
      </label>
    </div>
    <div class="pmsg" id="p-msg"></div>

    <div class="section-label">Paiements</div>
    <div class="paylist" id="paylist">
      ${(d.paiements || []).map((py) => `<div class="payrow" data-id="${py.id}">
        <div class="pl"><div class="pd">${esc(py.description)}</div><div class="pm">${dollars(py.montant_cents)} · ${jour(py.cree_le)}</div></div>
        ${py.statut === 'paye'
    ? `<span class="tag ok">payé ✓${py.moyen === 'manuel' ? ' (à la main)' : py.moyen === 'stripe' ? ' (Stripe)' : ''}</span>`
    : py.statut === 'annule'
      ? '<span class="tag muted">annulé</span>'
      : `<span class="tag att">en attente</span>${py.url ? ` <button class="paycopy" data-url="${esc(py.url)}">Copier</button>` : ''} <button class="paymark" data-pid="${py.id}">Marquer payé</button> <button class="paycancel" data-pid="${py.id}" title="Annuler la demande" aria-label="Annuler la demande de paiement">×</button>`}
      </div>`).join('') || '<div class="empty" style="color:var(--muted);font-size:13.5px;padding:4px 2px">Aucun paiement.</div>'}
    </div>
    <div class="payadd">
      <input id="pay-desc" placeholder="Description (ex. Freins avant)" autocomplete="off">
      <input id="pay-montant" type="text" inputmode="decimal" placeholder="Montant $" autocomplete="off" style="max-width:120px">
      ${d.stripeOn ? '<button class="btn btn-primary" id="pay-add">Demander un paiement</button>' : ''}
      <button class="btn btn-ghost" id="pay-cash">Reçu comptant</button>
    </div><div class="pmsg" id="pay-msg"></div>
    ${d.stripeOn ? '' : '<div style="font-size:12px;color:var(--faint);margin-top:2px">« Demander un paiement » (lien Stripe) s\'active une fois Stripe branché. « Reçu comptant » fonctionne dès maintenant.</div>'}

    <div class="section-label">Avis de ce client <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">— enregistrez un avis réel qu'il vous a laissé</span></div>
    <div class="payadd">
      <select id="av-note" style="max-width:110px;flex:none"><option value="">Note</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} ★</option>`).join('')}</select>
      <input id="av-texte" placeholder="Ce que ${esc(f.nom)} a dit…" autocomplete="off">
      <button class="btn btn-primary" id="av-add">Enregistrer l'avis</button>
    </div><div class="pmsg" id="av-msg"></div>

    ${d.portailUrl ? `<div class="portlink">Lien du portail client (à partager avec ${esc(f.nom)}) : <code>${esc(d.portailUrl)}</code> · <a href="${esc(d.portailUrl)}" target="_blank" rel="noopener">ouvrir</a></div>` : ''}

    <div class="section-label">Premier contact&nbsp;: ${jour(f.premier)} · Dernière activité&nbsp;: ${jour(f.dernier)}</div>
    <div class="section-label">Chronologie</div>
    ${tl ? `<ul class="tl">${tl}</ul>` : '<div class="tl-empty">Aucun événement enregistré.</div>'}
    <div class="pagefoot">Chaque ligne de la chronologie est un échange réel. Le dossier (étape, responsable, notes) est ce que VOUS saisissez.</div>`;

  const bodyScript = `function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
var CLE=${jsInline(f.cle)}, SRC=${jsInline(d.source)};
document.getElementById('d-save').addEventListener('click',function(){
  var b=this, msg=document.getElementById('d-msg'); b.disabled=true; msg.className='msg'; msg.textContent='Enregistrement…';
  fetch('/core/clients/dossier',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({
    source:SRC, cle:CLE,
    statut:document.getElementById('d-statut').value,
    assigne:document.getElementById('d-assigne').value,
    notes:document.getElementById('d-notes').value
  })}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){ if(x.ok&&x.j.ok){msg.className='msg ok';msg.textContent='Enregistré ✓';}
      else{msg.className='msg err';msg.textContent='Échec — '+((x.j&&x.j.raison)||'réessayez');} })
    .catch(function(){msg.className='msg err';msg.textContent='Échec — réseau';})
    .finally(function(){b.disabled=false;});
});
// Photos : lecture locale → data-URL → POST (recompressé côté serveur).
var pfile=document.getElementById('p-file'), pmsg=document.getElementById('p-msg');
if(pfile){ pfile.addEventListener('change',function(){
  var f=this.files&&this.files[0]; if(!f)return;
  if(f.size>12*1024*1024){pmsg.className='pmsg err';pmsg.textContent='Image trop lourde (max 12 Mo).';return;}
  pmsg.className='pmsg';pmsg.textContent='Envoi de la photo…';
  var fr=new FileReader();
  fr.onload=function(){
    fetch('/core/clients/photo',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},
      body:JSON.stringify({source:SRC,cle:CLE,nom:f.name,dataUrl:fr.result})})
      .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
      .then(function(x){ if(x.ok&&x.j.ok){location.reload();} else{pmsg.className='pmsg err';pmsg.textContent='Échec — '+((x.j&&x.j.raison)||'réessayez');} })
      .catch(function(){pmsg.className='pmsg err';pmsg.textContent='Échec — réseau';});
  };
  fr.readAsDataURL(f);
}); }
document.querySelectorAll('.pdel').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(!confirm('Supprimer cette photo ?'))return;
    var pid=btn.getAttribute('data-pid');
    fetch('/core/clients/photo/'+pid+'/suppr',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({source:SRC})})
      .then(function(r){return r.json();}).then(function(j){ if(j.ok){var el=btn.closest('.pph'); if(el)el.remove();} });
  });
});
// Paiements : demander un lien Stripe + copier.
function brancherCopie(btn){ btn.addEventListener('click',function(){
  var u=btn.getAttribute('data-url');
  (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){btn.textContent='Copié ✓';setTimeout(function(){btn.textContent='Copier le lien';},1500);}).catch(function(){window.prompt('Lien de paiement :',u);});
});}
document.querySelectorAll('.paycopy').forEach(brancherCopie);
var payAdd=document.getElementById('pay-add');
if(payAdd){ payAdd.addEventListener('click',function(){
  var pm=document.getElementById('pay-msg'), desc=document.getElementById('pay-desc').value.trim();
  var montant=Math.round(parseFloat(String(document.getElementById('pay-montant').value).replace(',','.'))*100);
  pm.className='pmsg'; pm.textContent='';
  if(!desc||!(montant>=50)){pm.className='pmsg err';pm.textContent='Description et montant (≥ 0,50 $) requis.';return;}
  payAdd.disabled=true; pm.textContent='Création du lien…';
  fetch('/core/paiements',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},
    body:JSON.stringify({source:SRC,cle:CLE,description:desc,montant_cents:montant,courriel:(${jsInline(f.courriel || '')})||undefined})})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){ if(x.ok&&x.j.ok){location.reload();} else{pm.className='pmsg err';pm.textContent='Échec — '+((x.j&&x.j.raison)||'réessayez');} })
    .catch(function(){pm.className='pmsg err';pm.textContent='Échec — réseau';})
    .finally(function(){payAdd.disabled=false;});
});}
var payCash=document.getElementById('pay-cash');
if(payCash){ payCash.addEventListener('click',function(){
  var pm=document.getElementById('pay-msg'), desc=document.getElementById('pay-desc').value.trim();
  var montant=Math.round(parseFloat(String(document.getElementById('pay-montant').value).replace(',','.'))*100);
  pm.className='pmsg'; pm.textContent='';
  if(!desc||!(montant>=1)){pm.className='pmsg err';pm.textContent='Description et montant requis.';return;}
  if(!confirm('Enregistrer '+(montant/100).toFixed(2)+' $ reçu comptant/Interac pour « '+desc+' » ?'))return;
  payCash.disabled=true;
  fetch('/core/paiements/manuel',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},
    body:JSON.stringify({source:SRC,cle:CLE,description:desc,montant_cents:montant})})
    .then(function(r){return r.json();}).then(function(j){ if(j.ok){location.reload();}else{pm.className='pmsg err';pm.textContent='Échec — '+(j.raison||'réessayez');payCash.disabled=false;} })
    .catch(function(){pm.className='pmsg err';pm.textContent='Échec — réseau';payCash.disabled=false;});
});}
document.querySelectorAll('.paymark').forEach(function(btn){btn.addEventListener('click',function(){
  if(!confirm('Marquer ce paiement comme reçu (comptant / Interac) ?'))return;
  fetch('/core/paiements/'+btn.getAttribute('data-pid')+'/paye',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({source:SRC})})
    .then(function(r){return r.json();}).then(function(j){if(j.ok)location.reload();});
});});
document.querySelectorAll('.paycancel').forEach(function(btn){btn.addEventListener('click',function(){
  if(!confirm('Annuler cette demande de paiement ?'))return;
  fetch('/core/paiements/'+btn.getAttribute('data-pid')+'/annule',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify({source:SRC})})
    .then(function(r){return r.json();}).then(function(j){if(j.ok)location.reload();});
});});
var avAdd=document.getElementById('av-add');
if(avAdd){ avAdd.addEventListener('click',function(){
  var am=document.getElementById('av-msg'), texte=document.getElementById('av-texte').value.trim();
  am.className='pmsg'; am.textContent='';
  if(!texte){am.className='pmsg err';am.textContent='Écrivez l\\'avis reçu.';return;}
  avAdd.disabled=true; am.textContent='Enregistrement…';
  fetch('/core/avis',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},
    body:JSON.stringify({source:SRC,cle:CLE,auteur:${jsInline(f.nom)},note:document.getElementById('av-note').value,provenance:'direct',texte:texte})})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){ if(x.ok&&x.j.ok){am.className='pmsg ok';am.textContent='Avis enregistré ✓ — gérez l\\'affichage dans « Avis ».';document.getElementById('av-texte').value='';}
      else{am.className='pmsg err';am.textContent='Échec — '+((x.j&&x.j.raison)||'réessayez');} })
    .catch(function(){am.className='pmsg err';am.textContent='Échec — réseau';})
    .finally(function(){avAdd.disabled=false;});
});}`;

  return page({
    title: f.nom,
    subtitle: 'Fiche client',
    active: 'clients', source: d.source, pass: d.pass, sources: d.sources, alertes: d.alertes,
    actionsHtml: `<a class="btn btn-ghost" href="${back}">${icon('grid')} Répertoire</a>`,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

// ── Pipeline (tableau par étape) ────────────────────────────────────
function renderPipeline(d) {
  const q = (extra) => `/core/clients?source=${encodeURIComponent(d.source)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}${extra}`;
  const cols = (d.pipeline.colonnes || []).map((col) => {
    const [lab] = ETIQ_STATUT[col.statut] || [col.statut];
    const cartes = col.clients.map((c) => `<a class="pcard" href="${q('&client=' + encodeURIComponent(c.cle))}">
        <div class="nm">${esc(c.nom)}</div>
        <div class="mt">${c.messages}·msg ${c.rdv}·rdv ${c.devis}·devis${c.valeur_cents ? ' · ' + dollars(c.valeur_cents) : ''}</div>
        ${c.assigne ? `<div class="as">→ ${esc(c.assigne)}</div>` : ''}
      </a>`).join('') || '<div class="pcol-empty">—</div>';
    return `<div class="pcol"><h4>${lab}<span class="c">${col.clients.length}</span></h4>${cartes}</div>`;
  }).join('');

  const content = `
    <div class="deyebrow">Pipeline — clients par étape<a href="${q('')}">Vue répertoire →</a></div>
    <div class="pipe" style="margin-top:16px">${cols}</div>
    <div class="pagefoot">L’étape se change dans la fiche de chaque client. « Gagné » compte la valeur.</div>`;

  return page({
    title: 'Clients',
    subtitle: 'Pipeline — où en est chaque client',
    active: 'clients', source: d.source, pass: d.pass, sources: d.sources, alertes: d.alertes,
    actionsHtml: `<a class="btn btn-ghost" href="${q('')}">${icon('grid')} Répertoire</a>`,
    extraCss: EXTRA, contentHtml: content,
  });
}

function renderClients(d) {
  if (d && d.fiche) return renderFiche(d);
  if (d && d.pipeline) return renderPipeline(d);
  return renderRepertoire(d);
}

module.exports = { renderClients };
