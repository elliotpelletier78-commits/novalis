'use strict';
// ── Novalis — Confiance & sécurité (page publique) ──────────────────
// Un atout de crédibilité, pas du marketing gonflé. On n'affirme QUE ce qui est
// vrai : modèle d'approbation, rien d'inventé, coffre chiffré, Loi 25, avis
// honnêtes (conforme à la règle FTC 2024). Aucune certification non détenue.

const { UI_CSS } = require('./ui');

const CSS = `
.cw{max-width:720px;margin:0 auto;padding:clamp(28px,5vw,60px)}
.cbar{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cbar .mk{width:32px;height:32px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.cbar .mk svg{width:18px;height:18px;stroke:var(--brand-ink);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.cbar .wm{font-family:var(--disp);font-size:20px;font-weight:600}
.ch1{font-family:var(--disp);font-size:clamp(28px,4.5vw,40px);font-weight:600;letter-spacing:-.01em;line-height:1.1;margin:0 0 12px;text-wrap:balance}
.clead{font-size:17px;color:var(--ink-2);margin:0 0 6px;max-width:52ch}
.csec{border-top:2px solid var(--ink);margin-top:34px;padding-top:8px}
.csec h2{font-family:var(--disp);font-size:19px;font-weight:600;margin:0 0 8px}
.csec p{font-size:14.5px;color:var(--ink-2);margin:0 0 10px;line-height:1.6}
.csec p:last-child{margin-bottom:0}
.csec b{color:var(--ink);font-weight:640}
.cfoot{margin-top:40px;border-top:1px solid var(--line);padding-top:18px;font-size:13px;color:var(--muted)}
.cfoot a{color:var(--brand-600);font-weight:600;text-decoration:none}
`;

function renderConfiance() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confiance & sécurité — Novalis</title>
<meta name="description" content="Comment Novalis protège votre commerce et vos clients : rien n'est envoyé sans votre approbation, rien n'est inventé, vos accès sont chiffrés, et vos données sont traitées dans le respect de la Loi 25.">
<style>${UI_CSS}${CSS}</style></head>
<body><div class="cw">
  <div class="cbar"><span class="mk"><svg viewBox="0 0 24 24"><path d="M6 18V6l12 12V6"/></svg></span><span class="wm">Novalis</span></div>
  <h1 class="ch1">La confiance, par construction.</h1>
  <p class="clead">Vous remettez les clés de votre commerce à Novalis. Voici, sans détour, comment on protège votre nom et vos clients.</p>

  <div class="csec">
    <h2>Rien ne part sans votre oui</h2>
    <p>Chaque réponse à un client, chaque soumission, chaque demande d'avis est <b>préparée puis déposée dans votre poste de commande</b>, jamais envoyée directement. Vous lisez, vous ajustez si besoin, vous approuvez. Vous restez la seule voix de votre commerce.</p>
  </div>

  <div class="csec">
    <h2>Rien d'inventé</h2>
    <p>Les soumissions sont montées <b>à partir de vos services et de vos prix</b> — jamais d'un montant deviné. Les réponses s'appuient sur vos vraies informations. Nous ne fabriquons aucun chiffre, aucun avis, et jamais un « envoyé » qui ne l'est pas.</p>
  </div>

  <div class="csec">
    <h2>Des avis honnêtes</h2>
    <p>Nous demandons l'avis à <b>tous vos clients</b>, sans jamais filtrer les mécontents vers un formulaire privé. Cette pratique — le « review-gating » — est <b>interdite par la FTC</b> depuis 2024. Votre réputation se bâtit sur de vrais avis, ce qui la rend solide.</p>
  </div>

  <div class="csec">
    <h2>Vos accès, chiffrés</h2>
    <p>Les identifiants que vous branchez (courriel et autres) sont conservés dans un <b>coffre chiffré</b>. Ils ne sont jamais réaffichés ni renvoyés en clair. Novalis n'agit qu'avec votre autorisation explicite, donnée à l'étape du branchement.</p>
  </div>

  <div class="csec">
    <h2>Vos données, conformes à la Loi 25</h2>
    <p>Vos renseignements et ceux de vos clients sont traités dans le <b>respect de la Loi 25</b> du Québec. Nous ne rédigeons en votre nom qu'après votre consentement, et vous pouvez <b>demander le retrait de vos données à tout moment</b>. Vous restez propriétaire de ce qui vous appartient.</p>
  </div>

  <div class="cfoot">
    Une question sur vos données ou notre sécurité ? <a href="/#contact">Écrivez-nous</a> — on répond franchement.
    <br>Voir aussi : <a href="/politique-confidentialite">Politique de confidentialité</a> · <a href="/conditions-utilisation">Conditions</a> · <a href="/">Accueil</a>
  </div>
</div></body></html>`;
}

module.exports = { renderConfiance };
