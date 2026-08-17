'use strict';
// ── Novalis — Confirmation de rendez-vous en ligne (page client) ────
// Le client confirme sa présence (ou demande à reporter) en un clic depuis le
// rappel. Levier anti-no-show le plus fort sans intégration (+26 % de
// confirmations). Honnête : reporter dépose une demande que le commerçant traite.

const { UI_CSS, esc } = require('./ui');

const CSS = `
.dw{max-width:520px;margin:0 auto;padding:clamp(24px,5vw,52px)}
.dbar{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.dbar .mk{width:30px;height:30px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.dbar .mk svg{width:17px;height:17px;stroke:var(--brand-ink);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.dbar .wm{font-family:var(--disp);font-size:18px;font-weight:600}
h1{font-family:var(--disp);font-size:clamp(24px,4vw,30px);font-weight:600;letter-spacing:-.01em;margin:0 0 16px}
.rv{background:var(--card);border:1px solid var(--line-strong);border-radius:10px;padding:18px 20px;margin-bottom:20px}
.rv .q{font-family:var(--disp);font-size:19px;font-weight:600}
.rv .s{font-size:14px;color:var(--mut);margin-top:4px}
.acts{display:flex;flex-direction:column;gap:10px}
.b-yes{font-family:var(--sans);font-size:15px;font-weight:640;padding:14px;border-radius:9px;border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink);cursor:pointer}
.b-yes:hover{filter:brightness(1.08)}
.b-no{font-family:var(--sans);font-size:14px;font-weight:600;padding:12px;border-radius:9px;border:1px solid var(--line-strong);background:var(--card);color:var(--ink-2);cursor:pointer}
.b-no:hover{border-color:var(--warn);color:var(--warn)}
button:disabled{opacity:.6;cursor:not-allowed}
.done{text-align:center;padding:8px 0}
.done h2{font-family:var(--disp);font-size:23px;font-weight:600;margin:0 0 8px}
.done p{color:var(--ink-2);font-size:15px}
.err{display:none;margin-top:12px;font-size:13.5px;color:var(--risk);text-align:center}
.foot{margin-top:26px;font-size:12px;color:var(--faint);text-align:center}
.foot a{color:var(--muted);text-decoration:none}
`;

function bloc(d) {
  const dj = d.statutClient;
  if (dj === 'confirme') return '<div class="done"><h2>Présence confirmée ✓</h2><p>Merci — à bientôt !</p></div>';
  if (dj === 'reporter') return `<div class="done"><h2>Demande enregistrée</h2><p>${esc(d.nom)} vous recontacte pour trouver un autre moment.</p></div>`;
  return `<h1>Confirmez votre rendez-vous</h1>
    <div class="rv"><div class="q">${esc(d.quand)}</div>${d.service ? `<div class="s">${esc(d.service)}</div>` : ''}</div>
    <div class="acts">
      <button class="b-yes" id="ok" type="button">Je confirme ma présence</button>
      <button class="b-no" id="rep" type="button">Je dois reporter</button>
    </div>
    <div class="err" id="err"></div>`;
}

function renderRdvConfirm(d) {
  const nom = d.nom || d.source;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Rendez-vous — ${esc(nom)}</title><style>${UI_CSS}${CSS}</style></head>
<body><div class="dw">
  <div class="dbar"><span class="mk"><svg viewBox="0 0 24 24"><path d="M6 18V6l12 12V6"/></svg></span><span class="wm">${esc(nom)}</span></div>
  <div id="wrap">${bloc(d)}</div>
  <div class="foot">Rappel préparé par Novalis pour ${esc(nom)}. <a href="/confiance">Confiance &amp; confidentialité</a></div>
</div>
${d.statutClient ? '' : `<script>
var BASE=${JSON.stringify(d.actionBase)},NOM=${JSON.stringify(esc(nom))};
function act(rep){
  var y=document.getElementById('ok'),n=document.getElementById('rep'),err=document.getElementById('err');
  y.disabled=true;n.disabled=true;err.style.display='none';
  fetch(BASE+'/'+rep,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){
    if(r.ok){
      var t=rep==='confirme'?'<div class="done"><h2>Présence confirmée ✓</h2><p>Merci — à bientôt !</p></div>'
        :'<div class="done"><h2>Demande enregistrée</h2><p>'+NOM+' vous recontacte pour trouver un autre moment.</p></div>';
      document.getElementById('wrap').innerHTML=t;
    } else { err.textContent='Une erreur est survenue. Réessayez.'; err.style.display='block'; y.disabled=false;n.disabled=false; }
  }).catch(function(){ err.textContent='Connexion impossible. Réessayez.'; err.style.display='block'; y.disabled=false;n.disabled=false; });
}
document.getElementById('ok').addEventListener('click',function(){act('confirme');});
document.getElementById('rep').addEventListener('click',function(){act('reporter');});
</script>`}
</body></html>`;
}

module.exports = { renderRdvConfirm };
