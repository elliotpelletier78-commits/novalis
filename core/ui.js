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
  gear: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 15a1.5 1.5 0 0 0 .3 1.7l.05.05a1.8 1.8 0 1 1-2.6 2.6l-.05-.05a1.5 1.5 0 0 0-2.55 1.06V20.5a1.8 1.8 0 1 1-3.6 0v-.07A1.5 1.5 0 0 0 7.3 19.4l-.05.05a1.8 1.8 0 1 1-2.6-2.6l.05-.05A1.5 1.5 0 0 0 4.6 15H4.5a1.8 1.8 0 1 1 0-3.6h.07A1.5 1.5 0 0 0 6.6 8.7l-.05-.05a1.8 1.8 0 1 1 2.6-2.6l.05.05a1.5 1.5 0 0 0 1.7.3H11a1.5 1.5 0 0 0 .9-1.37V4.5a1.8 1.8 0 1 1 3.6 0v.07a1.5 1.5 0 0 0 2.55 1.06l.05-.05a1.8 1.8 0 1 1 2.6 2.6l-.05.05a1.5 1.5 0 0 0-.3 1.7V11a1.5 1.5 0 0 0 1.37.9h.08a1.8 1.8 0 1 1 0 3.6h-.07a1.5 1.5 0 0 0-1.38.9Z"/>',
};
function icon(name) {
  // width/height par défaut = garde-fou : un icône sans style CSS ne peut jamais
  // « exploser » (le CSS spécifique le redimensionne quand nécessaire).
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const NAV = [
  { key: 'aujourdhui', label: 'Aujourd’hui', href: '/core/aujourdhui', icon: 'today' },
  { key: 'propositions', label: 'Poste de commande', href: '/core/propositions', icon: 'inbox' },
  { key: 'reception', label: 'Réception', href: '/core/reception', icon: 'phone' },
  { key: 'devis', label: 'Devis', href: '/core/devis', icon: 'file' },
  { key: 'branchement', label: 'Branchement', href: '/core/branchement', icon: 'plug' },
];

const UI_CSS = `
:root{
  --app:#FAFBFB; --card:#FFFFFF; --panel:#F4F6F5; --line:#E2E6E4; --line-2:#EDF0EE;
  --ink:#1A2B22; --ink-2:#42504A; --muted:#697771; --faint:#98A29C;
  /* Indigo — l'accent « IA moderne ». Le vert reste réservé aux états succès. */
  --brand:#4F46E5; --brand-ink:#FFFFFF; --brand-soft:#ECEBFB; --brand-600:#4338CA;
  --ok:#108000; --ok-soft:#E8F5E6; --warn:#9A5A17; --warn-soft:#FBF0E2;
  --risk:#C0392B; --risk-soft:#FBEDEB; --steel:#6366F1;
  /* Rail de navigation CLAIR et étroit. */
  --side:#FFFFFF; --side-ink:#464F5E; --side-ink-2:#8A93A0; --side-brand:#1A2233;
  --side-line:#E7E9EF; --side-hover:#F3F4F9; --side-active:#ECEBFB; --side-active-ink:#4338CA;
  --r:12px; --r-sm:9px; --r-lg:14px; --r-pill:999px;
  --sh-sm:0 1px 2px rgba(20,40,30,.05); --sh:0 1px 3px rgba(20,40,30,.06),0 6px 18px rgba(20,40,30,.05);
  --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  /* Alias de compatibilité : les écrans plus anciens (Réception, Devis,
     Branchement, Poste de commande) référençaient d'autres noms de variables.
     On les mappe sur le nouveau système pour une seule identité, sans réécrire
     leur CSS interne. --serif → sans (plus d'éditorial, tout en sans-serif). */
  --paper:var(--app); --hair:var(--line); --hair-2:var(--line-2);
  --jade:var(--brand-600); --jade-soft:var(--brand-soft); --serif:var(--sans); --shadow:var(--sh);
}
@media(prefers-color-scheme:dark){:root{
  --app:#0F1210; --card:#171B18; --panel:#1B211D; --line:#28302B; --line-2:#222824;
  --ink:#EAEEEB; --ink-2:#C3CBC6; --muted:#8E988F; --faint:#6B746D;
  --brand:#8B84F5; --brand-ink:#0A0820; --brand-soft:#211E3E; --brand-600:#A29BF8;
  --ok:#4DB37F; --ok-soft:#152720; --warn:#D6A15C; --warn-soft:#2A2213;
  --risk:#E08A72; --risk-soft:#2C1B16; --steel:#8B87E8;
  --side:#141726; --side-ink:#BFC5D2; --side-ink-2:#7E8698; --side-brand:#EDEEFB;
  --side-line:#242840; --side-hover:#1E2236; --side-active:#211E3E; --side-active-ink:#A29BF8;
  --sh-sm:0 1px 2px rgba(0,0,0,.4); --sh:0 1px 3px rgba(0,0,0,.4),0 8px 26px rgba(0,0,0,.45);
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
.logo .wm{font-size:17.5px;font-weight:750;letter-spacing:-.02em;color:var(--side-brand)}
.logo .wm span{color:var(--brand)}
.nav{display:flex;flex-direction:column;gap:1px}
.nav a{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:var(--r-sm);color:var(--side-ink);text-decoration:none;font-size:13.5px;font-weight:550;transition:background .12s,color .12s}
.nav a svg{width:18px;height:18px;flex:none;opacity:.75}
.nav a:hover{background:var(--side-hover);color:var(--side-brand)}
.nav a.on{background:var(--side-active);color:var(--side-active-ink);font-weight:640}
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
.topbar h1{font-size:20px;font-weight:720;letter-spacing:-.015em}
.topbar .st{font-size:13px;color:var(--muted)}
.topbar .right{display:flex;align-items:center;gap:8px}
.topbar .acts{display:flex;gap:9px;flex-wrap:wrap}
.iconbtn{width:38px;height:38px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--card);color:var(--ink-2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:border-color .12s,color .12s}
.iconbtn:hover{border-color:var(--brand);color:var(--brand)}
.iconbtn svg{width:19px;height:19px}
.content{padding:24px 28px 40px;max-width:1120px;width:100%}
/* Composants */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:20px 22px}
.card+.card{margin-top:16px}
.card-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:3px}
.card-h h2{font-size:15px;font-weight:660;letter-spacing:-.005em}
.card-h a{font-size:13px;font-weight:600;color:var(--brand);text-decoration:none}
.card .hint{font-size:12.5px;color:var(--muted);margin-bottom:14px}
.grid{display:grid;gap:16px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-sm);padding:18px 20px;text-decoration:none;color:inherit;display:block;transition:border-color .12s,box-shadow .12s}
a.stat:hover{border-color:var(--brand);box-shadow:var(--sh)}
.stat .k{font-size:11.5px;font-weight:640;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:7px}
.stat .k svg{width:15px;height:15px;color:var(--faint)}
.stat .v{font-size:clamp(36px,4.2vw,46px);font-weight:800;line-height:1;margin-top:12px;letter-spacing:-.03em}
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
.fcard .fv{font-size:clamp(28px,3.4vw,38px);font-weight:800;letter-spacing:-.03em;line-height:1.05;margin:8px 0 4px}
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
  .nav a span{display:none} .nav a{padding:9px}
  .side .sep{display:none}
  .side-foot{margin:0 0 0 auto;padding:0}.side-foot .lbl,.side-foot .who{display:none}
  .content{padding:20px 16px 40px}.topbar{padding:14px 16px}
}
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
  const nav = NAV.map(n => `<a class="${n.key === o.active ? 'on' : ''}" href="${q(n.href)}">${icon(n.icon)}<span>${esc(n.label)}</span></a>`).join('');
  const switcher = (o.sources && o.sources.length > 1)
    ? `<div class="lbl">Entreprise</div><select onchange="var u=new URL(location.href);u.searchParams.set('source',this.value);location.href=u.toString()">${o.sources.map(s =>
        `<option value="${esc(s)}"${s === o.source ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>` : '';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${o.noindex === false ? '' : '<meta name="robots" content="noindex">'}
<title>${esc(o.title)} — Novalis</title><style>${UI_CSS}${o.extraCss || ''}</style></head>
<body><div class="app">
  <aside class="side">
    <div class="logo"><span class="mk">${icon('pulse')}</span><span class="wm">nova<span>lis</span></span></div>
    <nav class="nav">${nav}</nav>
    <div class="sep"></div>
    <div class="side-foot">${switcher}<div class="who">Espace d’exploitation</div></div>
  </aside>
  <main class="main">
    <div class="topbar">
      <div class="tt"><h1>${esc(o.title)}</h1>${o.subtitle ? `<div class="st">${esc(o.subtitle)}</div>` : ''}</div>
      <div class="right">
        ${o.actionsHtml ? `<div class="acts">${o.actionsHtml}</div>` : ''}
        <a class="iconbtn" href="${q('/core/branchement')}" title="Réglages de l’entreprise" aria-label="Réglages">${icon('gear')}</a>
      </div>
    </div>
    <div class="content">${o.contentHtml}</div>
  </main>
</div>${o.bodyScript ? `<script>${o.bodyScript}</script>` : ''}
</body></html>`;
}

module.exports = { esc, icon, page, NAV, UI_CSS };
