'use strict';
// ── Alertes opérationnelles ──────────────────────────────────────────
// Deux canaux, cumulables, aucun obligatoire :
//   • WEBHOOK  — ALERT_WEBHOOK_URL : Discord (gratuit, 2 min, notif sur le
//     téléphone via l'app) ou Slack. On envoie content ET text pour couvrir
//     les deux formats.
//   • COURRIEL — pour « je le sais en 30 secondes » sans dépendre de Discord.
//     Envoi via l'API HTTP de Resend (aucune dépendance npm, juste un fetch) :
//     RESEND_API_KEY + ALERT_EMAIL_TO (+ ALERT_EMAIL_FROM optionnel). Resend a
//     un palier gratuit ; l'API est un simple POST JSON.
// Fire-and-forget : une alerte qui échoue ne fait JAMAIS échouer l'appelant —
// l'échec est loggé, point. Les deux canaux sont tentés indépendamment.

/** @param {NodeJS.ProcessEnv} env */
function createAlerter(env = process.env) {
  const url = env.ALERT_WEBHOOK_URL;
  const resendKey = env.RESEND_API_KEY;
  const emailTo = env.ALERT_EMAIL_TO;
  const emailFrom = env.ALERT_EMAIL_FROM || 'Novalis <alertes@novalisia.ca>';

  async function envoyerWebhook(message) {
    if (!url) return { sent: false, reason: 'ALERT_WEBHOOK_URL non configurée' };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: message, text: message }),
      });
      return { sent: res.ok, status: res.status };
    } catch (e) {
      console.error('[alerte] webhook échoué:', e.message);
      return { sent: false, reason: e.message };
    }
  }

  async function envoyerCourriel(titre, detail) {
    if (!resendKey || !emailTo) return { sent: false, reason: 'courriel non configuré (RESEND_API_KEY + ALERT_EMAIL_TO)' };
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: emailFrom,
          to: String(emailTo).split(',').map(s => s.trim()).filter(Boolean),
          subject: `Novalis — ${titre}`,
          text: detail,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('[alerte] courriel refusé:', res.status, t.slice(0, 200));
      }
      return { sent: res.ok, status: res.status };
    } catch (e) {
      console.error('[alerte] courriel échoué:', e.message);
      return { sent: false, reason: e.message };
    }
  }

  /**
   * @param {string} titre court, ex: "Nouveau message — garage-x"
   * @param {string} detail contexte actionnable
   */
  async function alert(titre, detail) {
    const message = `🔔 [Novalis] ${titre}\n${detail}`;
    console.error('[alerte]', titre, '—', detail);
    // Les deux canaux en parallèle ; ni l'un ni l'autre ne bloque.
    const [w, e] = await Promise.all([envoyerWebhook(message), envoyerCourriel(titre, detail)]);
    return { webhook: w, courriel: e, sent: w.sent || e.sent };
  }

  return {
    alert,
    configured: Boolean(url) || Boolean(resendKey && emailTo),
    canaux: { webhook: Boolean(url), courriel: Boolean(resendKey && emailTo) },
  };
}

/**
 * Petit expéditeur de courriels réutilisable (Resend HTTP API), pour envoyer
 * à un destinataire ARBITRAIRE — ex. la réponse approuvée à un client. Distinct
 * de l'alerter (qui n'écrit qu'à l'opérateur). Fail-safe : sans clé configurée,
 * `configured` est faux et `envoyer` retourne { sent:false } sans lever — le
 * code appelant traite ça comme « à envoyer à la main », jamais comme un envoi.
 * @param {NodeJS.ProcessEnv} env
 */
function createMailer(env = process.env) {
  const resendKey = env.RESEND_API_KEY;
  const defautFrom = env.MAIL_FROM || 'Novalis <reponse@novalisia.ca>';
  async function envoyer({ to, subject, text, from, replyTo } = {}) {
    if (!resendKey) return { sent: false, reason: 'courriel non configuré (RESEND_API_KEY absente)' };
    if (!to || !subject || !text) return { sent: false, reason: 'to, subject et text requis' };
    try {
      const body = {
        from: from || defautFrom,
        to: String(to).split(',').map(s => s.trim()).filter(Boolean),
        subject: String(subject).slice(0, 200),
        text: String(text),
      };
      if (replyTo) body.reply_to = replyTo;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { sent: false, status: res.status, reason: t.slice(0, 200) };
      }
      return { sent: true, status: res.status };
    } catch (e) {
      return { sent: false, reason: e.message };
    }
  }
  return { envoyer, configured: Boolean(resendKey) };
}

module.exports = { createAlerter, createMailer };
