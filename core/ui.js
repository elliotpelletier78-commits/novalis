'use strict';
// ── Novalis — système de design partagé (coquille d'application) ─────
// Une seule identité pour tous les écrans : barre latérale de navigation,
// composants cohérents (cartes, tuiles, tableaux, boutons, badges), typographie
// sobre sans-serif. L'objectif : que ça se lise comme un produit d'entreprise
// fiable (QuickBooks / Garmin / Strava), pas comme un outil bricolé.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Icônes ligne (SVG inline, jamais d'emoji). 20×20, stroke = couleur courante.
const ICONS = {
  today: '<path d="M8 2v3M16 2v3M3.5 9h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V7A1.5 1.5 0 0 1 5 5.5Z"/>',
  inbox: '<path d="M3.5 13.5 6 6.2A1.5 1.5 0 0 1 7.4 5.2h9.2A1.5 1.5 0 0 1 18 6.2l2.5 7.3M3.5 13.5V18A1.5 1.5 0 0 0 5 19.5h14A1.5 1.5 0 0 0 20.5 18v-4.5M3.5 13.5H8l1.2 2h5.6l1.2-2h4.5"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>',
  file: '<path d="M13 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V9M13 3.5 18.5 9M13 3.5V9h5.5M8.5 13h7M8.5 16.5h7"/>',
  plug: '<path d="M9 2.5v5M15 2.5v5M6.5 7.5h11v2a5.5 5.5 0 0 1-11 0v-2ZM12 15v6"/>',
  pulse: '<path d="M3.5 12h4l2-6 4 12 2-6h5"/>',
  ext: '<path d="M8 5.5h-3A1.5 1.5 0 0 0 3.5 7v12A1.5 1.5 0 0 0 5 20.5h12A1.5 1.5 0 0 0 18.5 19v-3M14 4.5h6v6M20 4.5 10 14.5"/>',
  search: '<path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.9-4.9"/>',
  help: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.5M12 16.7h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l4 4V5L7 9H5a1 1 0 0 0-1 1ZM15 8a4 4 0 0 1 0 8M18.5 5a8 8 0 0 1 0 14"/>',
  gear: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 15a1.5 1.5 0 0 0 .3 1.7l.05.05a1.8 1.8 0 1 1-2.6 2.6l-.05-.05a1.5 1.5 0 0 0-2.55 1.06V20.5a1.8 1.8 0 1 1-3.6 0v-.07A1.5 1.5 0 0 0 7.3 19.4l-.05.05a1.8 1.8 0 1 1-2.6-2.6l.05-.05A1.5 1.5 0 0 0 4.6 15H4.5a1.8 1.8 0 1 1 0-3.6h.07A1.5 1.5 0 0 0 6.6 8.7l-.05-.05a1.8 1.8 0 1 1 2.6-2.6l.05.05a1.5 1.5 0 0 0 1.7.3H11a1.5 1.5 0 0 0 .9-1.37V4.5a1.8 1.8 0 1 1 3.6 0v.07a1.5 1.5 0 0 0 2.55 1.06l.05-.05a1.8 1.8 0 1 1 2.6 2.6l-.05.05a1.5 1.5 0 0 0-.3 1.7V11a1.5 1.5 0 0 0 1.37.9h.08a1.8 1.8 0 1 1 0 3.6h-.07a1.5 1.5 0 0 0-1.38.9Z"/>',
};
function icon(name) {
  // width/height par défaut = garde-fou : un icône sans style CSS ne peut jamais
  // « exploser » (le CSS spécifique le redimensionne quand nécessaire).
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Logo Novalis : monogramme « N » net dans le carré de marque.
const MARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18V6l12 12V6"/></svg>';
// Étincelle Nova (assistant).
const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/></svg>';

// Script de coquille (toujours injecté) : recherche in-page + chat Nova.
function SHELL_SCRIPT(source, pass) {
  const src = JSON.stringify(String(source || ''));
  const ps = JSON.stringify(String(pass || ''));
  return `(function(){
  var SRC=${src},PASS=${ps}||(localStorage.getItem('novalis_admin')||'');
  // Recherche in-page : filtre les lignes/cartes de type liste par leur texte.
  var q=document.getElementById('tbq');
  if(q){var CIBLES='.prop,.nova-i,.cx,.srv,.rdv,.ent,tbody tr,.list .row';
    q.addEventListener('input',function(){
      var t=q.value.trim().toLowerCase();
      document.querySelectorAll(CIBLES).forEach(function(el){
        el.style.display=(!t||el.textContent.toLowerCase().indexOf(t)!==-1)?'':'none';});
    });}
  // Chat Nova.
  var fab=document.getElementById('nova-fab'),box=document.getElementById('nova-chat'),
      msgs=document.getElementById('nova-msgs'),inp=document.getElementById('nova-q'),
      snd=document.getElementById('nova-send'),x=document.getElementById('nova-x');
  if(!fab) return;
  function open(){box.classList.add('open');inp&&inp.focus();}
  function close(){box.classList.remove('open');}
  fab.addEventListener('click',function(){box.classList.contains('open')?close():open();});
  x&&x.addEventListener('click',close);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&box.classList.contains('open')){close();fab.focus();}});
  function bulle(txt,cls){var d=document.createElement('div');d.className='nova-b '+cls;d.textContent=txt;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d;}
  async function envoyer(){
    var m=(inp.value||'').trim(); if(!m) return; inp.value='';
    bulle(m,'me'); var attente=bulle('…','nova'); snd.disabled=true;
    try{
      var r=await fetch('/core/nova/chat',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':PASS},
        body:JSON.stringify({source:SRC,message:m})});
      var j=await r.json().catch(function(){return{};});
      attente.textContent=j.answer||('Erreur ('+r.status+')');
      if(j.note){bulle(j.note,'note');}
    }catch(e){attente.textContent='Erreur réseau.';}
    snd.disabled=false; msgs.scrollTop=msgs.scrollHeight;
  }
  snd&&snd.addEventListener('click',envoyer);
  inp&&inp.addEventListener('keydown',function(e){if(e.key==='Enter')envoyer();});
  // Bouton d'aide (barre) → ouvre Nova.
  var help=document.getElementById('nova-help');
  if(help) help.addEventListener('click',function(){box.classList.contains('open')?close():open();});
  // Menu de compte (ouvrir/fermer, se déconnecter).
  var acct=document.getElementById('acct'),ab=document.getElementById('acct-btn');
  if(ab){
    ab.addEventListener('click',function(e){e.stopPropagation();var o=acct.classList.toggle('open');ab.setAttribute('aria-expanded',o?'true':'false');});
    document.addEventListener('click',function(){acct.classList.remove('open');ab.setAttribute('aria-expanded','false');});
    var lo=document.getElementById('acct-logout');
    if(lo) lo.addEventListener('click',function(){localStorage.removeItem('novalis_admin');location.href='/';});
  }
})();`;
}

const NAV_GROUPS = [
  { titre: 'Vue d’ensemble', items: [
    { key: 'entreprises', label: 'Entreprises', href: '/core/entreprises', icon: 'grid' },
    { key: 'aujourdhui', label: 'Aujourd’hui', href: '/core/aujourdhui', icon: 'today' },
  ] },
  { titre: 'Opérations', items: [
    { key: 'propositions', label: 'Poste de commande', href: '/core/propositions', icon: 'inbox' },
    { key: 'reception', label: 'Réception', href: '/core/reception', icon: 'phone' },
    { key: 'rdv', label: 'Rendez-vous', href: '/core/rdv', icon: 'clock' },
    { key: 'devis', label: 'Devis', href: '/core/devis', icon: 'file' },
    { key: 'publications', label: 'Publications', href: '/core/publications', icon: 'megaphone' },
  ] },
  { titre: 'Configuration', items: [
    { key: 'branchement', label: 'Branchement', href: '/core/branchement', icon: 'plug' },
  ] },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

const UI_CSS = `
:root{
  /* LEDGER — papier / encre / marine. L'esthétique de la confiance financière :
     un fond papier chaud, une encre presque noire, un seul accent marine, et des
     CHIFFRES EN SÉRIF (comme un relevé). Rien d'« IA par défaut ». */
  --app:#F1EFE8; --card:#FBFAF6; --panel:#F1EEE4; --line:#E4E0D2; --line-2:#EDEADD;
  --ink:#1B1A16; --ink-2:#3A382F; --muted:#6C685C; --faint:#98937F;
  --brand:#1E3A5F; --brand-ink:#F7F3E9; --brand-soft:#E9EDF3; --brand-600:#16304F;
  --ok:#2E6B4F; --ok-soft:#E3EDE6; --warn:#8A5A1C; --warn-soft:#F1E8D8;
  --risk:#9A3B3B; --risk-soft:#F1E4E1; --steel:#55617A;
  /* Rail de navigation CLAIR (papier), accent marine à l'état actif. */
  --side:#FBFAF6; --side-ink:#3A382F; --side-ink-2:#98937F; --side-brand:#1B1A16;
  --side-line:#E4E0D2; --side-hover:#F1EEE4; --side-active:#EEF1F6; --side-active-ink:#16304F;
  --r:12px; --r-sm:9px; --r-lg:12px; --r-pill:999px;
  /* Flat : bordure fine plutôt qu'ombre ; --sh = micro-élévation au survol. */
  --sh-sm:none; --sh:0 1px 2px rgba(40,34,20,.05),0 10px 26px -12px rgba(40,34,20,.22);
  /* Sans natif (pas d'Inter — trop « template ») ; sérif pour titres et chiffres. */
  --sans:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  --disp:Charter,"Bitstream Charter","Iowan Old Style","Palatino Linotype",Georgia,"Times New Roman",serif;
  --num:Charter,"Iowan Old Style","Palatino Linotype",Georgia,serif;
  /* Alias de compatibilité pour les écrans plus anciens. --serif reste du sans
     (leurs champs de saisie l'utilisent) ; les titres/chiffres passent par --disp/--num. */
  --paper:var(--app); --hair:var(--line); --hair-2:var(--line-2);
  --jade:var(--brand-600); --jade-soft:var(--brand-soft); --serif:var(--sans); --shadow:var(--sh);
}
@media(prefers-color-scheme:dark){:root{
  --app:#141310; --card:#1C1B17; --panel:#211F1A; --line:#2E2B24; --line-2:#26241E;
  --ink:#EDE9DE; --ink-2:#CFC9BA; --muted:#9A9284; --faint:#6F6A5D;
  --brand:#8AA9CE; --brand-ink:#12161C; --brand-soft:#1E2A38; --brand-600:#A6C0DE;
  --ok:#5FB088; --ok-soft:#182219; --warn:#C99A5B; --warn-soft:#241E12;
  --risk:#D98A7C; --risk-soft:#271815; --steel:#8A93A8;
  --side:#1A1915; --side-ink:#CFC9BA; --side-ink-2:#8A8375; --side-brand:#EDE9DE;
  --side-line:#2A281F; --side-hover:#211F1A; --side-active:#1E2A38; --side-active-ink:#A6C0DE;
  --sh-sm:0 1px 2px rgba(0,0,0,.5); --sh:0 1px 3px rgba(0,0,0,.5),0 10px 30px rgba(0,0,0,.5);
}}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--app);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;font-feature-settings:'cv02','cv03','cv04','tnum'}
a{color:inherit}
.num{font-variant-numeric:tabular-nums}
/* Coquille */
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
.side{background:var(--side);color:var(--side-ink);display:flex;flex-direction:column;gap:3px;padding:16px 12px;position:sticky;top:0;height:100vh;border-right:1px solid var(--side-line)}
.logo{display:flex;align-items:center;gap:9px;padding:6px 8px 18px;color:var(--side-brand)}
.logo .mk{width:29px;height:29px;border-radius:8px;background:var(--brand);display:flex;align-items:center;justify-content:center;flex:none}
.logo .mk svg{width:17px;height:17px;color:#fff}
.logo .wm{font-family:var(--disp);font-size:19px;font-weight:600;letter-spacing:0;color:var(--side-brand)}
.logo .wm span{color:var(--brand)}
.nav{display:flex;flex-direction:column;gap:8px}
.navgroup{display:flex;flex-direction:column;gap:1px}
.navtitle{font-size:10px;font-weight:720;letter-spacing:.07em;text-transform:uppercase;color:var(--side-ink-2);padding:2px 11px 5px}
.nav a{position:relative;display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:var(--r-sm);color:var(--side-ink);text-decoration:none;font-size:13.5px;font-weight:550;transition:background .12s,color .12s}
.nav a svg{width:18px;height:18px;flex:none;opacity:.75}
.nav a:hover{background:var(--side-hover);color:var(--side-brand)}
.nav a.on{background:var(--side-active);color:var(--side-active-ink);font-weight:640}
.nav a.on::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:0 3px 3px 0;background:var(--brand)}
.nav a.on svg{opacity:1;color:var(--side-active-ink)}
.side .sep{height:1px;background:var(--side-line);margin:11px 6px}
.side-foot{margin-top:auto;padding:6px}
.side-foot .lbl{font-size:10.5px;font-weight:680;letter-spacing:.07em;text-transform:uppercase;color:var(--side-ink-2);margin-bottom:7px}
.side-foot select{width:100%;font-family:var(--sans);font-size:13px;color:var(--side-brand);background:var(--side-hover);border:1px solid var(--side-line);border-radius:8px;padding:8px 10px;cursor:pointer}
.side-foot .who{font-size:11.5px;color:var(--side-ink-2);margin-top:12px;padding:0 2px}
/* Contenu */
.main{min-width:0;display:flex;flex-direction:column;background:var(--app)}
.topbar{position:sticky;top:0;z-index:5;background:var(--card);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 30px;border-bottom:1px solid var(--line)}
.topbar .tt{display:flex;flex-direction:column;gap:1px;min-width:0}
.topbar h1{font-family:var(--disp);font-size:22px;font-weight:600;letter-spacing:-.005em}
.topbar .st{font-size:13px;color:var(--muted)}
.tb-search{position:relative;flex:1;max-width:420px;margin:0 8px}
.tb-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--faint);pointer-events:none}
.tb-search input{width:100%;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-pill);padding:9px 14px 9px 36px}
.tb-search input:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.topbar .right{display:flex;align-items:center;gap:8px}
/* Nova — bulle flottante + panneau de conversation */
.nova-fab{position:fixed;right:22px;bottom:22px;z-index:40;width:56px;height:56px;border-radius:50%;border:none;background:var(--brand);color:var(--brand-ink);box-shadow:0 8px 24px rgba(30,58,95,.34);cursor:pointer;display:flex;align-items:center;justify-content:center}
.nova-fab:hover{filter:brightness(1.07)} .nova-fab svg{width:26px;height:26px}
.nova-chat{position:fixed;right:22px;bottom:88px;z-index:41;width:min(380px,calc(100vw - 32px));height:min(540px,calc(100vh - 130px));background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:0 18px 50px rgba(20,24,40,.28);display:none;flex-direction:column;overflow:hidden}
.nova-chat.open{display:flex}
.nova-ch-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--brand-soft),transparent)}
.nova-ch-head .av{width:32px;height:32px;border-radius:9px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.nova-ch-head .av svg{width:18px;height:18px}
.nova-ch-head .nm{font-weight:750;font-size:14.5px}.nova-ch-head .nm .tag{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--brand-600);margin-left:6px}
.nova-ch-head .x{margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;line-height:1;padding:2px 6px}
.nova-msgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.nova-b{max-width:85%;font-size:14px;line-height:1.5;padding:10px 13px;border-radius:14px;white-space:pre-wrap}
.nova-b.me{align-self:flex-end;background:var(--brand);color:#fff;border-bottom-right-radius:5px}
.nova-b.nova{align-self:flex-start;background:var(--panel);color:var(--ink);border-bottom-left-radius:5px}
.nova-b.note{align-self:stretch;background:var(--warn-soft);color:var(--warn);font-size:12.5px;text-align:center;border-radius:10px}
.nova-in{display:flex;gap:8px;padding:12px 14px;border-top:1px solid var(--line)}
.nova-in input{flex:1;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-pill);padding:10px 14px}
.nova-in input:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.nova-in button{flex:none;background:var(--brand);color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.nova-in button svg{width:18px;height:18px}
@media(max-width:520px){.nova-chat{right:12px;left:12px;width:auto}}
.topbar .acts{display:flex;gap:9px;flex-wrap:wrap}
.iconbtn{width:38px;height:38px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--card);color:var(--ink-2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:border-color .12s,color .12s}
.iconbtn:hover{border-color:var(--brand);color:var(--brand)}
.iconbtn svg{width:19px;height:19px}
/* Sélecteur d'entreprise (sous le logo) */
.wswitch{position:relative;margin:0 6px 12px}
.wswitch select{width:100%;font-family:var(--sans);font-size:13px;font-weight:560;color:var(--side-brand);background:var(--side-hover);border:1px solid var(--side-line);border-radius:9px;padding:9px 30px 9px 11px;cursor:pointer;-webkit-appearance:none;appearance:none}
.wswitch::after{content:"";position:absolute;right:13px;top:50%;width:7px;height:7px;border-right:1.6px solid var(--side-ink-2);border-bottom:1.6px solid var(--side-ink-2);transform:translateY(-70%) rotate(45deg);pointer-events:none}
/* Barre : cluster d'icônes d'application */
.tb-ic{position:relative;width:38px;height:38px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--card);color:var(--ink-2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:border-color .12s,color .12s}
.tb-ic:hover{border-color:var(--brand);color:var(--brand)}
.tb-ic svg{width:19px;height:19px}
.tb-ic .dot{position:absolute;top:5px;right:5px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--risk);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;border:1.5px solid var(--card);font-variant-numeric:tabular-nums}
/* Compte */
.acct{position:relative}
.acct .chip{display:flex;align-items:center;gap:8px;padding:4px 11px 4px 4px;border:1px solid var(--line);border-radius:22px;background:var(--card);cursor:pointer}
.acct .chip:hover{border-color:var(--brand)}
.acct .chip .av{width:28px;height:28px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font-size:11px;font-weight:700;font-family:var(--disp)}
.acct .chip .nm{font-size:12.5px;font-weight:560;color:var(--ink-2)}
.acct .chip .ca{color:var(--faint);font-size:11px}
.acct .menu{position:absolute;right:0;top:46px;background:var(--card);border:1px solid var(--line);border-radius:11px;box-shadow:var(--sh);min-width:210px;padding:6px;display:none;z-index:30}
.acct.open .menu{display:block}
.acct .menu .who{padding:8px 10px 6px;font-size:11.5px;color:var(--muted)}
.acct .menu .who b{display:block;color:var(--ink);font-size:13px;font-weight:640}
.acct .menu a,.acct .menu button{display:flex;width:100%;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:520;color:var(--ink-2);background:none;border:none;cursor:pointer;text-decoration:none;text-align:left;font-family:var(--sans)}
.acct .menu a svg,.acct .menu button svg{width:16px;height:16px;color:var(--faint)}
.acct .menu a:hover,.acct .menu button:hover{background:var(--panel)}
.acct .menu .sep{height:1px;background:var(--line-2);margin:5px 4px}
.acct .menu .lo{color:var(--risk)}
/* Barre d'état (bas de l'application) */
.statusbar{display:flex;align-items:center;gap:16px;padding:8px 30px;background:var(--card);border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}
.statusbar .g{display:flex;align-items:center;gap:7px}
.statusbar .live{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px var(--ok-soft)}
.statusbar .sp{margin-left:auto}
.statusbar b{color:var(--ink-2);font-weight:600;font-variant-numeric:tabular-nums}
.content{padding:24px 28px 40px;max-width:1120px;width:100%;flex:1}
/* Composants */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:20px 22px}
.card+.card{margin-top:16px}
.card-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:3px}
.card-h h2,.card-h h3{font-family:var(--disp);font-size:16px;font-weight:600;letter-spacing:-.005em}
.card-h a{font-size:13px;font-weight:600;color:var(--brand);text-decoration:none}
.card .hint{font-size:12.5px;color:var(--muted);margin-bottom:14px}
.grid{display:grid;gap:16px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:18px 20px;text-decoration:none;color:inherit;display:block;transition:border-color .12s,box-shadow .12s}
a.stat:hover{border-color:var(--brand);box-shadow:var(--sh)}
.stat .k{font-size:11.5px;font-weight:640;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:7px}
.stat .k svg{width:15px;height:15px;color:var(--faint)}
.stat .v{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:clamp(34px,4vw,44px);font-weight:600;line-height:1;margin-top:12px;letter-spacing:-.01em}
.stat .d{font-size:12.5px;color:var(--muted);margin-top:9px}
.stat.brand .v{color:var(--brand-600)} .stat.warn .v{color:var(--warn)}
/* Libellé de section (petites majuscules, à la QuickBooks) */
.section-label{font-size:12px;font-weight:720;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);margin:26px 2px 12px}
.section-label:first-child{margin-top:6px}
/* Carte « funnel » : bordure colorée en haut + très gros chiffre */
.fcard{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--brand);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:18px 20px;text-decoration:none;color:inherit;display:block;transition:box-shadow .12s}
a.fcard:hover{box-shadow:var(--sh)}
.fcard.g{border-top-color:var(--brand)} .fcard.a{border-top-color:var(--warn)} .fcard.b{border-top-color:var(--steel)} .fcard.r{border-top-color:var(--risk)}
.fcard .fl{font-size:12px;font-weight:620;color:var(--muted)}
.fcard .fv{font-family:var(--num);font-variant-numeric:tabular-nums;font-size:clamp(27px,3.2vw,36px);font-weight:600;letter-spacing:-.01em;line-height:1.05;margin:8px 0 4px}
.fcard .fc{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
/* Actions rapides (pilules) */
.qact{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:4px}
.qact a{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--ink-2);background:var(--card);border:1px solid var(--line);border-radius:var(--r-pill);padding:9px 15px;text-decoration:none;transition:border-color .12s,color .12s}
.qact a:hover{border-color:var(--brand);color:var(--brand-600)}
.qact a svg{width:16px;height:16px;color:var(--brand)}
/* Disposition à deux colonnes (contenu + panneau latéral, comme BANK ACCOUNTS) */
.cols{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
@media(max-width:960px){.cols{grid-template-columns:1fr}}
@media(max-width:820px){.g4{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.g4,.g3,.g2{grid-template-columns:1fr}}
/* Accessibilité */
.skip{position:absolute;left:-9999px;top:10px;z-index:100;background:var(--card);color:var(--ink);border:1px solid var(--brand);border-radius:8px;padding:9px 14px;font-weight:600;text-decoration:none}
.skip:focus{left:12px}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:4px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.001ms!important;animation-duration:.001ms!important;scroll-behavior:auto!important}}
/* Slide-over (panneau latéral) réutilisable */
.sheet-ov{position:fixed;inset:0;background:rgba(17,24,39,.4);opacity:0;visibility:hidden;transition:opacity .18s;z-index:50}
.sheet-ov.open{opacity:1;visibility:visible}
.sheet{position:fixed;top:0;right:0;bottom:0;width:min(430px,100vw);background:var(--card);border-left:1px solid var(--line);box-shadow:-14px 0 44px rgba(17,24,39,.18);transform:translateX(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);z-index:51;display:flex;flex-direction:column}
.sheet.open{transform:none}
.sheet-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid var(--line)}
.sheet-h h2{font-size:16px;font-weight:720;letter-spacing:-.01em}
.sheet-h .x{background:none;border:none;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
.sheet-h .x:hover{background:var(--panel);color:var(--ink)}
.sheet-b{padding:20px 22px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px}
.sheet-f{padding:16px 22px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;align-items:center}
.sheet label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.sheet input{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px}
.sheet input:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
@media(prefers-reduced-motion:reduce){.sheet,.sheet-ov{transition:none}}
.btn{display:inline-flex;align-items:center;gap:7px;font-family:var(--sans);font-size:13.5px;font-weight:620;padding:9px 15px;border-radius:var(--r-sm);border:1px solid transparent;cursor:pointer;text-decoration:none;transition:filter .12s,border-color .12s,background .12s}
.btn svg{width:16px;height:16px}
.btn-primary{background:var(--brand);color:#fff}.btn-primary:hover{filter:brightness(1.07)}
.btn-ghost{background:var(--card);color:var(--ink-2);border-color:var(--line)}.btn-ghost:hover{border-color:var(--brand);color:var(--brand)}
.badge{display:inline-flex;align-items:center;font-size:11px;font-weight:680;letter-spacing:.02em;padding:3px 9px;border-radius:var(--r-pill);white-space:nowrap}
.badge-brand{background:var(--brand-soft);color:var(--brand-600)} .badge-muted{background:var(--panel);color:var(--muted)}
.badge-ok{background:var(--ok-soft);color:var(--ok)} .badge-warn{background:var(--warn-soft);color:var(--warn)} .badge-risk{background:var(--risk-soft);color:var(--risk)}
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;font-size:11px;font-weight:640;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:0 12px 10px;border-bottom:1px solid var(--line)}
.tbl td{padding:13px 12px;border-bottom:1px solid var(--line-2);font-size:14px;vertical-align:top}
.tbl tr:last-child td{border-bottom:none}
.field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--muted)}
.field input,.field select,.field textarea{font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--app);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
.field input:focus,.field select:focus,.field textarea:focus{outline:2px solid var(--brand);outline-offset:1px;background:var(--card)}
.muted{color:var(--muted)}
.pagefoot{margin:24px 0 8px;color:var(--faint);font-size:12.5px}
@media(max-width:900px){
  .app{grid-template-columns:1fr}
  .side{position:sticky;top:0;height:auto;flex-direction:row;align-items:center;gap:8px;padding:10px 12px;overflow-x:auto;z-index:10}
  .logo{padding:2px 6px 2px 2px}.logo .wm{display:none}
  .nav{flex-direction:row;gap:4px}
  .navgroup{flex-direction:row;gap:4px} .navtitle{display:none}
  .nav a span{display:none} .nav a{padding:9px}
  .nav a.on::before{display:none}
  .side .sep{display:none}
  .side-foot{margin:0 0 0 auto;padding:0}.side-foot .lbl,.side-foot .who{display:none}
  .content{padding:20px 16px 40px}.topbar{padding:14px 16px}
  .tb-search{display:none}.acct .chip .nm,.acct .chip .ca{display:none}
  .statusbar{padding:8px 16px;font-size:11px}.statusbar .hidem{display:none}
  .wswitch{display:none}
}
@media(max-width:640px){.tb-ic.opt{display:none}}
`;

/**
 * Enveloppe une page dans la coquille d'application.
 * @param {{title:string, subtitle?:string, active:string, source?:string,
 *          sources?:string[], pass?:string, contentHtml:string, actionsHtml?:string,
 *          extraCss?:string, bodyScript?:string, noindex?:boolean}} o
 */
function page(o) {
  const q = (href) => {
    const parts = [];
    if (o.source) parts.push('source=' + encodeURIComponent(o.source));
    if (o.pass) parts.push('pass=' + encodeURIComponent(o.pass));
    return href + (parts.length ? '?' + parts.join('&') : '');
  };
  const lien = (n) => `<a class="${n.key === o.active ? 'on' : ''}"${n.key === o.active ? ' aria-current="page"' : ''} href="${q(n.href)}">${icon(n.icon)}<span>${esc(n.label)}</span></a>`;
  const nav = NAV_GROUPS.map((g) => `<div class="navgroup"><div class="navtitle">${esc(g.titre)}</div>${g.items.map(lien).join('')}</div>`).join('');
  const wswitch = (o.sources && o.sources.length > 1)
    ? `<div class="wswitch"><select aria-label="Changer d’entreprise" onchange="var u=new URL(location.href);u.searchParams.set('source',this.value);location.href=u.toString()">${o.sources.map(s =>
        `<option value="${esc(s)}"${s === o.source ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></div>` : '';
  const nbEnt = (o.sources && o.sources.length) || 1;
  const alertes = Number(o.alertes) > 0 ? Number(o.alertes) : 0;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${o.noindex === false ? '' : '<meta name="robots" content="noindex">'}
<title>${esc(o.title)} — Novalis</title><style>${UI_CSS}${o.extraCss || ''}</style></head>
<body><a class="skip" href="#contenu">Aller au contenu</a><div class="app">
  <aside class="side">
    <div class="logo"><span class="mk">${MARK}</span><span class="wm">nova<span>lis</span></span></div>
    ${wswitch}
    <nav class="nav" aria-label="Navigation principale">${nav}</nav>
    <div class="sep"></div>
    <div class="side-foot"><div class="who">Espace d’exploitation</div></div>
  </aside>
  <main class="main">
    <div class="topbar">
      <div class="tt"><h1>${esc(o.title)}</h1>${o.subtitle ? `<div class="st">${esc(o.subtitle)}</div>` : ''}</div>
      <div class="tb-search">${icon('search')}<input type="search" id="tbq" placeholder="Rechercher dans cette page…" aria-label="Rechercher"></div>
      <div class="right">
        ${o.actionsHtml ? `<div class="acts">${o.actionsHtml}</div>` : ''}
        <a class="tb-ic" href="${q('/core/propositions')}" title="À approuver" aria-label="À approuver">${icon('inbox')}${alertes ? `<span class="dot">${alertes > 99 ? '99+' : alertes}</span>` : ''}</a>
        <button class="tb-ic opt" id="nova-help" title="Demander à Nova" aria-label="Aide de Nova">${icon('help')}</button>
        <a class="tb-ic opt" href="${q('/core/branchement')}" title="Réglages de l’entreprise" aria-label="Réglages">${icon('gear')}</a>
        <div class="acct" id="acct">
          <button class="chip" id="acct-btn" aria-haspopup="menu" aria-expanded="false"><span class="av">EX</span><span class="nm">Exploitation</span><span class="ca">▾</span></button>
          <div class="menu" role="menu">
            <div class="who">Connecté comme<b>Exploitation</b></div>
            <a role="menuitem" href="${q('/core/entreprises')}">${icon('grid')} Toutes les entreprises</a>
            <a role="menuitem" href="${q('/core/branchement')}">${icon('plug')} Branchement &amp; réglages</a>
            <div class="sep"></div>
            <button role="menuitem" class="lo" id="acct-logout">Se déconnecter</button>
          </div>
        </div>
      </div>
    </div>
    <div class="content" id="contenu">${o.contentHtml}</div>
    <footer class="statusbar">
      <span class="g"><span class="live"></span>Connecté</span>
      <span class="g hidem">Nova opère <b>${nbEnt}</b>&nbsp;entreprise${nbEnt > 1 ? 's' : ''}</span>
      <span class="sp"></span>
      <span class="g hidem">Rien n’est envoyé sans votre approbation</span>
      <span class="g">Espace d’exploitation Novalis</span>
    </footer>
  </main>
</div>
<button class="nova-fab" id="nova-fab" title="Demander à Nova" aria-label="Ouvrir Nova">${SPARK}</button>
<div class="nova-chat" id="nova-chat" role="dialog" aria-modal="true" aria-label="Nova, votre assistant">
  <div class="nova-ch-head"><span class="av">${SPARK}</span><span class="nm">Nova<span class="tag">assistant</span></span><button class="x" id="nova-x" aria-label="Fermer">×</button></div>
  <div class="nova-msgs" id="nova-msgs"><div class="nova-b nova">Bonjour ! Je suis Nova. Demandez-moi ce qui se passe, ou dites-moi quoi faire — par exemple « approuve la réponse à… » ou « active la réponse instantanée ».</div></div>
  <div class="nova-in"><input id="nova-q" placeholder="Écrivez à Nova…" aria-label="Message à Nova"><button id="nova-send" aria-label="Envoyer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg></button></div>
</div>
<script>${SHELL_SCRIPT(o.source, o.pass)}</script>
${o.bodyScript ? `<script>${o.bodyScript}</script>` : ''}
</body></html>`;
}

// Badge d'état d'une proposition — partagé (devis récents, publications, etc.).
const STATUT_BADGE = {
  en_attente: ['badge-brand', 'En attente'], approuve: ['badge-ok', 'Approuvé'],
  envoye: ['badge-ok', 'Envoyé'], rejete: ['badge-muted', 'Rejeté'], echec: ['badge-risk', 'Échec'],
};
function statutBadge(s) {
  const [c, l] = STATUT_BADGE[s] || ['badge-muted', s || '—'];
  return `<span class="badge ${c}">${esc(l)}</span>`;
}

module.exports = { esc, icon, page, NAV, UI_CSS, statutBadge };
