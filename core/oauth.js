'use strict';
/* global URLSearchParams */
// ── Novalis — Branchement OAuth (le commerçant remet SES clés) ──────
// Le commerçant clique « Connecter Gmail / QuickBooks », autorise sur l'écran
// DU fournisseur (Google/Intuit), et Novalis reçoit un jeton — rangé chiffré
// dans le coffre, sous le compte du commerçant. Jamais les comptes de personne
// d'autre. Les identifiants d'application (client_id/secret) sont en variables
// d'environnement (jamais dans le code) ; sans eux, le branchement est « à
// activer » plutôt que cassé.

const crypto = require('crypto');

const PROVIDERS = {
  google: {
    titre: 'Gmail (Google)',
    cxType: 'courriel',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    idEnv: 'GOOGLE_OAUTH_CLIENT_ID', secretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    basic: false,
  },
  quickbooks: {
    titre: 'QuickBooks',
    cxType: 'facturation',
    authUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scope: 'com.intuit.quickbooks.accounting',
    extra: {},
    idEnv: 'QUICKBOOKS_CLIENT_ID', secretEnv: 'QUICKBOOKS_CLIENT_SECRET',
    basic: true, // Intuit veut l'auth Basic client_id:secret à l'échange
  },
};

function creds(provider) {
  const P = PROVIDERS[provider];
  if (!P) return null;
  const id = process.env[P.idEnv];
  const secret = process.env[P.secretEnv];
  return (id && secret) ? { id, secret } : null;
}
function configure(provider) { return !!creds(provider); }

function signState(payload, key) {
  const s = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', String(key || 'sel')).update(s).digest('base64url');
  return s + '.' + sig;
}
function verifyState(state, key) {
  if (typeof state !== 'string') return null;
  const i = state.lastIndexOf('.');
  if (i <= 0) return null;
  const s = state.slice(0, i), sig = state.slice(i + 1);
  const exp = crypto.createHmac('sha256', String(key || 'sel')).update(s).digest('base64url');
  let ok;
  try { ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp)); } catch { return null; }
  if (!ok) return null;
  let p;
  try { p = JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { return null; }
  if (!p || typeof p.t !== 'number' || Date.now() - p.t > 600000) return null; // 10 min
  return p;
}

function authUrl(provider, { redirectUri, state }) {
  const P = PROVIDERS[provider], c = creds(provider);
  if (!P || !c) return null;
  const params = new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri, response_type: 'code',
    scope: P.scope, state, ...P.extra,
  });
  return P.authUrl + '?' + params.toString();
}

/** Échange le code d'autorisation contre des jetons. Lève si échec. */
async function exchangeCode(provider, { code, redirectUri }) {
  const P = PROVIDERS[provider], c = creds(provider);
  if (!P || !c) throw new Error('fournisseur non configuré');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (P.basic) headers.Authorization = 'Basic ' + Buffer.from(c.id + ':' + c.secret).toString('base64');
  else { body.set('client_id', c.id); body.set('client_secret', c.secret); }
  const r = await fetch(P.tokenUrl, { method: 'POST', headers, body });
  if (!r.ok) throw new Error('échange de jeton ' + r.status);
  return r.json();
}

module.exports = { PROVIDERS, creds, configure, signState, verifyState, authUrl, exchangeCode };
