'use strict';
// ── Alertes opérationnelles ──────────────────────────────────────────
// Décision : un simple webhook sortant, vendor-neutre. ALERT_WEBHOOK_URL
// accepte un webhook Discord (gratuit, 2 min à créer) ou Slack — on
// envoie les deux champs (content/text) pour couvrir les deux formats.
// Fire-and-forget : une alerte qui échoue ne doit JAMAIS faire échouer
// le worker — l'échec d'alerte est loggé, point.

/** @param {NodeJS.ProcessEnv} env */
function createAlerter(env = process.env) {
  const url = env.ALERT_WEBHOOK_URL;

  /**
   * @param {string} titre court, ex: "Job mort"
   * @param {string} detail contexte actionnable
   */
  async function alert(titre, detail) {
    const message = `🔴 [Novalis] ${titre}\n${detail}`;
    console.error('[alerte]', titre, '—', detail);
    if (!url) return { sent: false, reason: 'ALERT_WEBHOOK_URL non configurée' };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: message, text: message }),
      });
      return { sent: res.ok, status: res.status };
    } catch (e) {
      console.error('[alerte] envoi webhook échoué:', e.message);
      return { sent: false, reason: e.message };
    }
  }

  return { alert, configured: Boolean(url) };
}

module.exports = { createAlerter };
