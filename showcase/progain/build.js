#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   ProGain.ai — générateur de site statique
   Un seul shell (métadonnées, navigation, pied de page, scripts)
   appliqué à toutes les pages : la cohérence est garantie par
   construction, et la sortie reste du HTML statique que le client
   peut éditer à la main.
      node showcase/progain/build.js
   ════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'https://novalisia.ca/showcase/progain';

/* ── Favicon : nœud de réseau en SVG, encodé en data URI ───────── */
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="7" fill="#070B09"/>' +
  '<g stroke="#2FD08C" stroke-width="1.1" opacity=".55">' +
  '<path d="M16 16 L8 9M16 16 L24 10M16 16 L10 24M16 16 L23 23"/></g>' +
  '<g fill="#2FD08C"><circle cx="16" cy="16" r="3.4"/><circle cx="8" cy="9" r="1.7"/>' +
  '<circle cx="24" cy="10" r="1.7"/><circle cx="10" cy="24" r="1.7"/><circle cx="23" cy="23" r="1.7"/></g></svg>'
);

/* ── Navigation partagée ──────────────────────────────────────── */
const NAV = `<nav class="nav">
  <a class="nav-mark" href="index.html">Pro<span class="g">Gain</span>.ai</a>
  <ul class="nav-links">
    <li><a href="products.html" data-fr="Produits">Products</a></li>
    <li><a href="services.html">Services</a></li>
    <li><a href="about.html" data-fr="À propos">About</a></li>
    <li><a href="contact.html">Contact</a></li>
  </ul>
  <div class="nav-right">
    <div class="lang" role="group" aria-label="Language">
      <button type="button" data-lang="en">EN</button>
      <button type="button" data-lang="fr">FR</button>
    </div>
    <a href="contact.html" class="nav-cta" data-fr="Parlons-nous">Talk to us</a>
    <button class="burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button>
  </div>
</nav>`;

/* ── Pied de page partagé ─────────────────────────────────────── */
const FOOT = `<footer>
  <div class="foot">
    <div>
      <div class="foot-mark">Pro<span class="g">Gain</span>.ai</div>
      <p class="foot-tag" data-fr="Applications d'IA et consultation en intégration d'IA. Basés à Montréal, au service de clients partout dans le monde, en français et en anglais.">AI applications and AI integration consulting. Based in Montréal, serving clients worldwide in English and French.</p>
    </div>
    <div>
      <h4 data-fr="Entreprise">Company</h4>
      <a href="services.html">Services</a>
      <a href="about.html" data-fr="À propos">About</a>
      <a href="contact.html">Contact</a>
      <a href="legal.html" data-fr="Avis juridiques">Legal notices</a>
    </div>
    <div>
      <h4 data-fr="Produits">Products</h4>
      <a href="coach.html">ProGain Coach</a>
      <a href="markets.html">ProGain Markets</a>
      <a href="sentinel.html">ProGain Sentinel</a>
      <a href="products.html" data-fr="Tous les produits">All products</a>
    </div>
    <div>
      <h4 data-fr="Nous joindre">Reach us</h4>
      <a href="mailto:hello@progain.ai">hello@progain.ai</a>
      <p data-fr="Montréal, Québec">Montréal, Québec</p>
      <p data-fr="Français · English">English · Français</p>
    </div>
  </div>
  <div class="foot-bar">
    <span data-fr="© 2026 ProGain.ai — ProGain Markets fournit de l'analytique éducative, pas des conseils en placement.">© 2026 ProGain.ai — ProGain Markets provides educational analytics, not investment advice.</span>
    <span data-fr="Conception par &lt;a href=&quot;https://novalisia.ca&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;&gt;Novalis Studio&lt;/a&gt;">Concept by <a href="https://novalisia.ca" target="_blank" rel="noopener">Novalis Studio</a></span>
  </div>
</footer>`;

/* ── CTA final réutilisable ───────────────────────────────────── */
const CTA = `<section class="cta">
  <canvas id="net2" aria-hidden="true"></canvas>
  <div class="cta-veil" aria-hidden="true"></div>
  <div class="wrap">
    <div class="kicker mid" data-fr="Commencez ici">Start here</div>
    <h2 class="h2"><span class="mask"><span data-fr="Dites-nous ce qui ralentit">Tell us what slows</span></span><span class="mask"><span data-fr="votre &lt;em&gt;entreprise&lt;/em&gt;.">your business <em>down</em>.</span></span></h2>
    <p class="cta-line" data-fr="De &lt;b&gt;Montréal&lt;/b&gt; · en &lt;b&gt;français&lt;/b&gt; et en &lt;b&gt;anglais&lt;/b&gt; · pour des clients partout dans le monde">From <b>Montréal</b> · in <b>English</b> and in <b>French</b> · for clients anywhere in the world</p>
    <a href="contact.html" class="btn-solid" data-fr="Démarrer la conversation">Start the conversation</a>
  </div>
</section>`;

/* ── Bandeau défilant ─────────────────────────────────────────── */
const tickerItems = [
  'Applied AI · <b>built to ship</b>', 'Montréal · <b>worldwide</b>',
  'iOS · Android · <b>Web</b>', 'RAG · <b>agents</b> · automation',
  'EN · <b>FR</b> bilingual by design', '<b>Three</b> products in production',
];
const TICKER = `<div class="ticker" aria-hidden="true"><div class="ticker-in">${
  [...tickerItems, ...tickerItems].map(t => '<span>' + t + '</span>').join('')
}</div></div>`;

/* ── Shell ────────────────────────────────────────────────────── */
function shell(p) {
  const loader = p.loader ? `<div id="loader">
  <div class="load-word">Pro<span class="g">Gain</span>.ai</div>
  <div class="load-sub" id="loadSub">Applied AI · Montréal</div>
  <div class="load-bar" id="loadBar"></div>
</div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.title}</title>
<meta name="description" content="${p.desc}">
<link rel="canonical" href="${BASE}/${p.file}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ProGain.ai">
<meta property="og:title" content="${p.title}">
<meta property="og:description" content="${p.desc}">
<meta property="og:url" content="${BASE}/${p.file}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Hanken+Grotesk:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css">
${p.jsonld ? '<script type="application/ld+json">' + JSON.stringify(p.jsonld) + '</script>' : ''}
</head>
<body>
<div class="cur-ring" aria-hidden="true"></div>
<div class="cur-dot" aria-hidden="true"></div>
<div class="prog" aria-hidden="true"></div>
<div class="curtain" aria-hidden="true"><div class="curtain-mark">Pro<span class="g">Gain</span>.ai</div></div>
${loader}
${NAV}
<main>
${p.body}
</main>
${FOOT}
<script src="../vendor/lenis.min.js"></script>
<script src="../vendor/gsap.min.js"></script>
<script src="../vendor/ScrollTrigger.min.js"></script>
<script src="assets/app.js"></script>
${p.demos ? '<script src="assets/demos.js"></script>' : ''}
</body>
</html>
`;
}

/* ── Fragments réutilisables ──────────────────────────────────── */
const PRODUCTS = [
  {
    file: 'coach.html', code: 'PG—01 / HEALTH', codeFr: 'PG—01 / SANTÉ', acc: '#2FD08C', accSoft: 'rgba(47,208,140,.14)',
    name: 'ProGain Coach',
    tag: 'Your nutrition and training, understood.', tagFr: 'Votre nutrition et vos entraînements, compris.',
    desc: 'An AI companion that counts calories from a photo, plans workouts around your life, and keeps weight loss honest.',
    descFr: "Un compagnon d'IA qui compte les calories à partir d'une photo, planifie les entraînements autour de votre vie et garde la perte de poids honnête.",
    pills: [['App Store · soon', 'App Store · bientôt', 0], ['Google Play · soon', 'Google Play · bientôt', 0], ['Web · request access', 'Web · demander un accès', 1]],
    note: '', noteFr: '',
  },
  {
    file: 'markets.html', code: 'PG—02 / MARKETS', codeFr: 'PG—02 / MARCHÉS', acc: '#E8B44C', accSoft: 'rgba(232,180,76,.13)',
    name: 'ProGain Markets',
    tag: 'See your commodities positions clearly.', tagFr: 'Voyez clairement vos positions sur les matières premières.',
    desc: 'Analytics for traders of commodities and options on futures. Volatility, term structure, and scenario views in one workspace.',
    descFr: "Analytique pour les négociateurs de matières premières et d'options sur contrats à terme. Volatilité, structure par échéance et scénarios dans un seul espace.",
    pills: [['Web · request access', 'Web · demander un accès', 1], ['macOS · Windows · soon', 'macOS · Windows · bientôt', 0]],
    note: 'Educational analytics, not investment advice.', noteFr: "Analytique éducative, pas un conseil en placement.",
  },
  {
    file: 'sentinel.html', code: 'PG—03 / SECURITY', codeFr: 'PG—03 / SÉCURITÉ', acc: '#6FA8DC', accSoft: 'rgba(111,168,220,.13)',
    name: 'ProGain Sentinel',
    tag: 'Find the data leaks in your AI stack.', tagFr: 'Trouvez les fuites de données dans votre pile IA.',
    desc: 'Scans workflows, connectors, code, and app-building platforms for exposure of personal and sensitive information — then delivers a clear diagnostic with suggestions.',
    descFr: "Analyse les flux, connecteurs, code et plateformes de création d'applications à la recherche d'expositions de renseignements personnels et sensibles — puis livre un diagnostic clair avec des suggestions.",
    pills: [['Web · request access', 'Web · demander un accès', 1], ['macOS · Windows · soon', 'macOS · Windows · bientôt', 0]],
    note: '', noteFr: '',
  },
];

const prodCard = p => `<a class="prod" href="${p.file}" style="--acc:${p.acc};--accSoft:${p.accSoft}">
  <div class="prod-glow"></div>
  <div class="prod-code" data-fr="${p.codeFr}">${p.code}</div>
  <div class="prod-name">${p.name}</div>
  <div class="prod-tag" data-fr="${esc(p.tagFr)}">${p.tag}</div>
  <p class="prod-desc" data-fr="${esc(p.descFr)}">${p.desc}</p>
  ${p.note ? '<p class="prod-note" data-fr="' + esc(p.noteFr) + '">' + p.note + '</p>' : ''}
  <div class="prod-pills">${p.pills.map(x => '<span class="pill' + (x[2] ? ' on' : '') + '" data-fr="' + esc(x[1]) + '">' + x[0] + '</span>').join('')}</div>
  <span class="prod-more" data-fr="Découvrir">Explore</span>
</a>`;

function esc(s) { return String(s).replace(/"/g, '&quot;'); }

/* ── Le laboratoire (3 démos) ─────────────────────────────────── */
const LAB_COACH = `<div class="lab-head">
  <div>
    <div class="lab-live" data-fr="Vision · en direct">Vision · live</div>
    <div class="lab-h" style="margin-top:8px" data-fr="Une photo. Les macros, comptées.">One photo. Macros, counted.</div>
    <p class="lab-p" data-fr="Détection des aliments, estimation des portions et calcul des macronutriments — la boucle exacte au cœur de ProGain Coach.">Food detection, portion estimation and macronutrient math — the exact loop at the heart of ProGain Coach.</p>
  </div>
  <button class="lab-run" id="coachRun" data-fr="Analyser l'assiette">Analyze the plate</button>
</div>
<div class="coach-grid">
  <div class="plate" id="plate">
    <div class="plate-scan" id="plateScan"></div>
    <div class="det" style="left:16%;top:26%;width:34%;height:38%"><span class="det-lab" data-fr="Poitrine de poulet · 180 g">Grilled chicken · 180 g</span></div>
    <div class="det" style="left:53%;top:34%;width:30%;height:34%"><span class="det-lab" data-fr="Riz jasmin · 150 g">Jasmine rice · 150 g</span></div>
    <div class="det" style="left:26%;top:63%;width:26%;height:24%"><span class="det-lab" data-fr="Brocoli · 90 g">Broccoli · 90 g</span></div>
  </div>
  <div>
    <div class="kcal" id="kcal">0</div>
    <div class="kcal-u" data-fr="kcal estimées">estimated kcal</div>
    <div style="margin-top:26px">
      <div class="macro"><div class="macro-top"><span data-fr="Protéines">Protein</span><b><span id="mP">0</span> g</b></div><div class="macro-track"><div class="macro-fill" id="fP" style="background:#2FD08C"></div></div></div>
      <div class="macro"><div class="macro-top"><span data-fr="Glucides">Carbs</span><b><span id="mC">0</span> g</b></div><div class="macro-track"><div class="macro-fill" id="fC" style="background:#E8B44C"></div></div></div>
      <div class="macro"><div class="macro-top"><span data-fr="Lipides">Fat</span><b><span id="mF">0</span> g</b></div><div class="macro-track"><div class="macro-fill" id="fF" style="background:#6FA8DC"></div></div></div>
    </div>
    <div class="conf" id="coachConf" data-fr="En attente de l'analyse…">Awaiting analysis…</div>
  </div>
</div>`;

const LAB_MARKETS = `<div class="lab-head">
  <div>
    <div class="lab-live" data-fr="Scénarios · en direct">Scenarios · live</div>
    <div class="lab-h" style="margin-top:8px" data-fr="Déplacez le marché. Voyez le livre.">Move the market. See the book.</div>
    <p class="lab-p" data-fr="Structure par échéance de la volatilité implicite avec asymétrie, et le P&amp;L du portefeuille sous choc — glissez le curseur.">Implied-volatility term structure with skew, and portfolio P&amp;L under shock — drag the slider.</p>
  </div>
  <div class="lab-live" style="align-self:center" data-fr="Analytique éducative">Educational analytics</div>
</div>
<div class="mk-grid">
  <div>
    <div class="mk-chart"><canvas id="volCv" aria-label="Implied volatility term structure"></canvas></div>
    <div class="mk-legend">
      <span><i style="background:#6FA8DC"></i>90% <span data-fr="moneyness (vente)">moneyness (puts)</span></span>
      <span><i style="background:#E8B44C"></i>100% <span data-fr="à parité">at-the-money</span></span>
      <span><i style="background:#2FD08C"></i>110% <span data-fr="moneyness (achat)">moneyness (calls)</span></span>
    </div>
  </div>
  <div class="mk-ctl">
    <div class="mk-lab" data-fr="Choc sur le sous-jacent">Spot shock</div>
    <div class="mk-shock" id="shockVal">0.0%</div>
    <input type="range" id="shock" min="-25" max="25" step="0.5" value="0" aria-label="Spot shock">
    <div class="mk-rows">
      <div class="mk-row"><span data-fr="Vol. à parité 6 M">ATM vol · 6M</span><b id="atmVol">—</b></div>
      <div class="mk-row"><span data-fr="Asymétrie 90/110">Skew 90/110</span><b id="skewVal">—</b></div>
      <div class="mk-row mk-pnl" id="pnlRow"><span data-fr="P&amp;L du portefeuille">Portfolio P&amp;L</span><b id="pnlVal">—</b></div>
    </div>
    <p class="mk-note" data-fr="Surface paramétrique de démonstration. Analytique éducative, pas un conseil en placement.">Parametric demo surface. Educational analytics, not investment advice.</p>
  </div>
</div>`;

const LAB_SENTINEL = `<div class="lab-head">
  <div>
    <div class="lab-live" data-fr="Analyse · en direct">Scan · live</div>
    <div class="lab-h" style="margin-top:8px" data-fr="Où fuient vos données ?">Where is your data leaking?</div>
    <p class="lab-p" data-fr="Une pile d'IA d'exemple : connecteurs, récupération, modèles, base. Lancez l'analyse et lisez le diagnostic.">A sample AI stack: connectors, retrieval, models, database. Run the scan and read the diagnostic.</p>
  </div>
  <button class="lab-run" id="snRun" data-fr="Lancer l'analyse">Run the scan</button>
</div>
<div class="sn-grid">
  <div class="sn-map">
    <div class="sn-sweep" id="snSweep"></div>
    <div class="sn-nodes">
      <div class="sn-node" data-sev="ok"><span class="sn-badge">OK</span><div class="sn-n">Slack connector</div><div class="sn-t" data-fr="entrée · messages">ingest · messages</div></div>
      <div class="sn-node" data-sev="crit"><span class="sn-badge">CRITICAL</span><div class="sn-n">Notion → LLM endpoint</div><div class="sn-t" data-fr="récupération · documents">retrieval · documents</div></div>
      <div class="sn-node" data-sev="warn"><span class="sn-badge">HIGH</span><div class="sn-n">Zapier automation</div><div class="sn-t" data-fr="orchestration">orchestration</div></div>
      <div class="sn-node" data-sev="warn"><span class="sn-badge">MEDIUM</span><div class="sn-n">Postgres · vectors</div><div class="sn-t" data-fr="stockage · plongements">storage · embeddings</div></div>
      <div class="sn-node" data-sev="ok"><span class="sn-badge">OK</span><div class="sn-n">Internal web app</div><div class="sn-t" data-fr="surface · authentifiée">surface · authenticated</div></div>
      <div class="sn-node" data-sev="ok"><span class="sn-badge">OK</span><div class="sn-n">Audit log sink</div><div class="sn-t" data-fr="observabilité">observability</div></div>
    </div>
  </div>
  <div class="sn-out" id="snOut">
    <div class="sn-empty" id="snEmpty" data-fr="Aucune analyse effectuée.&lt;br&gt;6 composants en attente.">No scan run yet.<br>6 components awaiting inspection.</div>
  </div>
</div>`;

module.exports = { OUT, BASE, shell, NAV, FOOT, CTA, TICKER, PRODUCTS, prodCard, esc,
  LAB_COACH, LAB_MARKETS, LAB_SENTINEL };

/* Le contenu des pages vit dans pages.js pour garder ce fichier lisible */
if (require.main === module) {
  const pages = require('./pages.js');
  let n = 0;
  for (const p of pages) {
    fs.writeFileSync(path.join(OUT, p.file), shell(p), 'utf8');
    n++;
  }
  console.log('✅ ' + n + ' pages générées dans ' + OUT);
}
