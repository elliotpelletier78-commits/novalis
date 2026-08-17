'use strict';
// ── Novalis — Câblage des comptes branchés (usage des jetons OAuth) ──
// Utilise les jetons rangés chiffrés dans le coffre pour AGIR au nom du
// commerçant : envoyer un courriel via SON Gmail, lire/vérifier la connexion,
// et créer une facture dans SON QuickBooks. Le rafraîchissement des jetons est
// automatique. Rien ne s'exécute sans un compte réellement connecté.
//
// Testabilité honnête : ce code ne peut être vérifié en vrai qu'une fois un
// compte connecté (donc une app OAuth enregistrée). Un « test de connexion »
// intégré (profilGmail / infoQuickBooks) permet de le confirmer en un clic.

const oauth = require('./oauth');

const QBO_BASE = (process.env.QUICKBOOKS_ENV === 'sandbox')
  ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';

function lireJeton(vault, clientId, provider) {
  try { const s = vault.get(clientId, 'oauth:' + provider); return s ? JSON.parse(s) : null; } catch { return null; }
}
function connecte(vault, clientId, provider) { return !!lireJeton(vault, clientId, provider); }

/** Access token valide (rafraîchi si expiré et persisté). null si non connecté. */
async function accessFrais(vault, clientId, provider) {
  let tok = lireJeton(vault, clientId, provider);
  if (!tok || !tok.access_token) return null;
  const exp = (tok.obtenu_le || 0) + (tok.expires_in || 3600) * 1000;
  if (Date.now() < exp - 60000) return tok.access_token; // encore valide (marge 60 s)
  if (!tok.refresh_token) return tok.access_token;        // pas de refresh : on tente tel quel
  try {
    const neuf = await oauth.rafraichir(provider, tok.refresh_token);
    tok = { ...tok, ...neuf, refresh_token: neuf.refresh_token || tok.refresh_token, obtenu_le: Date.now() };
    vault.set(clientId, 'oauth:' + provider, JSON.stringify(tok));
    return tok.access_token;
  } catch { return tok.access_token; }
}

// ── Gmail ───────────────────────────────────────────────────────────
function encodeSujet(s) { return '=?UTF-8?B?' + Buffer.from(String(s || ''), 'utf8').toString('base64') + '?='; }
async function envoyerGmail(vault, clientId, { to, subject, text, from } = {}) {
  const at = await accessFrais(vault, clientId, 'google');
  if (!at) return { sent: false, reason: 'Gmail non connecté' };
  const mime = [
    from ? `From: ${from}` : null,
    `To: ${to}`,
    `Subject: ${encodeSujet(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(text || ''),
  ].filter((x) => x !== null).join('\r\n');
  const raw = Buffer.from(mime, 'utf8').toString('base64url');
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); return { sent: false, reason: 'Gmail ' + r.status + ' ' + t.slice(0, 140) }; }
    const j = await r.json().catch(() => ({}));
    return { sent: true, id: j.id };
  } catch (e) { return { sent: false, reason: 'Gmail: ' + e.message }; }
}
async function profilGmail(vault, clientId) {
  const at = await accessFrais(vault, clientId, 'google');
  if (!at) throw new Error('Gmail non connecté');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: 'Bearer ' + at } });
  if (!r.ok) throw new Error('Gmail ' + r.status);
  return r.json(); // { emailAddress, messagesTotal, ... }
}

// ── QuickBooks Online ───────────────────────────────────────────────
function realmDe(vault, clientId) { const t = lireJeton(vault, clientId, 'quickbooks'); return t ? t.realmId : null; }
async function qbo(vault, clientId, chemin, opts = {}) {
  const at = await accessFrais(vault, clientId, 'quickbooks');
  const realm = realmDe(vault, clientId);
  if (!at || !realm) throw new Error('QuickBooks non connecté');
  const r = await fetch(`${QBO_BASE}/v3/company/${realm}${chemin}`, {
    method: opts.method || 'GET',
    headers: { Authorization: 'Bearer ' + at, Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('QBO ' + r.status + ' ' + t.slice(0, 180)); }
  return r.json();
}
async function infoQuickBooks(vault, clientId) {
  const realm = realmDe(vault, clientId);
  const j = await qbo(vault, clientId, `/companyinfo/${realm}?minorversion=70`);
  return j.CompanyInfo || j;
}
async function qboQuery(vault, clientId, sql) {
  const j = await qbo(vault, clientId, `/query?query=${encodeURIComponent(sql)}&minorversion=70`);
  return j.QueryResponse || {};
}
async function assurerCompteRevenu(vault, clientId) {
  const q = await qboQuery(vault, clientId, "select Id from Account where AccountType = 'Income' maxresults 1");
  if (q.Account && q.Account[0]) return q.Account[0].Id;
  const cr = await qbo(vault, clientId, '/account?minorversion=70', { body: { Name: 'Ventes', AccountType: 'Income' } });
  return cr.Account && cr.Account.Id;
}
async function assurerItem(vault, clientId) {
  const q = await qboQuery(vault, clientId, "select Id from Item where Name = 'Services' maxresults 1");
  if (q.Item && q.Item[0]) return q.Item[0].Id;
  const compte = await assurerCompteRevenu(vault, clientId);
  const cr = await qbo(vault, clientId, '/item?minorversion=70', {
    body: { Name: 'Services', Type: 'Service', IncomeAccountRef: { value: compte } },
  });
  return cr.Item && cr.Item.Id;
}
async function assurerClient(vault, clientId, { nom, courriel }) {
  const nomEsc = String(nom || 'Client').replace(/'/g, "\\'").slice(0, 100);
  const q = await qboQuery(vault, clientId, `select Id from Customer where DisplayName = '${nomEsc}' maxresults 1`);
  if (q.Customer && q.Customer[0]) return q.Customer[0].Id;
  const body = { DisplayName: nomEsc };
  if (courriel) body.PrimaryEmailAddr = { Address: courriel };
  const cr = await qbo(vault, clientId, '/customer?minorversion=70', { body });
  return cr.Customer && cr.Customer.Id;
}
/** Crée une facture (brouillon) dans QuickBooks à partir de lignes réelles. */
async function creerFactureQuickBooks(vault, clientId, { client, courriel, lignes } = {}) {
  const itemId = await assurerItem(vault, clientId);
  const custId = await assurerClient(vault, clientId, { nom: client, courriel });
  const Line = (Array.isArray(lignes) ? lignes : []).filter((l) => l && l.prix_cents != null).map((l) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: Math.round((l.prix_cents * (l.quantite || 1)) / 100 * 100) / 100,
    Description: String(l.nom || '').slice(0, 200),
    SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: l.quantite || 1, UnitPrice: Math.round(l.prix_cents / 100 * 100) / 100 },
  }));
  if (!Line.length) throw new Error('aucune ligne facturable');
  const inv = await qbo(vault, clientId, '/invoice?minorversion=70', {
    body: { CustomerRef: { value: custId }, Line, ...(courriel ? { BillEmail: { Address: courriel } } : {}) },
  });
  return inv.Invoice || inv;
}

module.exports = { connecte, accessFrais, envoyerGmail, profilGmail, infoQuickBooks, creerFactureQuickBooks };
