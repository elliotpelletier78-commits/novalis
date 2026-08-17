'use strict';
// ── Novalis — Aujourd'hui (relevé du jour) ──────────────────────────
// Registre « document / cabinet » : pas d'accueil, pas de tuiles de vanité, pas
// de soupe de cartes. Un bandeau de mesures réglé au filet, puis le travail en
// listes réglées (titres en Times). Le logiciel dit quoi faire, il ne se donne
// pas en spectacle.

const { esc, page } = require('./ui');
const { TYPE_LABEL } = require('./propositions');

const EXTRA = `
.led{display:flex;flex-wrap:wrap;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line);margin:2px 0 6px}
.led .it{padding:14px 24px 13px 0;margin-right:24px;border-right:1px solid var(--line-2)}
.led .it:last-child{border-right:none;margin-right:0}
.led .k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.led .v{font-variant-numeric:tabular-nums;font-size:26px;font-weight:600;letter-spacing:-.01em;margin-top:5px;line-height:1;color:var(--ink)}
.led .v a{color:inherit;text-decoration:none}
.led .v a:hover{color:var(--brand-600)}
.dadv{display:flex;align-items:baseline;gap:10px;padding:13px 0;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.dadv b{color:var(--ink);font-weight:640}
.dadv .lnk{margin-left:auto;color:var(--brand-600);font-weight:600;text-decoration:none;white-space:nowrap}
.deyebrow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:30px 0 0;border-bottom:2px solid var(--ink);padding-bottom:8px}
.deyebrow a{font-size:12.5px;letter-spacing:0;text-transform:none;color:var(--brand-600);font-weight:600;text-decoration:none}
.drow{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.drow:hover{background:var(--card)}
.drow .t{font-family:var(--disp);font-size:16.5px;font-weight:600;letter-spacing:-.005em}
.drow .s{font-size:13px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56ch}
.drow .meta{text-align:right;white-space:nowrap}
.drow .st{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;color:var(--warn)}
.drow .st.risk{color:var(--risk)}
.drow .wh{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums;margin-top:3px}
.dempty{padding:14px 0;border-bottom:1px solid var(--line);color:var(--muted);font-size:14px}
.dnote{margin-top:24px;font-size:12.5px;color:var(--faint);font-style:italic}
`;

function renderAujourdhui(d) {
  const nom = d.nom || d.source;
  const s = d.signaux;
  const href = (base) => `${base}?source=${encodeURIComponent(d.source)}${d.pass ? '&pass=' + encodeURIComponent(d.pass) : ''}`;

  const led = `<div class="led">
    <div class="it"><div class="k">À approuver</div><div class="v"><a href="${href('/core/propositions')}">${s.a_approuver}</a></div></div>
    <div class="it"><div class="k">Contacts · 30 j</div><div class="v"><a href="${href('/core/reception')}">${s.contacts}</a></div></div>
    <div class="it"><div class="k">Sans réponse</div><div class="v">${s.en_attente}</div></div>
    <div class="it"><div class="k">Prêt à opérer</div><div class="v">${d.pret_pct}%</div></div>
  </div>`;

  const advis = d.pret_pct < 100
    ? `<div class="dadv"><b>Branchement à ${d.pret_pct} %.</b> Complétez-le pour activer tous les automatismes.<a class="lnk" href="${href('/core/branchement')}">Compléter →</a></div>`
    : '';

  const props = d.propositions.length
    ? d.propositions.map((p) => `<a class="drow" href="${href('/core/propositions')}">
        <div><div class="t">${esc(p.titre)}</div>${p.apercu ? `<div class="s">« ${esc(p.apercu)} »</div>` : ''}</div>
        <div class="meta"><div class="st">À approuver</div><div class="wh">${esc(TYPE_LABEL[p.type] || 'Proposition')}</div></div>
      </a>`).join('')
    : '<div class="dempty">Rien à approuver — vous êtes à jour.</div>';

  const attente = d.leads_attente.length
    ? d.leads_attente.map((l) => `<div class="drow" style="cursor:default">
        <div><div class="t">${esc(l.nom)}</div><div class="s">${esc(l.apercu)}</div></div>
        <div class="meta"><div class="st risk">Sans réponse</div><div class="wh">${esc(l.ilya)}</div></div>
      </div>`).join('')
    : '<div class="dempty">Tous les contacts ont eu une réponse.</div>';

  const content = `${led}${advis}
    <div class="deyebrow">À approuver aujourd'hui<a href="${href('/core/propositions')}">Tout ouvrir →</a></div>
    ${props}
    <div class="deyebrow">En attente de réponse<a href="${href('/core/reception')}">Réception →</a></div>
    ${attente}
    <div class="dnote">Novalis a préparé ce qui précède. Rien n'est envoyé sans votre approbation.</div>`;

  return page({
    title: nom,
    subtitle: d.dateLabel || '',
    active: 'aujourdhui',
    source: d.source, sources: d.sources, pass: d.pass, alertes: d.alertes,
    extraCss: EXTRA,
    contentHtml: content,
  });
}

module.exports = { renderAujourdhui, esc };
