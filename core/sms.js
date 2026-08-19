'use strict';
/* global URLSearchParams */
// ── Novalis — Canal SMS (Twilio) ───────────────────────────────────
// Le canal que toutes les plateformes de PME utilisent (Podium, Thryv,
// Birdeye). Envoi via l'API Twilio (un simple fetch, aucune dépendance npm) et
// VALIDATION de la signature des webhooks entrants (anti-usurpation). Sans clés
// (env), le canal est « à activer » — jamais cassé, jamais de faux envoi.
//
// Clés d'environnement : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// (le numéro Twilio du commerce). Rien dans le code, rien de journalisé.

const crypto = require('crypto');

// Détection / normalisation de numéros nord-américains vers E.164 (+1XXXXXXXXXX).
function estTelephone(s) {
  const d = String(s || '').replace(/[^\d+]/g, '');
  const n = d.replace(/\D/g, '');
  return /^\+?1?\d{10}$/.test(d) || n.length === 10 || n.length === 11;
}
function normaliserTel(s) {
  let n = String(s || '').replace(/\D/g, '');
  if (n.length === 10) n = '1' + n;
  if (n.length === 11 && n[0] === '1') return '+' + n;
  const brut = String(s || '').trim();
  return brut.startsWith('+') ? brut : null; // déjà E.164 international, ou inconnu
}

function createSms(env = process.env) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM;
  const configured = Boolean(sid && token && from);

  async function envoyer({ to, text } = {}) {
    if (!configured) return { sent: false, reason: 'SMS non configuré (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM)' };
    const dest = normaliserTel(to);
    if (!dest) return { sent: false, reason: 'numéro invalide' };
    try {
      const body = new URLSearchParams({ To: dest, From: from, Body: String(text || '').slice(0, 1500) });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!r.ok) { const t = await r.text().catch(() => ''); return { sent: false, reason: 'Twilio ' + r.status + ' ' + t.slice(0, 140) }; }
      const j = await r.json().catch(() => ({}));
      return { sent: true, id: j.sid };
    } catch (e) { return { sent: false, reason: 'Twilio: ' + e.message }; }
  }

  return { configured, envoyer, from };
}

/**
 * Valide la signature d'un webhook Twilio (X-Twilio-Signature). Algorithme
 * officiel : HMAC-SHA1(authToken, URL + concat(clé+valeur triés)) en base64.
 * Déterministe → testable hors ligne. Sans token, on refuse (aucune confiance).
 */
function validerSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  let data = String(url || '');
  for (const k of Object.keys(params || {}).sort()) data += k + String(params[k]);
  const attendu = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(attendu), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createSms, estTelephone, normaliserTel, validerSignature };
