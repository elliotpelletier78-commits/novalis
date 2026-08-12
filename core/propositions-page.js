'use strict';
// ── Novalis — Poste de commande (file d'approbation) ─────────────────
// Le matin, le commerçant ouvre cette page : Novalis a déjà préparé le travail.
// Pour chaque proposition : le contexte, le brouillon (modifiable), et trois
// gestes — Approuver · Modifier · Rejeter. Même identité visuelle que Réception.

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
  --risk:#9C4632; --risk-soft:rgba(156,70,50,.11);
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
  --risk:#E0967F; --risk-soft:rgba(224,150,127,.14);
  --hair:rgba(236,235,224,.15); --hair-2:rgba(236,235,224,.08);
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 36px rgba(0,0,0,.4);
}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:clamp(20px,4vw,40px)}
.brand{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.01em}
.brand em{font-style:normal;color:var(--jade)}
.sub{color:var(--muted);font-size:14px;margin:4px 0 22px}
.count{display:inline-block;background:var(--jade);color:#fff;border-radius:999px;font-size:13px;font-weight:700;padding:2px 11px;margin-left:8px;vertical-align:middle}
.prop{background:var(--card);border:1px solid var(--hair);border-radius:16px;box-shadow:var(--shadow);margin-bottom:16px;overflow:hidden}
.prop.gone{opacity:.55}
.phead{display:flex;align-items:flex-start;gap:12px;padding:18px 22px 0}
.ptag{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--jade-soft);color:var(--jade);white-space:nowrap;margin-top:2px}
.ptag.urgent{background:var(--warn-soft);color:var(--warn)}
.pttl{flex:1;min-width:0}
.pttl .t{font-family:var(--serif);font-size:18px;font-weight:700}
.pttl .ctx{font-size:13px;color:var(--muted);margin-top:2px}
.pbody{padding:14px 22px 20px}
.draft-lbl{font-size:12px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:7px;display:flex;align-items:center;gap:8px}
.dest{font-size:12px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0}
textarea{width:100%;min-height:150px;font-family:var(--sans);font-size:14.5px;line-height:1.6;color:var(--ink);
  background:var(--paper);border:1px solid var(--hair);border-radius:11px;padding:14px 16px;resize:vertical}
textarea:focus{outline:2px solid var(--jade);outline-offset:1px}
.acts{display:flex;gap:9px;margin-top:14px;flex-wrap:wrap}
.acts button{font-family:var(--sans);font-size:14px;font-weight:650;padding:10px 18px;border-radius:10px;border:1px solid var(--hair);cursor:pointer;transition:filter .15s,border-color .15s,color .15s}
.b-ok{background:var(--jade);color:#fff;border-color:var(--jade)}
.b-ok:hover{filter:brightness(1.08)}
.b-mod{background:var(--panel);color:var(--ink-2)}
.b-mod:hover{border-color:var(--jade);color:var(--jade)}
.b-no{background:transparent;color:var(--muted)}
.b-no:hover{border-color:var(--risk);color:var(--risk)}
.acts button:disabled{opacity:.5;cursor:not-allowed}
.pmsg{font-size:13px;margin-top:10px;min-height:18px}
.empty{background:var(--card);border:1px solid var(--hair);border-radius:16px;box-shadow:var(--shadow);padding:48px 30px;text-align:center;color:var(--muted)}
.empty .big{font-family:var(--serif);font-size:22px;color:var(--ink);margin-bottom:8px}
.tabs{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.tabs a{font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid var(--hair);color:var(--ink-2);text-decoration:none}
.tabs a.on{background:var(--jade);color:#fff;border-color:var(--jade)}
.foot{margin-top:26px;color:var(--faint);font-size:12.5px;text-align:center}
`;

function carte(p) {
  const urgent = p.priorite >= 10;
  return `<div class="prop" data-id="${p.id}">
    <div class="phead">
      <span class="ptag ${urgent ? 'urgent' : ''}">${urgent ? 'Prioritaire' : 'Réponse'}</span>
      <div class="pttl"><div class="t">${esc(p.titre)}</div>
        <div class="ctx">${p.apercu ? '« ' + esc(p.apercu) + ' »' : ''}</div></div>
    </div>
    <div class="pbody">
      <div class="draft-lbl">Brouillon préparé par Novalis
        ${p.destinataire ? `<span class="dest">→ ${esc(p.destinataire)}</span>` : '<span class="dest">→ aucun destinataire</span>'}</div>
      <textarea data-draft>${esc(p.brouillon)}</textarea>
      <div class="acts">
        <button class="b-ok" data-a="approuver">✓ Approuver ${p.destinataire ? '&amp; envoyer' : ''}</button>
        <button class="b-mod" data-a="modifier">Enregistrer les changements</button>
        <button class="b-no" data-a="rejeter">Rejeter</button>
      </div>
      <div class="pmsg"></div>
    </div>
  </div>`;
}

/**
 * @param {{source:string, nom?:string, items:Array, compteurs:object, statut:string}} data
 */
function renderPropositions(data) {
  const nom = data.nom || data.source;
  const c = data.compteurs;
  const statut = data.statut || 'en_attente';
  const tab = (s, label) => `<a href="?source=${encodeURIComponent(data.source)}&statut=${s}"${s === statut ? ' class="on"' : ''}>${label}</a>`;

  const corps = data.items.length
    ? data.items.map(carte).join('')
    : `<div class="empty"><div class="big">${statut === 'en_attente' ? 'Rien à approuver ce matin.' : 'Rien ici.'}</div>
        ${statut === 'en_attente' ? 'Dès qu\'un client écrit, Novalis prépare la réponse et la dépose ici pour votre oui.' : ''}</div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Poste de commande — ${esc(nom)}</title><style>${CSS}</style></head><body><div class="wrap">
  <div class="brand">Novalis <em>Poste de commande</em></div>
  <div class="sub">${esc(nom)} · Novalis a déjà fait le travail — vous n'avez qu'à dire oui.</div>
  <div class="tabs">
    ${tab('en_attente', `À approuver${c.en_attente ? '<span class="count">' + c.en_attente + '</span>' : ''}`)}
    ${tab('approuve', 'Approuvés')}
    ${tab('envoye', 'Envoyés')}
    ${tab('rejete', 'Rejetés')}
  </div>
  ${corps}
  <div class="foot">Rien ne part sans votre approbation. Vous gardez la main sur chaque mot.</div>
</div>
<script>
function pass(){return localStorage.getItem('novalis_admin')||new URLSearchParams(location.search).get('pass')||'';}
(function(){var p=new URLSearchParams(location.search).get('pass'); if(p) localStorage.setItem('novalis_admin',p);})();
document.querySelectorAll('.prop').forEach(function(card){
  var id=card.getAttribute('data-id');
  var ta=card.querySelector('[data-draft]');
  var msg=card.querySelector('.pmsg');
  card.querySelectorAll('.acts button').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var a=btn.getAttribute('data-a');
      var body={action:a};
      if(a==='approuver'||a==='modifier') body.brouillon=ta.value;
      card.querySelectorAll('button').forEach(function(b){b.disabled=true;});
      msg.style.color=''; msg.textContent='…';
      try{
        var r=await fetch('/core/propositions/'+id,{method:'POST',
          headers:{'Content-Type':'application/json','x-admin-pass':pass()},body:JSON.stringify(body)});
        var j=await r.json().catch(function(){return {};});
        if(r.ok){
          if(a==='modifier'){ msg.style.color='#2E6B45'; msg.textContent='✓ Changements enregistrés';
            card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); return; }
          msg.style.color='#2E6B45';
          msg.textContent = a==='rejeter' ? '✗ Rejeté'
            : (j.envoye ? '✓ Approuvé et envoyé' : '✓ Approuvé — à envoyer à la main ('+(j.note||'')+')');
          card.classList.add('gone');
          setTimeout(function(){ card.style.display='none'; }, 1200);
        } else {
          msg.style.color='#9C4632'; msg.textContent='Échec : '+(j.raison||r.status);
          card.querySelectorAll('button').forEach(function(b){b.disabled=false;});
        }
      }catch(e){ msg.style.color='#9C4632'; msg.textContent='Erreur réseau';
        card.querySelectorAll('button').forEach(function(b){b.disabled=false;}); }
    });
  });
});
</script>
</body></html>`;
}

module.exports = { renderPropositions, esc };
