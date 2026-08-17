'use strict';
// ── Novalis — Prise de rendez-vous en ligne (page publique client) ──
// Ce que les plateformes de RDV (Square, Vagaro, Calendly) ont et que Novalis
// n'avait pas : le client demande lui-même un rendez-vous, 24/7. Honnête par
// construction : c'est une DEMANDE que le commerçant confirme (pas un créneau
// garanti), et elle arrive dans la Réception + l'accusé instantané existants.

const { UI_CSS, esc } = require('./ui');

const CSS = `
.bw{max-width:560px;margin:0 auto;padding:clamp(24px,5vw,52px)}
.bbar{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.bbar .mk{width:30px;height:30px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.bbar .mk svg{width:17px;height:17px;stroke:var(--brand-ink);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.bbar .wm{font-family:var(--disp);font-size:18px;font-weight:600}
h1{font-family:var(--disp);font-size:clamp(26px,4.4vw,34px);font-weight:600;letter-spacing:-.01em;margin:0 0 6px}
.lead{color:var(--ink-2);font-size:15.5px;margin:0 0 24px}
label{display:block;font-size:12px;font-weight:640;letter-spacing:.02em;text-transform:uppercase;color:var(--muted);margin:16px 0 7px}
input,select,textarea{width:100%;font-family:var(--sans);font-size:15px;color:var(--ink);background:var(--card);border:1px solid var(--line-strong);border-radius:9px;padding:12px 13px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--brand);outline-offset:1px}
textarea{min-height:88px;line-height:1.5;resize:vertical}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:480px){.two{grid-template-columns:1fr}}
button{width:100%;margin-top:22px;font-family:var(--sans);font-size:15px;font-weight:640;padding:13px;border-radius:9px;border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink);cursor:pointer}
button:hover{filter:brightness(1.08)} button:disabled{opacity:.6;cursor:not-allowed}
.err{display:none;margin-top:12px;font-size:13.5px;color:var(--risk)}
.ok{display:none;text-align:center;padding:20px 0}
.ok h2{font-family:var(--disp);font-size:24px;font-weight:600;margin:0 0 8px}
.ok p{color:var(--ink-2);font-size:15px}
.foot{margin-top:26px;font-size:12px;color:var(--faint);text-align:center}
.foot a{color:var(--muted);text-decoration:none}
`;

function renderBooking(d) {
  const nom = d.nom || d.source;
  const services = (d.services || []).map((s) => `<option value="${esc(s.nom)}">${esc(s.nom)}</option>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rendez-vous — ${esc(nom)}</title>
<meta name="description" content="Demandez un rendez-vous chez ${esc(nom)} en ligne. On vous confirme rapidement.">
<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#1E3A5F">
<style>${UI_CSS}${CSS}</style></head>
<body><div class="bw">
  <div class="bbar"><span class="mk"><svg viewBox="0 0 24 24"><path d="M6 18V6l12 12V6"/></svg></span><span class="wm">${esc(nom)}</span></div>
  <div id="form">
    <h1>Prendre rendez-vous</h1>
    <p class="lead">Dites-nous ce dont vous avez besoin et quand vous préférez. On vous confirme rapidement — rien n'est fixé sans vous recontacter.</p>
    ${services ? `<label for="b-svc">Service</label>
    <select id="b-svc"><option value="">— Choisir —</option>${services}<option value="Autre / je ne sais pas encore">Autre / je ne sais pas encore</option></select>` : ''}
    <div class="two">
      <div><label for="b-date">Date souhaitée</label><input type="date" id="b-date"></div>
      <div><label for="b-moment">Moment</label><select id="b-moment"><option value="Flexible">Flexible</option><option value="Matin">Matin</option><option value="Après-midi">Après-midi</option><option value="Fin de journée">Fin de journée</option></select></div>
    </div>
    <div class="two">
      <div><label for="b-nom">Votre nom</label><input type="text" id="b-nom" autocomplete="name" placeholder="Marie Tremblay"></div>
      <div><label for="b-tel">Téléphone</label><input type="tel" id="b-tel" autocomplete="tel" placeholder="514 555-0123"></div>
    </div>
    <label for="b-mail">Courriel</label>
    <input type="email" id="b-mail" autocomplete="email" placeholder="marie@courriel.ca">
    <label for="b-note">Précisions (facultatif)</label>
    <textarea id="b-note" placeholder="Ex. Changement de pneus d'hiver, véhicule Honda Civic 2019…"></textarea>
    <div class="err" id="b-err"></div>
    <button id="b-send" type="button">Envoyer ma demande</button>
  </div>
  <div class="ok" id="ok">
    <h2>Demande envoyée.</h2>
    <p>${esc(nom)} vous revient sous peu pour confirmer votre rendez-vous.</p>
  </div>
  <div class="foot">Vos coordonnées servent uniquement à vous répondre. <a href="/confiance">Confiance &amp; confidentialité</a></div>
</div>
<script>
var SRC=${JSON.stringify(d.source)};
function v(id){var e=document.getElementById(id);return e?e.value.trim():'';}
function showErr(t){var e=document.getElementById('b-err');e.textContent=t;e.style.display='block';}
document.getElementById('b-send').addEventListener('click', async function(){
  var nom=v('b-nom'),mail=v('b-mail'),svc=v('b-svc'),date=v('b-date'),moment=v('b-moment'),tel=v('b-tel'),note=v('b-note');
  if(!nom){showErr('Indiquez votre nom.');return;}
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(mail)){showErr('Indiquez un courriel valide.');return;}
  var lignes=['Demande de rendez-vous en ligne.'];
  if(svc) lignes.push('Service : '+svc);
  lignes.push('Quand : '+(date?date+' ':'')+(moment||'Flexible'));
  if(tel) lignes.push('Téléphone : '+tel);
  if(note) lignes.push('Précisions : '+note);
  var msg=lignes.join('\\n');
  var btn=document.getElementById('b-send');btn.disabled=true;btn.textContent='Envoi…';
  try{
    var r=await fetch('/api/'+encodeURIComponent(SRC)+'/contact',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nom,email:mail,message:msg,topics:['rendez-vous'],lang:'fr'})});
    if(r.ok){document.getElementById('form').style.display='none';document.getElementById('ok').style.display='block';}
    else{var j=await r.json().catch(function(){return{};});showErr(j.error||'Une erreur est survenue. Réessayez.');btn.disabled=false;btn.textContent='Envoyer ma demande';}
  }catch(e){showErr('Connexion impossible. Réessayez dans un instant.');btn.disabled=false;btn.textContent='Envoyer ma demande';}
});
</script>
</body></html>`;
}

module.exports = { renderBooking };
