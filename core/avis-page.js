'use strict';
// ── Novalis — Avis & témoignages : gestion (admin) + widget public ──
// Admin : enregistrer les vrais avis, choisir l'affichage, récupérer le code
// d'intégration. Public : un widget honnête (que des avis réels saisis).

const { esc, page } = require('./ui');

const PROV_LABEL = { google: 'Google', facebook: 'Facebook', courriel: 'Courriel', direct: 'En personne' };
function etoiles(n) {
  if (!n) return '';
  const p = Math.max(0, Math.min(5, n));
  return '★★★★★☆☆☆☆☆'.slice(5 - p, 10 - p);
}

const EXTRA = `
.avform{display:grid;grid-template-columns:1fr 120px 150px;gap:12px;margin:2px 0 6px}
.avform .full{grid-column:1/-1}
.avform label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.avform input,.avform select,.avform textarea{font-family:var(--sans);font-size:14px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--ink);padding:9px 11px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--card)}
.avform textarea{min-height:70px;resize:vertical;line-height:1.5}
.avform input:focus,.avform select:focus,.avform textarea:focus{outline:none;border-color:var(--brand)}
.avrow{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)}
.avrow .st{color:#B8860B;font-size:14px;letter-spacing:1px;white-space:nowrap;min-width:74px}
.avrow .bd{flex:1;min-width:0}
.avrow .au{font-weight:640;font-size:14px}
.avrow .au .pr{font-weight:400;color:var(--faint);font-size:12px;margin-left:6px}
.avrow .tx{font-size:13.5px;color:var(--ink-2);margin-top:3px;white-space:pre-wrap}
.avrow .ac{display:flex;gap:8px;align-items:center;flex:none}
.avrow .ac button{font-family:var(--sans);font-size:12px;font-weight:600;padding:6px 10px;border-radius:var(--r-sm);border:1px solid var(--line-strong);background:var(--card);color:var(--ink-2);cursor:pointer}
.avrow .ac button:hover{border-color:var(--brand);color:var(--brand-600)}
.avrow.off{opacity:.5}
.embed{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-top:6px}
.embed .hk{font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:4px}
.embed code{display:block;font-size:12px;color:var(--brand-600);word-break:break-all}
.avmsg{font-size:12.5px;font-weight:600;min-height:1em;margin-top:6px}.avmsg.ok{color:var(--ok)}.avmsg.err{color:var(--warn)}
@media(max-width:720px){.avform{grid-template-columns:1fr 1fr}}
`;

function renderAvis(d) {
  const r = d.resume || { total: 0, affiches: 0, moyenne: null, notes: 0 };
  const rows = (d.avis || []).map((a) => `<div class="avrow${a.affiche ? '' : ' off'}" data-id="${a.id}">
    <div class="st">${a.note ? esc(etoiles(a.note)) : '—'}</div>
    <div class="bd"><div class="au">${esc(a.auteur)}<span class="pr">${esc(PROV_LABEL[a.provenance] || 'Avis')}</span></div>
      <div class="tx">${esc(a.texte)}</div></div>
    <div class="ac">
      <button data-toggle="${a.id}" data-on="${a.affiche ? 1 : 0}">${a.affiche ? 'Affiché' : 'Masqué'}</button>
      <button data-del="${a.id}" title="Supprimer">×</button>
    </div>
  </div>`).join('') || '<div style="color:var(--muted);font-size:14px;padding:16px 0">Aucun avis enregistré. Ajoutez ceux que vous avez reçus ci-dessous.</div>';

  const content = `
    <div class="section-label">Vos avis</div>
    <div class="led">
      <div class="it"><div class="k">Avis enregistrés</div><div class="v">${r.total}</div><div class="sub">${r.affiches} affiché${r.affiches !== 1 ? 's' : ''} sur le site</div></div>
      <div class="it"><div class="k">Note moyenne</div><div class="v">${r.moyenne != null ? r.moyenne : '—'}</div><div class="sub">${r.notes ? 'sur ' + r.notes + ' avis notés' : 'aucune note encore'}</div></div>
      <div class="it"><div class="k">Widget</div><div class="v" style="font-size:18px"><a href="/temoignages/${esc(d.source)}" target="_blank" rel="noopener" style="color:var(--brand-600);text-decoration:none">Voir →</a></div><div class="sub">tel qu'il paraît sur votre site</div></div>
    </div>

    <div class="section-label">Ajouter un avis reçu <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">— saisissez un avis RÉEL (Google, Facebook, courriel, en personne)</span></div>
    <div class="panel" style="margin:0 0 6px">
      <div class="avform">
        <label>Nom du client<input id="av-auteur" placeholder="Ex. Marie T." autocomplete="off"></label>
        <label>Note<select id="av-note"><option value="">— aucune</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} ★</option>`).join('')}</select></label>
        <label>Provenance<select id="av-prov">${Object.entries(PROV_LABEL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label class="full">Avis (mot pour mot)<textarea id="av-texte" placeholder="Collez ou recopiez l'avis tel qu'il a été laissé."></textarea></label>
      </div>
      <button class="btn btn-primary" id="av-add">Enregistrer l'avis</button>
      <div class="avmsg" id="av-msg"></div>
    </div>

    <div class="section-label">Tous les avis</div>
    ${rows}

    <div class="section-label">Intégrer sur votre site</div>
    <div class="embed">
      <div class="hk">Collez ce code dans votre site (widget qui montre vos avis affichés)</div>
      <code>&lt;iframe src="${esc(d.base)}/temoignages/${esc(d.source)}" style="width:100%;border:0;height:520px" title="Avis clients" loading="lazy"&gt;&lt;/iframe&gt;</code>
    </div>
    <div class="pagefoot">Novalis n'invente jamais d'avis. Chaque témoignage est un avis réel que vous avez saisi, avec sa provenance.</div>`;

  const bodyScript = `function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
var SRC=${JSON.stringify(d.source)};
function poste(url,body){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});}
document.getElementById('av-add').addEventListener('click',function(){
  var m=document.getElementById('av-msg');m.className='avmsg';m.textContent='';
  var auteur=document.getElementById('av-auteur').value.trim();
  var texte=document.getElementById('av-texte').value.trim();
  if(!auteur||!texte){m.className='avmsg err';m.textContent='Nom et avis requis.';return;}
  this.disabled=true;m.textContent='Enregistrement…';var b=this;
  poste('/core/avis',{source:SRC,auteur:auteur,note:document.getElementById('av-note').value,provenance:document.getElementById('av-prov').value,texte:texte})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){if(x.ok&&x.j.ok){location.reload();}else{m.className='avmsg err';m.textContent='Échec — '+((x.j&&x.j.raison)||'réessayez');}})
    .catch(function(){m.className='avmsg err';m.textContent='Échec — réseau';})
    .finally(function(){b.disabled=false;});
});
document.querySelectorAll('[data-toggle]').forEach(function(btn){btn.addEventListener('click',function(){
  var id=btn.getAttribute('data-toggle'),on=btn.getAttribute('data-on')==='1';
  poste('/core/avis/'+id,{source:SRC,affiche:on?0:1}).then(function(r){if(r.ok)location.reload();});
});});
document.querySelectorAll('[data-del]').forEach(function(btn){btn.addEventListener('click',function(){
  if(!confirm('Supprimer cet avis ?'))return;
  poste('/core/avis/'+btn.getAttribute('data-del'),{source:SRC,suppr:true}).then(function(r){if(r.ok)location.reload();});
});});`;

  return page({
    title: 'Avis',
    subtitle: 'Vos avis réels — affichez-les sur votre site',
    active: 'avis', source: d.source, pass: d.pass, sources: d.sources, alertes: d.alertes,
    extraCss: EXTRA, contentHtml: content, bodyScript,
  });
}

// ── Widget public (intégré en iframe sur le site du commerçant) ─────
function renderTemoignagesPublic(d) {
  const nom = d.commerce || d.source;
  const avis = d.avis || [];
  const r = d.resume || {};
  const cartes = avis.map((a) => `<figure class="c">
    ${a.note ? `<div class="st">${esc(etoiles(a.note))}</div>` : ''}
    <blockquote>${esc(a.texte)}</blockquote>
    <figcaption>${esc(a.auteur)}<span>${esc(PROV_LABEL[a.provenance] || '')}</span></figcaption>
  </figure>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Avis — ${esc(nom)}</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1b1a16;background:transparent;padding:16px}
  .hd{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap}
  .hd h2{font-family:Georgia,"Times New Roman",serif;font-size:19px;margin:0;font-weight:600}
  .hd .avg{font-size:13px;color:#6c685c}
  .hd .avg b{color:#B8860B;font-size:15px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
  .c{margin:0;background:#fbfaf6;border:1px solid #e4e0d2;border-radius:10px;padding:14px 16px}
  .c .st{color:#B8860B;letter-spacing:1px;font-size:14px;margin-bottom:6px}
  .c blockquote{margin:0;font-size:14px;line-height:1.5;color:#3a382f}
  .c figcaption{margin-top:8px;font-size:12.5px;font-weight:600;color:#1b1a16}
  .c figcaption span{font-weight:400;color:#98937f;margin-left:6px}
  .empty{color:#6c685c;font-size:14px}
  .ft{margin-top:14px;font-size:11px;color:#98937f}
  @media(prefers-color-scheme:dark){body{color:#eee}.c{background:#26251f;border-color:#3a382f}.c blockquote{color:#ddd}.c figcaption{color:#eee}.hd .avg{color:#bbb}}
</style></head>
<body>
  <div class="hd"><h2>Avis clients — ${esc(nom)}</h2>${r.moyenne != null ? `<div class="avg"><b>${r.moyenne} ★</b> · ${r.notes} avis</div>` : ''}</div>
  ${cartes ? `<div class="grid">${cartes}</div>` : '<div class="empty">Les avis apparaîtront ici.</div>'}
  <div class="ft">Avis réels recueillis auprès des clients.</div>
</body></html>`;
}

module.exports = { renderAvis, renderTemoignagesPublic };
