/* ════════════════════════════════════════════════════════════════
   ProGain.ai — contenu des pages
   Chaque entrée décrit une page ; le shell de build.js fournit les
   métadonnées, la navigation, le pied de page et les scripts.
   ════════════════════════════════════════════════════════════════ */
'use strict';
const B = require('./build.js');
const { CTA, TICKER, PRODUCTS, prodCard, esc, LAB_COACH, LAB_MARKETS, LAB_SENTINEL } = B;

const ORG = {
  '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'ProGain.ai',
  description: 'AI applications and AI integration consulting. Based in Montréal, serving clients worldwide in English and French.',
  url: B.BASE + '/index.html', email: 'hello@progain.ai',
  address: { '@type': 'PostalAddress', addressLocality: 'Montréal', addressRegion: 'QC', addressCountry: 'CA' },
  areaServed: 'Worldwide', knowsLanguage: ['en', 'fr'],
  founder: [{ '@type': 'Person', name: 'ProGain founder' }],
};

/* ════════════ ACCUEIL ════════════ */
const HOME = `<header class="hero" style="position:relative;min-height:100vh;display:flex;flex-direction:column;justify-content:center;overflow:hidden">
  <canvas id="net" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
  <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 65% at 50% 45%,transparent 0%,rgba(7,11,9,.82) 100%),linear-gradient(to bottom,rgba(7,11,9,.5) 0%,transparent 30%,transparent 62%,var(--void) 100%)"></div>
  <div style="position:relative;z-index:2;text-align:center;padding:0 var(--gut);max-width:1000px;margin:0 auto">
    <p class="mono" data-rise style="font-size:11px;letter-spacing:.42em;text-transform:uppercase;color:var(--jade);margin-bottom:28px" data-fr="Boutique d'IA · Montréal, partout dans le monde">AI Boutique · Montréal, Worldwide</p>
    <h1 class="h1" style="margin-bottom:26px">
      <span class="mask"><span data-fr="L'IA appliquée,">Applied AI,</span></span>
      <span class="mask"><span data-fr="livrée en &lt;em&gt;production&lt;/em&gt;.">built to <em>ship</em>.</span></span>
    </h1>
    <p class="lead" data-rise style="max-width:620px;margin:0 auto 38px" data-fr="ProGain est une boutique d'IA père et fils à Montréal. Nous concevons et vendons nos propres applications d'IA — et nous appliquons le même savoir-faire aux entreprises, partout, qui veulent l'IA au travail dans leurs opérations.">ProGain is a father and son AI boutique in Montréal. We design and sell our own AI applications — and we bring the same craft to companies anywhere that want AI working inside their business.</p>
    <div class="btn-row" data-rise style="justify-content:center">
      <a href="#lab" class="btn-solid" data-fr="Essayer les produits">Try the products live</a>
      <a href="services.html" class="btn-ghost" data-fr="Parlons de consultation">Talk to us about consulting</a>
    </div>
  </div>
</header>

${TICKER}

<section data-push><div class="wrap">
  <div class="kicker" data-fr="Pourquoi nous existons">Why we exist</div>
  <p class="h3" id="mani" style="font-family:'Fraunces',serif;font-weight:400;font-size:clamp(26px,3.6vw,52px);line-height:1.34;max-width:1000px" data-fr="La plupart des entreprises n'ont pas un &lt;em&gt;problème d'IA&lt;/em&gt;. Elles ont un processus qui perd du temps, une décision prise sur des données périmées, un client qui attend trop longtemps. Nous trouvons où l'IA &lt;em&gt;rapporte vraiment&lt;/em&gt; — puis nous la construisons, et nous la livrons.">Most companies do not have an <em>AI problem</em>. They have a process that leaks time, a decision made on stale data, a customer who waits too long. We find where AI actually <em>pays off</em> — then we build it, and we ship it.</p>
  <p class="lead" style="margin-top:34px;max-width:560px" data-fr="Pas d'expériences de laboratoire qui ne quittent jamais la présentation. Pas de projets pilotes qui meurent en comité. Du logiciel qui gagne sa place dans votre entreprise, sinon il ne sort pas.">No lab experiments that never leave the deck. No pilots that die in committee. Software that earns its place in your business, or it doesn't ship.</p>
</div></section>

<div class="netmask" data-word="ProGain" data-size="16vw">
  <canvas id="netmaskCv" aria-hidden="true"></canvas>
  <div class="netmask-ghost" aria-hidden="true">ProGain</div>
  <svg aria-hidden="true"></svg>
  <div class="netmask-edge" aria-hidden="true"></div>
  <div class="netmask-cap" data-fr="Le réseau, vu à travers le nom">The network, seen through the name</div>
</div>

<section id="products" class="track-sec" style="background:var(--deep);border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)">
  <div class="ghost r" aria-hidden="true">03</div>
  <div class="track-pin">
    <div class="track-head">
      <div class="kicker" data-fr="Conçus dans notre studio">Built in our studio</div>
      <h2 class="h2"><span class="mask"><span data-fr="Trois produits.">Three products.</span></span><span class="mask"><span data-fr="Un seul &lt;em&gt;standard&lt;/em&gt;.">One <em>standard</em>.</span></span></h2>
    </div>
    <div class="track" data-rise=".prod">${PRODUCTS.map(prodCard).join('')}<div style="width:1px;flex-shrink:0" aria-hidden="true"></div></div>
    <div class="track-hint" data-fr="Faites défiler">Keep scrolling</div>
  </div>
</section>

<section id="lab"><div class="wrap">
  <div class="kicker" data-fr="Le laboratoire">The lab</div>
  <h2 class="h2"><span class="mask"><span data-fr="Ne nous croyez pas">Don't take our word</span></span><span class="mask"><span data-fr="sur &lt;em&gt;parole&lt;/em&gt;.">for <em>it</em>.</span></span></h2>
  <p class="lead" style="margin-top:22px;max-width:640px" data-fr="Trois aperçus jouables de ce que nous construisons. Chacun tourne entièrement dans votre navigateur — appuyez sur le bouton et regardez.">Three playable slices of what we build. Each one runs entirely in your browser — press the button and watch.</p>
  <div class="lab-tabs" role="tablist" data-rise=".lab-tab">
    <button class="lab-tab on" data-tab="coach" style="--tabAcc:#2FD08C" role="tab">PG—01 · Coach</button>
    <button class="lab-tab" data-tab="markets" style="--tabAcc:#E8B44C" role="tab">PG—02 · Markets</button>
    <button class="lab-tab" data-tab="sentinel" style="--tabAcc:#6FA8DC" role="tab">PG—03 · Sentinel</button>
  </div>
  <div class="lab-stage">
    <div class="lab-panel on" id="p-coach" style="--acc:#2FD08C">${LAB_COACH}</div>
    <div class="lab-panel" id="p-markets" style="--acc:#E8B44C">${LAB_MARKETS}</div>
    <div class="lab-panel" id="p-sentinel" style="--acc:#6FA8DC">${LAB_SENTINEL}</div>
  </div>
</div></section>

<section class="light" data-push>
  <div class="ghost l" aria-hidden="true">06</div>
  <div class="wrap">
  <div class="kicker" data-fr="Consultation">Consulting</div>
  <h2 class="h2"><span class="mask"><span data-fr="L'IA qui gagne sa place">AI that earns its place</span></span><span class="mask"><span data-fr="dans votre &lt;em&gt;entreprise&lt;/em&gt;.">in your <em>business</em>.</span></span></h2>
  <p class="lead" style="margin-top:22px;max-width:640px" data-fr="Nous trouvons où l'IA rapporte vraiment, puis nous la construisons et l'intégrons — discrètement, dans les outils que votre équipe utilise déjà.">We find where AI actually pays off, then we build it and integrate it — quietly, inside the tools your team already uses.</p>
  <div class="svc-grid" data-rise=".svc">
    <div class="svc"><div class="svc-num">S/01</div><h3 data-fr="Évaluation des occasions">Opportunity assessment</h3><p data-fr="Une lecture claire de là où l'IA crée de la valeur dans vos opérations — et de là où elle n'en crée pas.">A clear reading of where AI creates value in your operation, and where it does not.</p></div>
    <div class="svc"><div class="svc-num">S/02</div><h3 data-fr="Outils d'embauche pour les RH">Hiring tools for HR</h3><p data-fr="Des assistants de tri et d'évaluation qui lisent les candidatures comme votre meilleur recruteur.">Screening and evaluation assistants that read applications the way your best recruiter does.</p></div>
    <div class="svc"><div class="svc-num">S/03</div><h3 data-fr="Réceptionniste et vendeur IA">AI receptionist &amp; sales rep</h3><p data-fr="Répond à vos clients avec votre inventaire, votre calendrier, vos prix et vos fiches clients en main.">Answers your clients with your inventory, calendar, price sheets, and client profiles at hand.</p></div>
    <div class="svc"><div class="svc-num">S/04</div><h3 data-fr="Assistants de connaissances (RAG)">Knowledge assistants (RAG)</h3><p data-fr="Vos documents deviennent des réponses. Génération augmentée par récupération, bâtie sur vos propres données.">Your documents become answers. Retrieval-augmented generation built on your company's own data.</p></div>
    <div class="svc"><div class="svc-num">S/05</div><h3 data-fr="Formation en IA">AI training</h3><p data-fr="Nous formons votre équipe à travailler avec Claude et les outils d'IA modernes — en pratique.">We teach your team to work with Claude and modern AI tools — hands on.</p></div>
    <div class="svc"><div class="svc-num">S/06</div><h3 data-fr="Intégration et automatisation">Integration &amp; automation</h3><p data-fr="L'IA branchée aux outils que votre équipe utilise déjà, qui travaille discrètement en arrière-plan.">AI connected to the tools your team already uses, working quietly in the background.</p></div>
  </div>
  <div class="btn-row" style="margin-top:20px"><a href="services.html" class="btn-ghost" data-fr="Voir la consultation en détail">See consulting in detail</a></div>
  </div>
</section>

<section data-push><div class="wrap">
  <div class="kicker" data-fr="Comment nous travaillons">How we work</div>
  <h2 class="h2"><span class="mask"><span data-fr="Du premier appel">From first call</span></span><span class="mask"><span data-fr="au logiciel en &lt;em&gt;production&lt;/em&gt;.">to software in <em>production</em>.</span></span></h2>
  <div class="split" style="margin-top:clamp(40px,6vh,80px);align-items:start">
    <div><p class="lead" style="max-width:400px" data-fr="La même discipline que derrière nos propres produits, appliquée aux vôtres. Portée réduite, preuve rapide, verdicts honnêtes — et rien ne sort avant d'atteindre le standard.">The same discipline behind our own products, applied to yours. Small scope, fast proof, honest verdicts — and nothing ships until it holds the standard.</p></div>
    <div class="steps" data-rise=".step">
      <div class="step"><div class="step-num" data-fr="01 / ÉVALUER">01 / ASSESS</div><div class="step-t" data-fr="Trouver où l'IA rapporte">Find where AI pays off</div><p data-fr="Nous cartographions vos opérations et donnons un verdict franc — y compris là où l'IA ne vaut &lt;i&gt;pas&lt;/i&gt; la peine.">We map your operation and give a straight verdict — including where AI is <i>not</i> worth it.</p></div>
      <div class="step"><div class="step-num" data-fr="02 / PROTOTYPER">02 / PROTOTYPE</div><div class="step-t" data-fr="Le prouver sur vos données">Prove it on your data</div><p data-fr="Un prototype fonctionnel sur vos vrais documents, calendriers et listes de prix — pas une présentation.">A working prototype on your real documents, calendars and price sheets — not a slide deck.</p></div>
      <div class="step"><div class="step-num" data-fr="03 / LIVRER">03 / SHIP</div><div class="step-t" data-fr="Le mettre en production">Put it in production</div><p data-fr="Déployé, surveillé, et branché aux outils dans lesquels votre équipe vit déjà.">Deployed, monitored, and connected to the tools your team already lives in.</p></div>
      <div class="step"><div class="step-num" data-fr="04 / INTÉGRER">04 / INTEGRATE</div><div class="step-t" data-fr="Le faire disparaître">Make it disappear</div><p data-fr="La meilleure IA est invisible — elle répond, classe, rédige et signale en arrière-plan pendant que votre équipe travaille.">The best AI is invisible — it answers, files, drafts and flags in the background while your team works.</p></div>
    </div>
  </div>
</div></section>

<section style="background:var(--deep);border-top:1px solid var(--hair)" data-push><div class="wrap split">
  <div>
    <div class="kicker" data-fr="Qui nous sommes">Who we are</div>
    <h2 class="h2"><span class="mask"><span data-fr="Deux fondateurs.">Two founders.</span></span><span class="mask"><span data-fr="Un seul &lt;em&gt;standard&lt;/em&gt;.">One <em>standard</em>.</span></span></h2>
    <p class="lead" style="margin-top:26px;max-width:520px" data-fr="Une équipe père et fils à Montréal. L'un construit comme un mathématicien, l'autre comme un opérateur — chaque produit et chaque système client passe les deux filtres avant d'être livré.">A father and son team in Montréal. One builds like a mathematician, the other like an operator — every product and every client system passes both filters before it ships.</p>
    <div class="btn-row" style="margin-top:30px"><a href="about.html" class="btn-ghost" data-fr="Notre histoire">Our story</a></div>
  </div>
  <div class="grid-2" data-rise=".card">
    <div class="card" style="padding:24px 22px"><b style="font-family:'Fraunces',serif;font-weight:500;font-size:18px;display:block;margin-bottom:8px">MIT</b><span class="mono" style="font-size:11px;line-height:1.6;color:var(--bone-dim);display:block" data-fr="Études de 2&lt;sup&gt;e&lt;/sup&gt; cycle — science des données et apprentissage machine">Post-graduate studies — data science &amp; machine learning</span></div>
    <div class="card" style="padding:24px 22px"><b style="font-family:'Fraunces',serif;font-weight:500;font-size:18px;display:block;margin-bottom:8px">UT Austin</b><span class="mono" style="font-size:11px;line-height:1.6;color:var(--bone-dim);display:block" data-fr="Programme de 2&lt;sup&gt;e&lt;/sup&gt; cycle — IA générative et agentique">Post-graduate program — generative &amp; agentic AI</span></div>
    <div class="card" style="padding:24px 22px"><b style="font-family:'Fraunces',serif;font-weight:500;font-size:18px;display:block;margin-bottom:8px">U. de Montréal</b><span class="mono" style="font-size:11px;line-height:1.6;color:var(--bone-dim);display:block" data-fr="B. Sc. Mathématiques">B.Sc. Mathematics</span></div>
    <div class="card" style="padding:24px 22px"><b style="font-family:'Fraunces',serif;font-weight:500;font-size:18px;display:block;margin-bottom:8px">U. de Sherbrooke</b><span class="mono" style="font-size:11px;line-height:1.6;color:var(--bone-dim);display:block" data-fr="Études en administration des affaires">Business administration studies</span></div>
  </div>
</div></section>

<div class="kin">
  <div class="kin-grid" aria-hidden="true"></div>
  <div class="kin-in">
    <p class="kin-eyebrow" data-fr="La seule mesure qui compte">The only metric that matters</p>
    <div class="kin-word" id="kinWord" data-fr="LIVRÉ.">SHIPPED.</div>
    <p class="kin-sub" data-fr="Conçu · Construit · En production">Designed · Built · In production</p>
  </div>
</div>

${CTA}`;

/* ════════════ PRODUITS (index) ════════════ */
const PRODUCTS_PAGE = `<header class="phead">
  <div class="phead-grid" aria-hidden="true"></div>
  <div class="phead-in">
    <div class="crumb"><a href="index.html">ProGain</a> / <span data-fr="Produits">Products</span></div>
    <h1 class="h1"><span class="mask"><span data-fr="Conçus dans">Built in</span></span><span class="mask"><span data-fr="notre &lt;em&gt;studio&lt;/em&gt;.">our <em>studio</em>.</span></span></h1>
    <p class="lead" data-fr="Trois applications que nous concevons, construisons et derrière lesquelles nous nous tenons. Chacune existe parce que nous avions nous-mêmes le problème.">Three applications we design, build, and stand behind. Each one exists because we had the problem ourselves.</p>
  </div>
</header>

<section><div class="wrap">
  <div class="grid-3" data-rise=".prod">${PRODUCTS.map(prodCard).join('')}</div>
</div></section>

<section style="background:var(--deep);border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)"><div class="wrap tight">
  <div class="kicker" data-fr="Disponibilité">Availability</div>
  <h2 class="h2" style="margin-bottom:44px"><span class="mask"><span data-fr="Où et quand">Where and when</span></span><span class="mask"><span data-fr="vous pouvez les &lt;em&gt;utiliser&lt;/em&gt;.">you can <em>use</em> them.</span></span></h2>
  <div style="overflow-x:auto">
  <table class="tbl" style="min-width:560px">
    <thead><tr>
      <th data-fr="Produit">Product</th><th>Web</th><th>iOS</th><th>Android</th><th data-fr="Bureau">Desktop</th><th data-fr="Statut">Status</th>
    </tr></thead>
    <tbody>
      <tr><td><b>ProGain Coach</b></td><td class="pos" data-fr="accès sur demande">request access</td><td data-fr="bientôt">soon</td><td data-fr="bientôt">soon</td><td>—</td><td data-fr="en développement actif">in active development</td></tr>
      <tr><td><b>ProGain Markets</b></td><td class="pos" data-fr="accès sur demande">request access</td><td>—</td><td>—</td><td data-fr="bientôt">soon</td><td data-fr="essais privés">private testing</td></tr>
      <tr><td><b>ProGain Sentinel</b></td><td class="pos" data-fr="accès sur demande">request access</td><td>—</td><td>—</td><td data-fr="bientôt">soon</td><td data-fr="essais privés">private testing</td></tr>
    </tbody>
  </table>
  </div>
  <p class="mono" style="margin-top:22px;font-size:11px;color:var(--bone-faint)" data-fr="Vous voulez un accès anticipé à l'un d'eux ? Écrivez-nous — nous ouvrons les accès par vagues.">Want early access to any of them? Write to us — we open access in waves.</p>
</div></section>

${CTA}`;

/* ════════════ Fabrique de page produit ════════════ */
function productPage({ id, acc, accSoft, crumb, crumbFr, h1a, h1aFr, h1b, h1bFr, lead, leadFr,
                       mock, feats, lab, labId, faq, note, noteFr }) {
  return `<header class="phead">
  <canvas id="phnet" class="phnet" data-acc="${acc}" aria-hidden="true"></canvas>
  <div class="phead-grid" aria-hidden="true"></div>
  <div class="phead-in">
    <div class="crumb"><a href="index.html">ProGain</a> / <a href="products.html" data-fr="Produits">Products</a> / <span data-fr="${esc(crumbFr)}">${crumb}</span></div>
    <div class="mono" style="font-size:11px;letter-spacing:.22em;color:${acc};margin-bottom:16px">${id}</div>
    <h1 class="h1"><span class="mask"><span data-fr="${esc(h1aFr)}">${h1a}</span></span><span class="mask"><span data-fr="${esc(h1bFr)}">${h1b}</span></span></h1>
    <p class="lead" data-fr="${esc(leadFr)}">${lead}</p>
    <div class="btn-row" style="margin-top:32px">
      <a href="contact.html" class="btn-solid" data-fr="Demander un accès">Request access</a>
      <a href="#try" class="btn-ghost" data-fr="Essayer la démo">Try the demo</a>
    </div>
    ${note ? '<p class="mono" style="margin-top:24px;font-size:11px;color:var(--bone-faint);font-style:italic" data-fr="' + esc(noteFr) + '">' + note + '</p>' : ''}
  </div>
</header>

<section style="background:var(--deep);border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)"><div class="wrap split ${mock.wide ? 'wide-l' : ''}">
  ${mock.reverse ? mock.html + mock.text : mock.text + mock.html}
</div></section>

<section><div class="wrap">
  <div class="kicker" data-fr="Ce qu'il fait">What it does</div>
  <h2 class="h2" style="margin-bottom:20px"><span class="mask"><span data-fr="Les capacités">The capabilities</span></span><span class="mask"><span data-fr="qui &lt;em&gt;comptent&lt;/em&gt;.">that <em>matter</em>.</span></span></h2>
  <div class="svc-grid dark-svc" data-rise=".svc">${feats.map((f, i) =>
    '<div class="svc"><div class="svc-num" style="color:' + acc + '">F/0' + (i + 1) + '</div><h3 data-fr="' + esc(f[1]) + '">' + f[0] + '</h3><p data-fr="' + esc(f[3]) + '">' + f[2] + '</p></div>').join('')}</div>
</div></section>

<section id="try" style="background:var(--deep);border-top:1px solid var(--hair)"><div class="wrap">
  <div class="kicker" data-fr="Essayez-le">Try it</div>
  <h2 class="h2" style="margin-bottom:40px"><span class="mask"><span data-fr="Dans votre navigateur,">In your browser,</span></span><span class="mask"><span data-fr="tout de &lt;em&gt;suite&lt;/em&gt;.">right <em>now</em>.</span></span></h2>
  <div class="lab-solo" style="--acc:${acc}" id="p-${labId}">${lab}</div>
</div></section>

${faq ? `<section><div class="wrap">
  <div class="kicker" data-fr="Questions fréquentes">Common questions</div>
  <h2 class="h2" style="margin-bottom:44px"><span class="mask"><span data-fr="Ce qu'on nous">What people</span></span><span class="mask"><span data-fr="demande le plus &lt;em&gt;souvent&lt;/em&gt;.">ask us <em>most</em>.</span></span></h2>
  <div class="faq">${faq.map(f =>
    '<button class="faq-q" data-fr="' + esc(f[1]) + '">' + f[0] + '</button><div class="faq-a"><div class="faq-a-in" data-fr="' + esc(f[3]) + '">' + f[2] + '</div></div>').join('')}</div>
</div></section>` : ''}

${CTA}`;
}

/* ── Maquette téléphone (Coach) ─────────────────────────────── */
const RING = (r, pct, color, w) => {
  const c = 2 * Math.PI * r;
  return '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="rgba(237,243,238,.08)" stroke-width="' + w + '"/>' +
         '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + w +
         '" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct)) + '"/>';
};
const FORK = '<svg viewBox="0 0 24 24"><path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9M15 3c2 0 3 2 3 5s-1 4-3 4v9"/></svg>';

const PHONE_COACH = `<div class="phone" aria-label="ProGain Coach app interface">
  <div class="scr">
    <div class="scr-top"><div class="scr-h" data-fr="Aujourd'hui">Today</div><div class="scr-d" data-fr="Mar 14 mai">Tue May 14</div></div>
    <div class="rings">
      <svg width="132" height="132" viewBox="0 0 132 132">
        ${RING(58, .72, '#2FD08C', 7)}${RING(46, .58, '#E8B44C', 7)}${RING(34, .41, '#6FA8DC', 7)}
      </svg>
      <div class="rings-c"><div class="rings-n">1 842</div><div class="rings-l" data-fr="sur 2 550 kcal">of 2,550 kcal</div></div>
    </div>
    <div class="meal"><div class="meal-ic">${FORK}</div><div class="meal-t"><div class="meal-n" data-fr="Bol de poulet et riz">Chicken &amp; rice bowl</div><div class="meal-m">P 62 · C 48 · F 7</div></div><div class="meal-k">523</div></div>
    <div class="meal"><div class="meal-ic">${FORK}</div><div class="meal-t"><div class="meal-n" data-fr="Yogourt grec, baies">Greek yogurt, berries</div><div class="meal-m">P 20 · C 18 · F 4</div></div><div class="meal-k">218</div></div>
    <div class="meal"><div class="meal-ic">${FORK}</div><div class="meal-t"><div class="meal-n" data-fr="Saumon, patate douce">Salmon, sweet potato</div><div class="meal-m">P 44 · C 39 · F 21</div></div><div class="meal-k">601</div></div>
    <div class="scr-tabs"><i class="on"></i><i></i><i></i><i></i></div>
  </div>
</div>`;

/* ── Maquette fenêtre (Markets) ─────────────────────────────── */
const WIN_MARKETS = `<div class="win" aria-label="ProGain Markets workspace">
  <div class="win-bar"><span class="win-dot"></span><span class="win-dot"></span><span class="win-dot"></span><span class="win-t">ProGain Markets — Book</span></div>
  <div class="win-body">
    <table class="tbl">
      <thead><tr><th data-fr="Contrat">Contract</th><th data-fr="Pos.">Pos</th><th>Δ</th><th>ν</th><th>P&amp;L</th></tr></thead>
      <tbody>
        <tr><td><b>CL Jul26 C 82</b></td><td>+250</td><td>0.41</td><td>1 240</td><td class="pos">+18 420</td></tr>
        <tr><td><b>CL Sep26 P 68</b></td><td>−150</td><td>−0.22</td><td>860</td><td class="neg">−7 105</td></tr>
        <tr><td><b>NG Aug26 C 3.4</b></td><td>+400</td><td>0.33</td><td>2 010</td><td class="pos">+11 960</td></tr>
        <tr><td><b>ZC Dec26 P 420</b></td><td>−200</td><td>−0.18</td><td>640</td><td class="neg">−3 480</td></tr>
        <tr><td><b>HG Oct26 C 4.6</b></td><td>+120</td><td>0.28</td><td>430</td><td class="pos">+5 190</td></tr>
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--hair)" class="mono">
      <span style="font-size:10.5px;color:var(--bone-faint);letter-spacing:.14em;text-transform:uppercase" data-fr="Net du livre">Book net</span>
      <span style="font-size:15px;color:var(--jade)">+$24,985</span>
    </div>
  </div>
</div>`;

/* ── Maquette fenêtre (Sentinel) ────────────────────────────── */
const WIN_SENTINEL = `<div class="win" aria-label="ProGain Sentinel dashboard">
  <div class="win-bar"><span class="win-dot"></span><span class="win-dot"></span><span class="win-dot"></span><span class="win-t">ProGain Sentinel — Posture</span></div>
  <div class="win-body">
    <div class="stats" style="grid-template-columns:1fr 1fr 1fr;border:0;background:transparent;gap:12px">
      <div class="stat" style="border:1px solid rgba(224,107,75,.35);border-radius:5px;padding:18px 16px"><div class="stat-n" style="color:var(--rust);font-size:32px">3</div><div class="stat-l" data-fr="critiques">critical</div></div>
      <div class="stat" style="border:1px solid rgba(232,180,76,.3);border-radius:5px;padding:18px 16px"><div class="stat-n" style="color:var(--amber);font-size:32px">7</div><div class="stat-l" data-fr="à surveiller">warnings</div></div>
      <div class="stat" style="border:1px solid rgba(47,208,140,.3);border-radius:5px;padding:18px 16px"><div class="stat-n" style="font-size:32px">41</div><div class="stat-l" data-fr="conformes">passing</div></div>
    </div>
    <table class="tbl" style="margin-top:18px">
      <thead><tr><th data-fr="Composant">Component</th><th data-fr="Exposition">Exposure</th><th data-fr="Sévérité">Severity</th></tr></thead>
      <tbody>
        <tr><td><b>Notion → LLM</b></td><td data-fr="RP non masqués">PII unredacted</td><td class="neg">CRITICAL</td></tr>
        <tr><td><b>Zapier flow</b></td><td data-fr="clé en clair">plaintext key</td><td style="color:var(--amber)">HIGH</td></tr>
        <tr><td><b>Vector store</b></td><td data-fr="documents entiers">whole docs</td><td style="color:var(--steel)">MEDIUM</td></tr>
        <tr><td><b>Slack ingest</b></td><td data-fr="portée limitée">scoped</td><td class="pos">OK</td></tr>
      </tbody>
    </table>
  </div>
</div>`;

const mockText = (kicker, kickerFr, h, hFr, p, pFr, extra) => `<div>
  <div class="kicker" data-fr="${esc(kickerFr)}">${kicker}</div>
  <h2 class="h2"><span class="mask"><span data-fr="${esc(hFr)}">${h}</span></span></h2>
  <p class="lead" style="margin-top:24px;max-width:460px" data-fr="${esc(pFr)}">${p}</p>
  ${extra || ''}
</div>`;

/* ════════════ SERVICES ════════════ */
const SERVICES_PAGE = `<header class="phead">
  <div class="phead-grid" aria-hidden="true"></div>
  <div class="phead-in">
    <div class="crumb"><a href="index.html">ProGain</a> / Services</div>
    <h1 class="h1"><span class="mask"><span data-fr="L'IA qui gagne">AI that earns</span></span><span class="mask"><span data-fr="sa &lt;em&gt;place&lt;/em&gt;.">its <em>place</em>.</span></span></h1>
    <p class="lead" data-fr="Nous ne vendons pas de l'IA. Nous trouvons l'endroit précis où elle rapporte dans vos opérations, nous la construisons, et nous restons jusqu'à ce qu'elle tourne en production.">We don't sell AI. We find the precise place where it pays off in your operation, we build it, and we stay until it runs in production.</p>
  </div>
</header>

<section><div class="wrap">
  <div class="kicker" data-fr="Six façons de commencer">Six ways to start</div>
  <h2 class="h2" style="margin-bottom:20px"><span class="mask"><span data-fr="Ce que nous">What we</span></span><span class="mask"><span data-fr="&lt;em&gt;construisons&lt;/em&gt;.">actually <em>build</em>.</span></span></h2>
  <div class="svc-grid dark-svc" data-rise=".svc">
    <div class="svc"><div class="svc-num">S/01</div><h3 data-fr="Évaluation des occasions">Opportunity assessment</h3><p data-fr="Deux semaines dans vos opérations : où l'IA crée de la valeur, où elle n'en crée pas, et ce que chaque chantier coûterait. Vous ressortez avec une feuille de route chiffrée — même si elle dit de ne rien faire.">Two weeks inside your operation: where AI creates value, where it does not, and what each build would cost. You leave with a costed roadmap — even if it says do nothing.</p></div>
    <div class="svc"><div class="svc-num">S/02</div><h3 data-fr="Outils d'embauche pour les RH">Hiring tools for HR</h3><p data-fr="Des assistants de tri qui lisent les candidatures comme votre meilleur recruteur : critères explicites, justification de chaque décision, et aucune décision finale prise par la machine.">Screening assistants that read applications the way your best recruiter does: explicit criteria, a written rationale for every decision, and no final call made by the machine.</p></div>
    <div class="svc"><div class="svc-num">S/03</div><h3 data-fr="Réceptionniste et vendeur IA">AI receptionist &amp; sales rep</h3><p data-fr="Répond au téléphone, aux courriels et au clavardage avec votre inventaire, votre calendrier, vos prix et vos fiches clients en main. Transfère à un humain dès que la situation le demande.">Answers the phone, email and chat with your inventory, calendar, price sheets and client records at hand. Hands off to a human the moment the situation calls for it.</p></div>
    <div class="svc"><div class="svc-num">S/04</div><h3 data-fr="Assistants de connaissances (RAG)">Knowledge assistants (RAG)</h3><p data-fr="Vos contrats, devis, manuels et courriels deviennent des réponses sourcées. Chaque réponse cite le document exact — pas de génération sans preuve.">Your contracts, quotes, manuals and email threads become sourced answers. Every answer cites the exact document — no generation without evidence.</p></div>
    <div class="svc"><div class="svc-num">S/05</div><h3 data-fr="Formation en IA">AI training</h3><p data-fr="Une journée avec votre équipe, sur vos vrais dossiers. Ils repartent avec des invites qui fonctionnent pour leur métier, pas des exemples génériques.">A day with your team, on your real files. They leave with prompts that work for their job, not generic examples.</p></div>
    <div class="svc"><div class="svc-num">S/06</div><h3 data-fr="Intégration et automatisation">Integration &amp; automation</h3><p data-fr="L'IA branchée à ce que votre équipe utilise déjà — CRM, comptabilité, courriel, entrepôt. Le meilleur système est celui que personne ne remarque.">AI connected to what your team already uses — CRM, accounting, email, warehouse. The best system is the one nobody notices.</p></div>
  </div>
</div></section>

<section style="background:var(--deep);border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)"><div class="wrap">
  <div class="kicker" data-fr="Comment nous travaillons">How we work</div>
  <h2 class="h2"><span class="mask"><span data-fr="Du premier appel">From first call</span></span><span class="mask"><span data-fr="à la &lt;em&gt;production&lt;/em&gt;.">to <em>production</em>.</span></span></h2>
  <div class="split" style="margin-top:clamp(40px,6vh,80px);align-items:start">
    <div><p class="lead" style="max-width:400px" data-fr="Portée réduite, preuve rapide, verdicts honnêtes. Nous préférons vous dire non tôt plutôt que de facturer un projet qui ne tiendra pas.">Small scope, fast proof, honest verdicts. We would rather tell you no early than bill for a project that will not hold.</p></div>
    <div class="steps" data-rise=".step">
      <div class="step"><div class="step-num" data-fr="01 / ÉVALUER">01 / ASSESS</div><div class="step-t" data-fr="Trouver où l'IA rapporte">Find where AI pays off</div><p data-fr="Entretiens, observation, lecture de vos données. Verdict franc — y compris là où l'IA ne vaut &lt;i&gt;pas&lt;/i&gt; la peine.">Interviews, observation, a read of your data. A straight verdict — including where AI is <i>not</i> worth it.</p></div>
      <div class="step"><div class="step-num" data-fr="02 / PROTOTYPER">02 / PROTOTYPE</div><div class="step-t" data-fr="Le prouver sur vos données">Prove it on your data</div><p data-fr="Un prototype fonctionnel sur vos vrais documents en deux à quatre semaines. Vous le testez vous-même avant d'engager la suite.">A working prototype on your real documents in two to four weeks. You test it yourself before committing to the rest.</p></div>
      <div class="step"><div class="step-num" data-fr="03 / LIVRER">03 / SHIP</div><div class="step-t" data-fr="Le mettre en production">Put it in production</div><p data-fr="Déployé, surveillé, journalisé. Vous savez ce qu'il fait, ce qu'il coûte, et quand il se trompe.">Deployed, monitored, logged. You know what it does, what it costs, and when it gets things wrong.</p></div>
      <div class="step"><div class="step-num" data-fr="04 / INTÉGRER">04 / INTEGRATE</div><div class="step-t" data-fr="Le faire disparaître">Make it disappear</div><p data-fr="Branché aux outils existants, formation de l'équipe, documentation. À la fin, vous n'avez plus besoin de nous — c'est le but.">Wired into existing tools, team trained, documented. At the end you no longer need us — that is the point.</p></div>
    </div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="kicker" data-fr="Questions fréquentes">Common questions</div>
  <h2 class="h2" style="margin-bottom:44px"><span class="mask"><span data-fr="Avant de nous">Before you</span></span><span class="mask"><span data-fr="&lt;em&gt;écrire&lt;/em&gt;.">write to <em>us</em>.</span></span></h2>
  <div class="faq">
    <button class="faq-q" data-fr="Travaillez-vous avec de petites entreprises ?">Do you work with small companies?</button>
    <div class="faq-a"><div class="faq-a-in" data-fr="Oui. La taille compte moins que la clarté du problème. Un cabinet de cinq personnes avec un goulot précis est un meilleur mandat qu'une grande entreprise qui « veut faire de l'IA ».">Yes. Size matters less than clarity of the problem. A five-person firm with a specific bottleneck is a better engagement than a large company that "wants to do AI".</div></div>
    <button class="faq-q" data-fr="Et si l'IA n'est pas la réponse ?">What if AI is not the answer?</button>
    <div class="faq-a"><div class="faq-a-in" data-fr="Alors nous le disons, et l'évaluation s'arrête là. La moitié des goulots que nous voyons se règlent avec un meilleur processus ou une intégration classique, pas avec un modèle.">Then we say so, and the assessment ends there. Half the bottlenecks we see are solved by a better process or a plain integration, not by a model.</div></div>
    <button class="faq-q" data-fr="Nos données quittent-elles nos systèmes ?">Does our data leave our systems?</button>
    <div class="faq-a"><div class="faq-a-in" data-fr="Nous concevons pour que la réponse soit non par défaut : masquage avant l'envoi aux modèles, portée limitée sur les connecteurs, journal d'audit. C'est exactement ce que ProGain Sentinel vérifie — nous l'appliquons d'abord à nous-mêmes.">We design so the answer is no by default: redaction before anything reaches a model, scoped connectors, an audit trail. That is exactly what ProGain Sentinel checks — we apply it to ourselves first.</div></div>
    <button class="faq-q" data-fr="En français ou en anglais ?">In French or in English?</button>
    <div class="faq-a"><div class="faq-a-in" data-fr="Les deux, sans supplément et sans traduction approximative. Nous sommes à Montréal ; nos systèmes, notre documentation et nos formations existent dans les deux langues.">Both, at no premium and with no rough translation. We are in Montréal; our systems, documentation and training exist in both languages.</div></div>
  </div>
</div></section>

${CTA}`;

/* ════════════ À PROPOS ════════════ */
const ABOUT_PAGE = `<header class="phead">
  <div class="phead-grid" aria-hidden="true"></div>
  <div class="phead-in">
    <div class="crumb"><a href="index.html">ProGain</a> / <span data-fr="À propos">About</span></div>
    <h1 class="h1"><span class="mask"><span data-fr="Deux fondateurs.">Two founders.</span></span><span class="mask"><span data-fr="Un seul &lt;em&gt;standard&lt;/em&gt;.">One <em>standard</em>.</span></span></h1>
    <p class="lead" data-fr="Une boutique d'IA père et fils à Montréal. L'un construit comme un mathématicien, l'autre comme un opérateur — et rien ne sort avant d'avoir passé les deux filtres.">A father and son AI boutique in Montréal. One builds like a mathematician, the other like an operator — and nothing ships before it passes both filters.</p>
  </div>
</header>

<section><div class="wrap">
  <div class="stats" data-rise=".stat">
    <div class="stat"><div class="stat-n"><span data-count="3">0</span></div><div class="stat-l" data-fr="produits en développement">products in development</div></div>
    <div class="stat"><div class="stat-n"><span data-count="2">0</span></div><div class="stat-l" data-fr="langues, sans supplément">languages, no premium</div></div>
    <div class="stat"><div class="stat-n"><span data-count="4">0</span></div><div class="stat-l" data-fr="universités représentées">universities represented</div></div>
    <div class="stat"><div class="stat-n">∞</div><div class="stat-l" data-fr="territoire desservi">territory served</div></div>
  </div>
</div></section>

<section style="background:var(--deep);border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)"><div class="wrap split">
  <div>
    <div class="kicker" data-fr="L'histoire">The story</div>
    <h2 class="h2"><span class="mask"><span data-fr="Nous avons commencé">We started</span></span><span class="mask"><span data-fr="par nos propres &lt;em&gt;problèmes&lt;/em&gt;.">with our own <em>problems</em>.</span></span></h2>
    <p class="lead" style="margin-top:26px" data-fr="Coach est né parce que compter des macros à la main est une corvée qui fait abandonner. Markets, parce que lire une structure de volatilité dans un tableur est une perte de temps. Sentinel, parce qu'en branchant nos propres outils d'IA nous avons vu à quel point il est facile de laisser fuir des données sans le savoir.">Coach exists because counting macros by hand is the chore that makes people quit. Markets, because reading a volatility term structure in a spreadsheet is a waste of a morning. Sentinel, because while wiring up our own AI tools we saw how easy it is to leak data without knowing it.</p>
    <p class="lead" style="margin-top:18px" data-fr="Trois produits, trois problèmes que nous avions nous-mêmes. C'est aussi comme ça que nous abordons un mandat client : trouver le vrai irritant, pas celui qui présente bien.">Three products, three problems we had ourselves. That is also how we approach a client engagement: find the real irritant, not the one that presents well.</p>
  </div>
  <div class="grid-2" data-rise=".card">
    <div class="card"><b class="h3" style="display:block;margin-bottom:10px">MIT</b><span class="mono" style="font-size:11px;line-height:1.7;color:var(--bone-dim);display:block" data-fr="Études de 2&lt;sup&gt;e&lt;/sup&gt; cycle — science des données et apprentissage machine">Post-graduate studies — data science &amp; machine learning</span></div>
    <div class="card"><b class="h3" style="display:block;margin-bottom:10px">UT Austin</b><span class="mono" style="font-size:11px;line-height:1.7;color:var(--bone-dim);display:block" data-fr="Programme de 2&lt;sup&gt;e&lt;/sup&gt; cycle — IA générative et agentique">Post-graduate program — generative &amp; agentic AI</span></div>
    <div class="card"><b class="h3" style="display:block;margin-bottom:10px">U. de Montréal</b><span class="mono" style="font-size:11px;line-height:1.7;color:var(--bone-dim);display:block" data-fr="B. Sc. Mathématiques">B.Sc. Mathematics</span></div>
    <div class="card"><b class="h3" style="display:block;margin-bottom:10px">U. de Sherbrooke</b><span class="mono" style="font-size:11px;line-height:1.7;color:var(--bone-dim);display:block" data-fr="Études en administration des affaires">Business administration studies</span></div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="kicker" data-fr="Ce à quoi nous tenons">What we hold to</div>
  <h2 class="h2" style="margin-bottom:20px"><span class="mask"><span data-fr="Quatre règles">Four rules</span></span><span class="mask"><span data-fr="qu'on ne &lt;em&gt;plie pas&lt;/em&gt;.">we don't <em>bend</em>.</span></span></h2>
  <div class="svc-grid dark-svc" data-rise=".svc" style="grid-template-columns:1fr 1fr">
    <div class="svc"><div class="svc-num">R/01</div><h3 data-fr="Livré, ou ça ne compte pas">Shipped, or it doesn't count</h3><p data-fr="Un prototype qui ne va pas en production est une dépense, pas un investissement. Nous mesurons notre travail à ce qui tourne.">A prototype that never reaches production is an expense, not an investment. We measure our work by what runs.</p></div>
    <div class="svc"><div class="svc-num">R/02</div><h3 data-fr="Le non arrive tôt">No comes early</h3><p data-fr="Si l'IA n'est pas la bonne réponse, nous le disons pendant l'évaluation — pas après trois mois de facturation.">If AI is not the right answer, we say so during the assessment — not after three months of billing.</p></div>
    <div class="svc"><div class="svc-num">R/03</div><h3 data-fr="Vos données restent les vôtres">Your data stays yours</h3><p data-fr="Masquage avant les modèles, connecteurs à portée limitée, journal d'audit. Par défaut, pas sur demande.">Redaction before models, scoped connectors, an audit trail. By default, not on request.</p></div>
    <div class="svc"><div class="svc-num">R/04</div><h3 data-fr="Bilingue, sans supplément">Bilingual, no premium</h3><p data-fr="Systèmes, documentation et formation en français et en anglais. Nous sommes à Montréal ; c'est la base, pas une option.">Systems, documentation and training in French and English. We are in Montréal; that is the baseline, not an add-on.</p></div>
  </div>
</div></section>

${CTA}`;

/* ════════════ CONTACT ════════════ */
const CONTACT_PAGE = `<header class="phead">
  <div class="phead-grid" aria-hidden="true"></div>
  <div class="phead-in">
    <div class="crumb"><a href="index.html">ProGain</a> / Contact</div>
    <h1 class="h1"><span class="mask"><span data-fr="Dites-nous ce qui">Tell us what</span></span><span class="mask"><span data-fr="vous &lt;em&gt;ralentit&lt;/em&gt;.">slows you <em>down</em>.</span></span></h1>
    <p class="lead" data-fr="Un formulaire court, une vraie réponse. Nous lisons tout nous-mêmes — il n'y a que nous deux.">A short form, a real reply. We read everything ourselves — there are only two of us.</p>
  </div>
</header>

<section><div class="wrap split wide-l" style="align-items:start">
  <form class="form" id="cForm" novalidate>
    <div class="field">
      <label for="f-name" data-fr="Votre nom">Your name</label>
      <input id="f-name" name="name" type="text" autocomplete="name" required maxlength="120" placeholder="Jean Tremblay">
      <div class="field-hint"></div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="f-email" data-fr="Courriel">Email</label>
        <input id="f-email" name="email" type="email" autocomplete="email" required maxlength="180" placeholder="jean@entreprise.ca">
        <div class="field-hint"></div>
      </div>
      <div class="field">
        <label for="f-company" data-fr="Entreprise (facultatif)">Company (optional)</label>
        <input id="f-company" name="company" type="text" autocomplete="organization" maxlength="140" placeholder="—">
        <div class="field-hint"></div>
      </div>
    </div>
    <div class="field">
      <label data-fr="Ce qui vous intéresse">What you're interested in</label>
      <div class="chips" id="topics">
        <button type="button" class="chip" data-topic="assessment" data-fr="Évaluation des occasions">Opportunity assessment</button>
        <button type="button" class="chip" data-topic="receptionist" data-fr="Réceptionniste IA">AI receptionist</button>
        <button type="button" class="chip" data-topic="rag" data-fr="Assistant de connaissances">Knowledge assistant</button>
        <button type="button" class="chip" data-topic="hiring" data-fr="Outils RH">HR tools</button>
        <button type="button" class="chip" data-topic="training" data-fr="Formation">Training</button>
        <button type="button" class="chip" data-topic="coach">ProGain Coach</button>
        <button type="button" class="chip" data-topic="markets">ProGain Markets</button>
        <button type="button" class="chip" data-topic="sentinel">ProGain Sentinel</button>
      </div>
    </div>
    <div class="field">
      <label for="f-msg" data-fr="Le contexte">The context</label>
      <textarea id="f-msg" name="message" required maxlength="4000" placeholder="Le processus qui perd du temps, la décision qui prend trop de données…"></textarea>
      <div class="field-hint"></div>
    </div>
    <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
    <div class="form-msg" id="cMsg" role="status" aria-live="polite"></div>
    <div class="btn-row">
      <button type="submit" class="btn-solid" id="cSubmit" data-fr="Envoyer">Send it</button>
      <span class="mono" style="font-size:10.5px;color:var(--bone-faint)" data-fr="Réponse sous un jour ouvrable">Reply within one business day</span>
    </div>
  </form>

  <aside>
    <div class="card">
      <div class="kicker" style="margin-bottom:18px" data-fr="En direct">Direct</div>
      <button class="copyable" data-copy="hello@progain.ai"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>hello@progain.ai</span></button>
      <p class="mono" style="font-size:11px;line-height:1.9;color:var(--bone-dim);margin-top:20px" data-fr="Montréal, Québec<br>Français · English<br>Clients partout dans le monde">Montréal, Québec<br>English · Français<br>Clients worldwide</p>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="kicker" style="margin-bottom:18px" data-fr="Ce qui arrive ensuite">What happens next</div>
      <div class="steps" style="margin-left:2px">
        <div class="step" style="padding-top:0"><div class="step-num">01</div><div class="step-t" style="font-size:17px" data-fr="Nous lisons">We read it</div><p style="font-size:13px" data-fr="Nous deux, pas un filtre automatique.">Both of us, not an automated filter.</p></div>
        <div class="step"><div class="step-num">02</div><div class="step-t" style="font-size:17px" data-fr="Un appel de 30 minutes">A 30-minute call</div><p style="font-size:13px" data-fr="Pour comprendre le vrai irritant.">To understand the real irritant.</p></div>
        <div class="step" style="padding-bottom:0"><div class="step-num">03</div><div class="step-t" style="font-size:17px" data-fr="Un verdict franc">A straight verdict</div><p style="font-size:13px" data-fr="Y compris « l'IA n'est pas la réponse ».">Including "AI is not the answer".</p></div>
      </div>
    </div>
  </aside>
</div></section>

<script>
/* Formulaire de contact — validation puis envoi à l'API Novalis.
   Sans backend joignable, on bascule sur un lien mailto pré-rempli :
   le visiteur n'est jamais dans une impasse. */
(function(){
  var f=document.getElementById('cForm'); if(!f)return;
  var msg=document.getElementById('cMsg'), btn=document.getElementById('cSubmit'), topics=[];
  var TX={en:{req:'Required',mail:'Enter a valid email',sending:'Sending…',send:'Send it',
      ok:'Thank you — your message reached us. We reply within one business day.',
      ko:'Something went wrong on our side. Write to hello@progain.ai and we will pick it up.',
      fb:'Your email app is opening with the message pre-filled.'},
    fr:{req:'Requis',mail:'Entrez un courriel valide',sending:'Envoi…',send:'Envoyer',
      ok:'Merci — votre message nous est parvenu. Nous répondons sous un jour ouvrable.',
      ko:'Un problème est survenu de notre côté. Écrivez à hello@progain.ai et nous prendrons le relais.',
      fb:'Votre application courriel s\\'ouvre avec le message pré-rempli.'}};
  function T(){return TX[PG.lang]||TX.en;}
  document.querySelectorAll('#topics .chip').forEach(function(c){
    c.onclick=function(){
      c.classList.toggle('on');
      var t=c.dataset.topic, i=topics.indexOf(t);
      if(i<0)topics.push(t); else topics.splice(i,1);
    };
  });
  function bad(id,text){
    var el=document.getElementById(id), fld=el&&el.closest('.field');
    if(!fld)return;
    fld.classList.add('err');
    var hint=fld.querySelector('.field-hint');
    if(hint)hint.textContent=text;           // le bloc de cases n'a pas de zone d'erreur
  }
  function clear(){
    f.querySelectorAll('.field').forEach(function(x){
      x.classList.remove('err');
      var hint=x.querySelector('.field-hint');
      if(hint)hint.textContent='';
    });
    msg.className='form-msg';
  }
  f.addEventListener('submit',async function(e){
    e.preventDefault(); clear();
    // Lecture par identifiant : sur un <form>, la propriété .name est
    // l'attribut du formulaire, pas le champ qui s'appelle « name ».
    var g=function(id){return (document.getElementById(id).value||'').trim();};
    var name=g('f-name'), email=g('f-email'),
        company=g('f-company'), message=g('f-msg'),
        honey=f.elements.website ? f.elements.website.value : '';
    var ok=true;
    if(!name){bad('f-name',T().req);ok=false;}
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)){bad('f-email',T().mail);ok=false;}
    if(message.length<10){bad('f-msg',T().req);ok=false;}
    if(!ok)return;
    if(honey)return; // piège à robots : on ignore silencieusement
    btn.disabled=true; btn.textContent=T().sending;
    try{
      var r=await fetch('/api/progain/contact',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:name,email:email,company:company,message:message,topics:topics,lang:PG.lang})});
      if(!r.ok)throw new Error('http '+r.status);
      msg.className='form-msg on ok'; msg.textContent=T().ok;
      f.reset(); topics=[];
      document.querySelectorAll('#topics .chip.on').forEach(function(c){c.classList.remove('on');});
    }catch(err){
      msg.className='form-msg on ko'; msg.textContent=T().ko+' '+T().fb;
      var body=encodeURIComponent(message+'\\n\\n— '+name+(company?', '+company:'')+'\\n'+email);
      setTimeout(function(){location.href='mailto:hello@progain.ai?subject='+encodeURIComponent('ProGain — '+name)+'&body='+body;},1200);
    }finally{
      btn.disabled=false; btn.textContent=T().send;
    }
  });
  document.addEventListener('pg:lang',function(){ if(!btn.disabled)btn.textContent=T().send; });
})();
</script>`;

/* ════════════ LÉGAL & 404 ════════════ */
const LEGAL_PAGE = `<header class="phead">
  <div class="phead-grid" aria-hidden="true"></div>
  <div class="phead-in">
    <div class="crumb"><a href="index.html">ProGain</a> / <span data-fr="Avis juridiques">Legal notices</span></div>
    <h1 class="h1" style="font-size:clamp(34px,5vw,64px)"><span class="mask"><span data-fr="Avis juridiques">Legal notices</span></span></h1>
  </div>
</header>
<section><div class="wrap prose">
  <p class="mono" style="font-size:11px;letter-spacing:.14em;color:var(--bone-faint);text-transform:uppercase" data-fr="Version préliminaire · en révision par conseil juridique">Placeholder · under review by legal counsel</p>
  <h3 data-fr="Analytique éducative">Educational analytics</h3>
  <p data-fr="ProGain Markets fournit de l'analytique à visée éducative. Rien sur ce site ni dans le produit ne constitue un conseil en placement, une recommandation d'achat ou de vente, ni une sollicitation. Les surfaces de volatilité présentées en démonstration sont paramétriques et ne représentent aucun marché réel.">ProGain Markets provides analytics for educational purposes. Nothing on this site or in the product constitutes investment advice, a recommendation to buy or sell, or a solicitation. The volatility surfaces shown in demonstrations are parametric and represent no real market.</p>
  <h3 data-fr="Santé et bien-être">Health and wellness</h3>
  <p data-fr="ProGain Coach est un outil de suivi et de planification. Il ne fournit pas de diagnostic médical et ne remplace pas l'avis d'un professionnel de la santé. Les estimations de calories et de macronutriments sont approximatives.">ProGain Coach is a tracking and planning tool. It does not provide medical diagnosis and does not replace the advice of a health professional. Calorie and macronutrient estimates are approximate.</p>
  <h3 data-fr="Sécurité et confidentialité">Security and privacy</h3>
  <p data-fr="Les démonstrations de ce site tournent entièrement dans votre navigateur : aucune donnée n'est transmise. Le formulaire de contact transmet uniquement les champs que vous remplissez, aux seules fins de vous répondre.">The demonstrations on this site run entirely in your browser: no data is transmitted. The contact form transmits only the fields you fill in, for the sole purpose of replying to you.</p>
  <h3 data-fr="Propriété intellectuelle">Intellectual property</h3>
  <p data-fr="ProGain, ProGain Coach, ProGain Markets et ProGain Sentinel sont des marques de ProGain.ai. Le contenu de ce site est protégé par le droit d'auteur.">ProGain, ProGain Coach, ProGain Markets and ProGain Sentinel are marks of ProGain.ai. The content of this site is protected by copyright.</p>
  <h3 data-fr="Nous joindre">Contact</h3>
  <p data-fr="Pour toute question d'ordre juridique : &lt;strong&gt;hello@progain.ai&lt;/strong&gt;, Montréal, Québec, Canada.">For any legal question: <strong>hello@progain.ai</strong>, Montréal, Québec, Canada.</p>
</div></section>`;

const NF_PAGE = `<div class="nf">
  <div class="nf-code">404</div>
  <h1 class="h2" style="margin-top:18px"><span data-fr="Cette page n'a jamais été livrée.">This page never shipped.</span></h1>
  <p class="lead" style="max-width:460px;margin:20px auto 34px" data-fr="Le lien est peut-être ancien, ou la page a changé de nom. Voici les endroits qui existent.">The link may be old, or the page was renamed. Here are the places that do exist.</p>
  <div class="btn-row" style="justify-content:center">
    <a href="index.html" class="btn-solid" data-fr="Retour à l'accueil">Back home</a>
    <a href="products.html" class="btn-ghost" data-fr="Les produits">The products</a>
    <a href="contact.html" class="btn-ghost">Contact</a>
  </div>
</div>`;

/* ════════════ Liste finale ════════════ */
module.exports = [
  { file: 'index.html', loader: true, demos: true, jsonld: ORG,
    title: 'ProGain — Applied AI, built to ship. | Montréal AI Boutique',
    desc: 'ProGain is a father and son AI boutique in Montréal. Three AI products for health, markets and security — plus AI integration consulting worldwide, in English and French.',
    body: HOME },

  { file: 'products.html', jsonld: null,
    title: 'Products — ProGain Coach, Markets, Sentinel | ProGain.ai',
    desc: 'Three AI applications designed and built in our Montréal studio: nutrition coaching, commodities analytics, and AI-stack data-leak scanning.',
    body: PRODUCTS_PAGE },

  { file: 'coach.html', demos: true,
    title: 'ProGain Coach — Your nutrition and training, understood | ProGain.ai',
    desc: 'An AI companion that counts calories from a photo, plans workouts around your life, and keeps weight loss honest. Try the food-detection demo in your browser.',
    body: productPage({
      id: 'PG—01 / HEALTH', acc: '#2FD08C', crumb: 'Coach', crumbFr: 'Coach',
      h1a: 'One photo.', h1aFr: 'Une photo.', h1b: 'Macros <em>counted</em>.', h1bFr: 'Les macros <em>comptées</em>.',
      lead: 'Counting macros by hand is the chore that makes people quit. Coach removes it: photograph the plate, get the numbers, keep the habit.',
      leadFr: "Compter ses macros à la main est la corvée qui fait abandonner. Coach l'enlève : photographiez l'assiette, obtenez les chiffres, gardez l'habitude.",
      mock: { wide: false, reverse: false, html: PHONE_COACH,
        text: mockText('The app', "L'application", 'Your day, in three rings.', 'Votre journée, en trois anneaux.',
          'Calories, protein and training load on one screen. Log a meal in two taps, and the plan adjusts to the week you are actually having — not the week you planned.',
          "Calories, protéines et charge d'entraînement sur un seul écran. Enregistrez un repas en deux touches, et le plan s'ajuste à la semaine que vous vivez vraiment — pas à celle que vous aviez prévue.") },
      feats: [
        ['Photo to macros', 'De la photo aux macros', 'Point the camera at the plate. Items are detected, portions estimated by volume, and macros computed with a confidence figure you can see.', "Pointez la caméra vers l'assiette. Les aliments sont détectés, les portions estimées par volume, et les macros calculées avec un indice de confiance visible."],
        ['Training that fits your week', 'Un entraînement qui suit votre semaine', 'Sessions planned around your real calendar and recovery, not an ideal one. Miss a day and the week rebalances instead of shaming you.', "Des séances planifiées selon votre vrai calendrier et votre récupération, pas un calendrier idéal. Manquez un jour et la semaine se rééquilibre au lieu de vous culpabiliser."],
        ['Honest weight tracking', 'Un suivi de poids honnête', 'Trend lines instead of daily noise, so water weight never reads as failure. The number you see is the number that matters.', "Des tendances au lieu du bruit quotidien : la rétention d'eau ne se lit plus comme un échec. Le chiffre affiché est celui qui compte."],
        ['Bilingual from the first screen', 'Bilingue dès le premier écran', 'Food databases, coaching copy and units in French and English — including Québec grocery items, not just American ones.', "Bases d'aliments, textes de coaching et unités en français et en anglais — y compris les produits d'épicerie du Québec, pas seulement américains."],
        ['Your data stays yours', 'Vos données restent les vôtres', 'Photos are processed for recognition and not sold, shared or used to build advertising profiles.', "Les photos servent à la reconnaissance : elles ne sont ni vendues, ni partagées, ni utilisées pour bâtir des profils publicitaires."],
        ['Built by people who use it', 'Bâti par ceux qui s\'en servent', 'Coach started as our own tool. Every feature had to survive daily use before it reached the roadmap.', "Coach a commencé comme notre propre outil. Chaque fonction a dû survivre à un usage quotidien avant d'entrer dans la feuille de route."],
      ],
      lab: LAB_COACH, labId: 'coach',
      faq: [
        ['How accurate is photo detection?', 'Quelle est la précision de la détection par photo ?',
         'Accurate enough to keep a habit, not a laboratory instrument. Portions are estimated by volume, so a dense sauce or a hidden oil can shift the estimate — which is why every result shows its confidence and stays editable in two taps.',
         "Assez précise pour tenir une habitude, pas un instrument de laboratoire. Les portions sont estimées par volume : une sauce dense ou une huile cachée peut décaler l'estimation — c'est pourquoi chaque résultat affiche sa confiance et reste modifiable en deux touches."],
        ['When is it on the App Store?', 'Quand sera-t-il sur l\'App Store ?',
         'iOS and Android builds are in active development. Web access opens in waves — ask us and we will put you in the next one.',
         "Les versions iOS et Android sont en développement actif. L'accès web s'ouvre par vagues — écrivez-nous et nous vous mettons dans la prochaine."],
        ['Does it replace a nutritionist?', 'Remplace-t-il une nutritionniste ?',
         'No. It removes the accounting so a professional — or you — can work on the actual decisions. It is a tracking and planning tool, not medical advice.',
         "Non. Il enlève la comptabilité pour qu'un professionnel — ou vous — puisse travailler sur les vraies décisions. C'est un outil de suivi et de planification, pas un avis médical."],
      ],
      note: '', noteFr: '',
    }) },

  { file: 'markets.html', demos: true,
    title: 'ProGain Markets — See your commodities positions clearly | ProGain.ai',
    desc: 'Analytics for traders of commodities and options on futures: volatility, term structure and scenario views in one workspace. Educational analytics, not investment advice.',
    body: productPage({
      id: 'PG—02 / MARKETS', acc: '#E8B44C', crumb: 'Markets', crumbFr: 'Markets',
      h1a: 'Move the market.', h1aFr: 'Déplacez le marché.', h1b: 'See the <em>book</em>.', h1bFr: 'Voyez le <em>livre</em>.',
      lead: 'Volatility, term structure and scenarios in one workspace — so a shock you are worried about becomes a number instead of a feeling.',
      leadFr: "Volatilité, structure par échéance et scénarios dans un seul espace — pour qu'un choc qui vous inquiète devienne un chiffre au lieu d'une impression.",
      mock: { wide: true, reverse: true, html: WIN_MARKETS,
        text: mockText('The workspace', "L'espace de travail", 'Your book, on one screen.', 'Votre livre, sur un écran.',
          'Positions, greeks and P&L in a single table that updates with the surface. No exporting to a spreadsheet to answer a question you will ask again tomorrow.',
          "Positions, sensibilités et P&L dans un seul tableau qui suit la surface. Fini l'export vers un tableur pour répondre à une question que vous reposerez demain.") },
      feats: [
        ['Term structure with skew', 'Structure par échéance avec asymétrie', 'The whole surface, not one number: implied vol across maturities and moneyness, with the skew that actually prices your wings.', "Toute la surface, pas un seul chiffre : la volatilité implicite selon les échéances et le moneyness, avec l'asymétrie qui valorise réellement vos ailes."],
        ['Scenario shocks', 'Chocs de scénario', 'Drag a spot shock and watch vol, skew and portfolio P&L move together — the correlation you know is there, made explicit.', "Glissez un choc sur le sous-jacent et regardez volatilité, asymétrie et P&L bouger ensemble — la corrélation que vous connaissez, rendue explicite."],
        ['Options on futures, properly', 'Les options sur contrats à terme, correctement', 'Built for commodities conventions: contract months, roll behaviour and futures-style pricing rather than an equity model bent into shape.', "Bâti pour les conventions des matières premières : mois de contrat, comportement de roulement et valorisation à la façon des contrats à terme, plutôt qu'un modèle d'actions déformé."],
        ['One workspace', 'Un seul espace', 'Positions, greeks, surface and scenarios in the same view. Fewer windows, fewer copy-paste mistakes at 7 a.m.', "Positions, sensibilités, surface et scénarios dans la même vue. Moins de fenêtres, moins d'erreurs de copier-coller à 7 h du matin."],
        ['Your data, local first', 'Vos données, locales d\'abord', 'Your book is yours. Positions can stay on your machine; nothing is sold, brokered or aggregated.', "Votre livre est le vôtre. Les positions peuvent rester sur votre machine ; rien n'est vendu, courtisé ou agrégé."],
        ['Educational by design', 'Éducatif par conception', 'Markets shows you structure and consequences. It does not tell you what to trade, and it never will.', "Markets vous montre la structure et les conséquences. Il ne vous dit pas quoi négocier, et ne le fera jamais."],
      ],
      lab: LAB_MARKETS, labId: 'markets',
      faq: [
        ['Which markets are covered?', 'Quels marchés sont couverts ?',
         'Commodities and options on futures first — energy, grains and metals — because that is where the conventions are least well served by generic tools.',
         "Les matières premières et les options sur contrats à terme d'abord — énergie, grains et métaux — parce que c'est là que les conventions sont les moins bien servies par les outils génériques."],
        ['Is this investment advice?', 'Est-ce un conseil en placement ?',
         'No. Markets is educational analytics. It presents structure, sensitivities and scenarios; every decision remains yours, and the demo surface on this page is parametric, not a real market.',
         "Non. Markets est de l'analytique éducative. Il présente la structure, les sensibilités et les scénarios ; chaque décision reste la vôtre, et la surface de démonstration de cette page est paramétrique, pas un marché réel."],
        ['Can it read my existing positions?', 'Peut-il lire mes positions existantes ?',
         'Import from CSV works today; broker connections are on the roadmap and will be opt-in, read-only and scoped.',
         "L'import par CSV fonctionne aujourd'hui ; les connexions aux courtiers sont prévues et seront volontaires, en lecture seule et à portée limitée."],
      ],
      note: 'Educational analytics, not investment advice.', noteFr: "Analytique éducative, pas un conseil en placement.",
    }) },

  { file: 'sentinel.html', demos: true,
    title: 'ProGain Sentinel — Find the data leaks in your AI stack | ProGain.ai',
    desc: 'Sentinel scans workflows, connectors, code and app-building platforms for exposure of personal and sensitive information, then delivers a clear diagnostic with fixes.',
    body: productPage({
      id: 'PG—03 / SECURITY', acc: '#6FA8DC', crumb: 'Sentinel', crumbFr: 'Sentinel',
      h1a: 'Every connector', h1aFr: 'Chaque connecteur', h1b: 'is a <em>door</em>.', h1bFr: 'est une <em>porte</em>.',
      lead: 'Teams wire AI into their tools in an afternoon. Sentinel tells you what walked out the door while you did — and what to close first.',
      leadFr: "Une équipe branche l'IA à ses outils en un après-midi. Sentinel vous dit ce qui est sorti pendant ce temps-là — et ce qu'il faut fermer en premier.",
      mock: { wide: true, reverse: false, html: WIN_SENTINEL,
        text: mockText('The dashboard', 'Le tableau de bord', 'Posture, not paranoia.', 'Une posture, pas de la paranoïa.',
          'One view of every component that touches a model: what it can read, what it forwards, and which findings deserve your afternoon. Severity is ranked so you fix three things, not fifty.',
          "Une seule vue de chaque composant qui touche un modèle : ce qu'il peut lire, ce qu'il transmet, et quels constats méritent votre après-midi. La sévérité est classée pour que vous corrigiez trois choses, pas cinquante.") },
      feats: [
        ['Connector inventory', 'Inventaire des connecteurs', 'Every integration that can read your data, listed with its real scope — including the ones somebody added and forgot.', "Chaque intégration capable de lire vos données, listée avec sa portée réelle — y compris celles que quelqu'un a ajoutées puis oubliées."],
        ['Personal data in transit', 'Données personnelles en transit', 'Detects names, emails, numbers and records being forwarded to third-party models without redaction — the leak nobody logs.', "Détecte les noms, courriels, numéros et dossiers transmis à des modèles tiers sans masquage — la fuite que personne ne journalise."],
        ['Secrets in the open', 'Secrets à découvert', 'API keys in environment variables, notebooks, automation steps and prompt templates, flagged with where to move them.', "Clés d'API dans les variables d'environnement, carnets, étapes d'automatisation et gabarits d'invites, signalées avec l'endroit où les déplacer."],
        ['Retrieval over-reach', 'Récupération trop large', 'RAG pipelines that return whole documents when a field would do — the quiet cause of most accidental disclosure.', "Les pipelines RAG qui renvoient des documents entiers alors qu'un champ suffirait — la cause discrète de la plupart des divulgations accidentelles."],
        ['A diagnostic you can act on', 'Un diagnostic actionnable', 'Findings ranked by severity, each with the component at fault and a suggested fix. No 200-page report nobody reads.', "Des constats classés par sévérité, chacun avec le composant fautif et un correctif suggéré. Pas de rapport de 200 pages que personne ne lit."],
        ['Runs on your side', 'Tourne de votre côté', 'Sentinel inspects your stack without becoming another place your data lives.', "Sentinel inspecte votre pile sans devenir un endroit de plus où vivent vos données."],
      ],
      lab: LAB_SENTINEL, labId: 'sentinel',
      faq: [
        ['What exactly does it scan?', 'Que scanne-t-il exactement ?',
         'Workflow and automation platforms, connectors and their scopes, retrieval pipelines and vector stores, code and notebooks, prompt templates, and the app-building platforms teams now ship from.',
         "Les plateformes de flux et d'automatisation, les connecteurs et leurs portées, les pipelines de récupération et magasins de vecteurs, le code et les carnets, les gabarits d'invites, et les plateformes de création d'applications depuis lesquelles les équipes livrent aujourd'hui."],
        ['Do you need access to our data?', 'Avez-vous besoin d\'accéder à nos données ?',
         'Sentinel inspects configuration, scopes and flows — not the content of your records. The point is to reduce the number of places your data sits, not add one.',
         "Sentinel inspecte la configuration, les portées et les flux — pas le contenu de vos dossiers. L'objectif est de réduire le nombre d'endroits où vivent vos données, pas d'en ajouter un."],
        ['Is this a compliance certification?', 'Est-ce une certification de conformité ?',
         'No. It is a technical diagnostic that makes a compliance conversation possible, with evidence your auditor can read.',
         "Non. C'est un diagnostic technique qui rend possible une conversation de conformité, avec des preuves que votre auditeur peut lire."],
      ],
      note: '', noteFr: '',
    }) },

  { file: 'services.html', title: 'Services — AI integration consulting | ProGain.ai',
    desc: 'Opportunity assessment, AI receptionists, knowledge assistants (RAG), HR tools, training and integration. From Montréal, in English and French, for clients worldwide.',
    body: SERVICES_PAGE },

  { file: 'about.html', title: 'About — Two founders, one standard | ProGain.ai',
    desc: 'A father and son AI boutique in Montréal. MIT, UT Austin, Université de Montréal and Université de Sherbrooke. Bilingual by design, worldwide by choice.',
    body: ABOUT_PAGE },

  { file: 'contact.html', title: 'Contact — Tell us what slows you down | ProGain.ai',
    desc: 'A short form, a real reply within one business day. From Montréal, in English and in French, for clients anywhere in the world.',
    body: CONTACT_PAGE },

  { file: 'legal.html', title: 'Legal notices | ProGain.ai',
    desc: 'Legal notices for ProGain.ai, ProGain Coach, ProGain Markets and ProGain Sentinel.',
    body: LEGAL_PAGE },

  { file: '404.html', title: 'Page not found | ProGain.ai',
    desc: 'This page never shipped. Here are the places that do exist.',
    body: NF_PAGE },
];
