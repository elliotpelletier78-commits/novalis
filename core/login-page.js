'use strict';
// ── Novalis — Connexion (session par cookie) ────────────────────────
// Écran sobre « document ». Le mot de passe part en POST (form natif), le
// serveur pose un cookie de session signé. Plus de mot de passe dans l'URL.

const { UI_CSS, esc } = require('./ui');

const CSS = `
body{min-height:100vh;display:grid;place-items:center;padding:24px}
.card{width:100%;max-width:380px}
.bar{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:26px}
.bar .mk{width:34px;height:34px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.bar .mk svg{width:19px;height:19px;stroke:var(--brand-ink);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.bar .wm{font-family:var(--disp);font-size:21px;font-weight:600}
h1{font-family:var(--disp);font-size:24px;font-weight:600;letter-spacing:-.01em;text-align:center;margin:0 0 4px}
.sub{text-align:center;color:var(--muted);font-size:13.5px;margin:0 0 22px}
label{display:block;font-size:12px;font-weight:640;letter-spacing:.02em;text-transform:uppercase;color:var(--muted);margin:0 0 7px}
input[type=password]{width:100%;font-family:var(--sans);font-size:15px;color:var(--ink);background:var(--card);border:1px solid var(--line-strong);border-radius:9px;padding:12px 13px}
input[type=password]:focus{outline:2px solid var(--brand);outline-offset:1px}
.err{margin:12px 0 0;font-size:13px;color:var(--risk)}
button{width:100%;margin-top:16px;font-family:var(--sans);font-size:15px;font-weight:640;padding:12px;border-radius:9px;border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink);cursor:pointer}
button:hover{filter:brightness(1.08)}
.foot{text-align:center;margin-top:22px;font-size:12px;color:var(--faint)}
`;

function renderLogin(o = {}) {
  const err = o.erreur === '2' ? 'Trop de tentatives. Patientez un moment avant de réessayer.'
    : o.erreur ? 'Mot de passe incorrect.' : '';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Connexion — Novalis</title><style>${UI_CSS}${CSS}</style></head>
<body><div class="card">
  <div class="bar"><span class="mk"><svg viewBox="0 0 24 24"><path d="M6 18V6l12 12V6"/></svg></span><span class="wm">Novalis</span></div>
  <h1>Espace d'exploitation</h1>
  <p class="sub">Connectez-vous pour opérer vos commerces.</p>
  <form method="post" action="/login" autocomplete="off">
    <input type="hidden" name="next" value="${esc(o.next || '')}">
    <label for="pw">Mot de passe</label>
    <input type="password" id="pw" name="password" autofocus autocomplete="current-password" aria-label="Mot de passe">
    ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
    <button type="submit">Se connecter</button>
  </form>
  <div class="foot">Accès réservé à l'exploitation Novalis.</div>
</div></body></html>`;
}

module.exports = { renderLogin };
