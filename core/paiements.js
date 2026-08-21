'use strict';
/* global URLSearchParams */
// ── Novalis — Canal Paiement (Stripe) ──────────────────────────────
// Le commerçant demande un paiement ; Novalis crée une page de paiement HÉBERGÉE
// PAR STRIPE (Checkout) et lui rend le lien à envoyer. Le client paie chez
// Stripe — Novalis ne voit jamais de numéro de carte (aucun fardeau PCI). Un
// webhook signé confirme le paiement. Sans clés (env), le canal est « à
// activer » — jamais cassé, jamais de faux paiement marqué.
//
// Clés d'environnement : STRIPE_SECRET_KEY (sk_...), STRIPE_WEBHOOK_SECRET (whsec_...).

const crypto = require('crypto');

function createStripe(env = process.env) {
  const secret = env.STRIPE_SECRET_KEY;
  const whsec = env.STRIPE_WEBHOOK_SECRET;
  const configured = Boolean(secret);

  /** Crée une session Checkout Stripe. Retourne { id, url } ou lève. */
  async function creerLien({ montant_cents, description, courriel, succesUrl, annuleUrl, devise } = {}) {
    if (!configured) return { ok: false, reason: 'Paiement non configuré (STRIPE_SECRET_KEY)' };
    const cents = Math.round(Number(montant_cents) || 0);
    if (!(cents >= 50)) return { ok: false, reason: 'montant minimum 0,50 $' };
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', (devise || 'cad').toLowerCase());
    form.set('line_items[0][price_data][unit_amount]', String(cents));
    form.set('line_items[0][price_data][product_data][name]', String(description || 'Paiement').slice(0, 250));
    if (courriel) form.set('customer_email', String(courriel).slice(0, 180));
    if (succesUrl) form.set('success_url', succesUrl);
    if (annuleUrl) form.set('cancel_url', annuleUrl);
    try {
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (!r.ok) { const t = await r.text().catch(() => ''); return { ok: false, reason: 'Stripe ' + r.status + ' ' + t.slice(0, 160) }; }
      const j = await r.json();
      return { ok: true, id: j.id, url: j.url };
    } catch (e) { return { ok: false, reason: 'Stripe: ' + e.message }; }
  }

  return { configured, creerLien, whsec };
}

/**
 * Valide la signature d'un webhook Stripe (en-tête Stripe-Signature). Format :
 * « t=timestamp,v1=hexsig ». signature = HMAC-SHA256(secret, `${t}.${rawBody}`).
 * Déterministe → testable hors ligne. Refuse hors tolérance (défaut 5 min).
 */
function validerSignature(secret, rawBody, entete, toleranceS = 300, maintenantS = null) {
  if (!secret || !entete) return false;
  const parts = {};
  for (const kv of String(entete).split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) { const k = kv.slice(0, i).trim(); (parts[k] = parts[k] || []).push(kv.slice(i + 1).trim()); }
  }
  const t = parts.t && parts.t[0];
  const sigs = parts.v1 || [];
  if (!t || !sigs.length) return false;
  const corps = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const attendu = crypto.createHmac('sha256', secret).update(t + '.' + corps).digest('hex');
  const a = Buffer.from(attendu);
  const ok = sigs.some((s) => { const b = Buffer.from(String(s)); return a.length === b.length && crypto.timingSafeEqual(a, b); });
  if (!ok) return false;
  const now = maintenantS != null ? maintenantS : Math.floor(Date.now() / 1000);
  return Math.abs(now - Number(t)) <= toleranceS;
}

module.exports = { createStripe, validerSignature };
