'use strict';
// ── Novalis — Acceptation de devis en ligne (page publique client) ──
// Ce que Jobber (Client Hub) a et que Novalis n'avait pas : le client accepte
// (ou décline) une soumission en un clic, avec horodatage. Honnête : c'est
// l'acceptation réelle du client ; le commerçant est prévenu et confirme la
// suite. Aucun montant inventé — on affiche la soumission telle que préparée.

const { UI_CSS, esc } = require('./ui');

const CSS = `
.dw{max-width:600px;margin:0 auto;padding:clamp(24px,5vw,52px)}
.dbar{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.dbar .mk{width:30px;height:30px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.dbar .mk svg{width:17px;height:17px;stroke:var(--brand-ink);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.dbar .wm{font-family:var(--disp);font-size:18px;font-weight:600}
h1{font-family:var(--disp);font-size:clamp(25px,4.2vw,32px);font-weight:600;letter-spacing:-.01em;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin:0 0 22px}
.quote{background:var(--card);border:1px solid var(--line-strong);border-radius:10px;padding:20px 22px;white-space:pre-wrap;font-size:14.5px;line-height:1.6;color:var(--ink)}
.acts{display:flex;gap:12px;margin-top:22px;flex-wrap:wrap}
.acts button{flex:1;min-width:160px;font-family:var(--sans);font-size:15px;font-weight:640;padding:13px;border-radius:9px;cursor:pointer}
.b-yes{border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink)} .b-yes:hover{filter:brightness(1.08)}
.b-no{border:1px solid var(--line-strong);background:var(--card);color:var(--ink-2)} .b-no:hover{border-color:var(--risk);color:var(--risk)}
.acts button:disabled{opacity:.6;cursor:not-allowed}
.done{text-align:center;padding:8px 0 0}
.done h2{font-family:var(--disp);font-size:23px;font-weight:600;margin:0 0 8px}
.done p{color:var(--ink-2);font-size:15px}
.note{margin-top:16px;font-size:12.5px;color:var(--faint)}
.foot{margin-top:26px;font-size:12px;color:var(--faint);text-align:center}
.foot a{color:var(--muted);text-decoration:none}
.err{display:none;margin-top:12px;font-size:13.5px;color:var(--risk);text-align:center}
`;

function renderDevisAccept(d) {
  const nom = d.nom || d.source;
  const already = d.statutClient; // 'accepte' | 'refuse' | null
  const body = already
    ? `<div class="done"><h2>${already === 'accepte' ? 'Soumission acceptée' : 'Réponse enregistrée'}</h2>
        <p>${already === 'accepte' ? `Merci — ${esc(nom)} vous recontacte pour planifier.` : 'C\'est noté, merci de votre réponse.'}</p></div>`
    : `<h1>Votre soumission</h1>
       <p class="sub">De ${esc(nom)}. Prenez le temps de la lire — vous acceptez seulement si tout vous convient.</p>
       <div class="quote">${esc(d.brouillon || '')}</div>
       <div class="acts">
         <button class="b-yes" id="ok" type="button">J'accepte cette soumission</button>
         <button class="b-no" id="no" type="button">Décliner</button>
       </div>
       <div class="err" id="err"></div>
       <div class="note">Taxes en sus s'il y a lieu. Valide 30 jours. Votre acceptation est horodatée et ${esc(nom)} en est informé.</div>
       <div id="done" style="display:none"></div>`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Soumission — ${esc(nom)}</title><style>${UI_CSS}${CSS}</style></head>
<body><div class="dw">
  <div class="dbar"><span class="mk"><svg viewBox="0 0 24 24"><path d="M6 18V6l12 12V6"/></svg></span><span class="wm">${esc(nom)}</span></div>
  <div id="wrap">${body}</div>
  <div class="foot">Préparé et livré par Novalis pour ${esc(nom)}. <a href="/confiance">Confiance &amp; confidentialité</a></div>
</div>
${already ? '' : `<script>
var BASE=${JSON.stringify(d.actionBase)};
function act(action){
  var y=document.getElementById('ok'),n=document.getElementById('no'),err=document.getElementById('err');
  y.disabled=true;n.disabled=true;err.style.display='none';
  fetch(BASE+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){
    if(r.ok){
      var t=action==='accepter'?'<div class="done"><h2>Soumission acceptée</h2><p>Merci — '+${JSON.stringify(esc(nom))}+' vous recontacte pour planifier.</p></div>'
        :'<div class="done"><h2>Réponse enregistrée</h2><p>C\\'est noté, merci de votre réponse.</p></div>';
      document.getElementById('wrap').innerHTML=t;
    } else { err.textContent='Une erreur est survenue. Réessayez.'; err.style.display='block'; y.disabled=false;n.disabled=false; }
  }).catch(function(){ err.textContent='Connexion impossible. Réessayez.'; err.style.display='block'; y.disabled=false;n.disabled=false; });
}
document.getElementById('ok').addEventListener('click',function(){act('accepter');});
document.getElementById('no').addEventListener('click',function(){act('refuser');});
</script>`}
</body></html>`;
}

module.exports = { renderDevisAccept };
