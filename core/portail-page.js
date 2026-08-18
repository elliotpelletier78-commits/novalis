'use strict';
// ── Novalis — Portail client « Mon compte » (page client) ──────────
// Le client ouvre un lien signé et voit CE QUI LE CONCERNE : ses rendez-vous à
// venir, ses soumissions, son historique — chez ce commerce. Lecture seule,
// sauf les actions déjà offertes ailleurs (confirmer un RDV, accepter un devis)
// vers lesquelles on pointe. JAMAIS de champ interne (notes, étape). Ce que
// beaucoup de plateformes (Jobber, Housecall) offrent : un « chez-soi » client.

const { UI_CSS, esc } = require('./ui');

const CSS = `
.pw{max-width:640px;margin:0 auto;padding:clamp(22px,5vw,48px)}
.pbar{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.pbar .mk{width:30px;height:30px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.pbar .mk svg{width:17px;height:17px;stroke:var(--brand-ink);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.pbar .wm{font-family:var(--disp);font-size:18px;font-weight:600}
h1{font-family:var(--disp);font-size:clamp(24px,4vw,30px);font-weight:600;letter-spacing:-.01em;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin-bottom:22px}
.sec{font-size:12px;font-weight:720;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);margin:24px 2px 10px}
.item{background:var(--card);border:1px solid var(--line-strong);border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.item .t{font-family:var(--disp);font-size:16px;font-weight:600}
.item .s{font-size:13px;color:var(--muted);margin-top:2px}
.item a.go{font-size:13px;font-weight:640;color:var(--brand-ink);background:var(--brand);padding:8px 14px;border-radius:8px;text-decoration:none;white-space:nowrap}
.item a.go:hover{filter:brightness(1.08)}
.tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
.tag.ok{background:var(--ok-soft);color:var(--ok)} .tag.att{background:var(--brand-soft);color:var(--brand-600)}
.empty{color:var(--muted);font-size:14px;padding:6px 2px 2px}
.hist{font-size:13.5px;color:var(--ink-2);line-height:1.9}
.foot{margin-top:30px;font-size:12px;color:var(--faint);text-align:center}
.foot a{color:var(--muted);text-decoration:none}
`;

function jourLisible(debut) {
  const t = Date.parse(String(debut).replace(' ', 'T'));
  if (!Number.isFinite(t)) return String(debut || '');
  return new Date(t).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })
    + ' à ' + new Date(t).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', 'h');
}

function renderPortail(d) {
  const nom = d.commerce || d.source;
  const c = d.client;

  const rdv = c.aVenir.length ? c.aVenir.map((r) => {
    const conf = r.client_reponse === 'confirme';
    return `<div class="item"><div><div class="t">${r.service ? esc(r.service) : 'Rendez-vous'}</div>
      <div class="s">${esc(jourLisible(r.debut))}</div></div>
      ${conf ? '<span class="tag ok">confirmé ✓</span>' : (r.lienConfirmer ? `<a class="go" href="${esc(r.lienConfirmer)}">Confirmer</a>` : '')}</div>`;
  }).join('') : '<div class="empty">Aucun rendez-vous à venir.</div>';

  const devis = c.devis.length ? c.devis.map((p) => {
    const clos = p.statut === 'envoye' || p.statut === 'approuve';
    return `<div class="item"><div><div class="t">${esc(p.titre || 'Soumission')}</div>
      ${p.apercu ? `<div class="s">${esc(p.apercu)}</div>` : ''}</div>
      ${clos ? '<span class="tag ok">reçue</span>' : (p.lienAccepter ? `<a class="go" href="${esc(p.lienAccepter)}">Voir &amp; accepter</a>` : '<span class="tag att">en préparation</span>')}</div>`;
  }).join('') : '<div class="empty">Aucune soumission pour le moment.</div>';

  const histParts = [];
  if (c.passes.length) histParts.push(`${c.passes.length} ${c.passes.length === 1 ? 'visite passée' : 'visites passées'}`);
  if (c.messages) histParts.push(`${c.messages} ${c.messages === 1 ? 'échange' : 'échanges'}`);
  const hist = histParts.length ? `<div class="hist">${histParts.join(' · ')}.</div>` : '<div class="empty">Votre historique apparaîtra ici.</div>';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Mon compte — ${esc(nom)}</title><style>${UI_CSS}${CSS}</style></head>
<body><div class="pw">
  <div class="pbar"><span class="mk"><svg viewBox="0 0 24 24"><path d="M6 18V6l12 12V6"/></svg></span><span class="wm">${esc(nom)}</span></div>
  <h1>Bonjour ${esc(c.nom)}</h1>
  <div class="sub">Votre espace chez ${esc(nom)} — vos rendez-vous, vos soumissions et votre historique.</div>

  <div class="sec">Rendez-vous à venir</div>
  ${rdv}

  <div class="sec">Vos soumissions</div>
  ${devis}

  <div class="sec">Votre historique</div>
  ${hist}

  ${d.contact ? `<div class="sec">Une question&nbsp;?</div><div class="hist">Écrivez à <a href="mailto:${esc(d.contact)}">${esc(d.contact)}</a>.</div>` : ''}

  <div class="foot">Espace préparé par Novalis pour ${esc(nom)}. <a href="/confiance">Confiance &amp; confidentialité</a></div>
</div></body></html>`;
}

module.exports = { renderPortail };
