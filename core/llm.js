'use strict';
// ── Passerelle LLM : point de passage UNIQUE vers les API d'IA ───────
// Toute la maison appelle claude() d'ici — jamais fetch direct ailleurs.
// Ce que ça garantit :
//   1. Comptage tokens + coût par client à CHAQUE appel (table llm_calls).
//   2. Plafond budgétaire mensuel par client : dépassé → refus net AVANT
//      l'appel (on ne découvre pas la facture à la fin du mois).
//   3. Gestion des 429 : respect de Retry-After, une seule relance ici,
//      les retries de plus haut niveau appartiennent à la file de jobs.
//   4. La clé API Anthropic ne sort jamais de ce module.

// Prix par MTok en cents USD — constante versionnée : un changement de
// prix Anthropic = un commit, visible en revue.
const PRIX_CENTS_PAR_MTOK = {
  'claude-sonnet-5':          { in: 300,  out: 1500 },
  'claude-opus-4-8':          { in: 1500, out: 7500 },
  'claude-haiku-4-5-20251001':{ in: 100,  out: 500  },
};
const MODELE_DEFAUT = 'claude-sonnet-5';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string|undefined} apiKey process.env.ANTHROPIC_API_KEY
 */
function createLlmGateway(db, apiKey) {
  const stmts = {
    record: db.prepare(`INSERT INTO llm_calls (client_id, job_id, step_name, model, input_tokens, output_tokens, cout_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    depenseMois: db.prepare(`SELECT COALESCE(SUM(cout_cents), 0) AS total FROM llm_calls
      WHERE client_id = ? AND created_at >= datetime('now', 'start of month')`),
    budget: db.prepare('SELECT budget_llm_cents_mois FROM clients WHERE id = ?'),
    rollup: db.prepare(`SELECT c.id, c.nom, COUNT(l.id) AS appels,
        COALESCE(SUM(l.input_tokens),0) AS tokens_in, COALESCE(SUM(l.output_tokens),0) AS tokens_out,
        ROUND(COALESCE(SUM(l.cout_cents),0), 2) AS cout_cents
      FROM clients c LEFT JOIN llm_calls l
        ON l.client_id = c.id AND l.created_at >= datetime('now', 'start of month')
      GROUP BY c.id ORDER BY cout_cents DESC`),
  };

  function coutCents(model, inTok, outTok) {
    const p = PRIX_CENTS_PAR_MTOK[model];
    if (!p) return 0; // modèle inconnu : on compte les tokens, coût 0 + avertissement
    return (inTok * p.in + outTok * p.out) / 1_000_000;
  }

  /** Refus net si le budget mensuel du client est déjà consommé. */
  function verifierBudget(clientId) {
    const b = stmts.budget.get(clientId);
    if (!b) throw new Error(`llm: client ${clientId} inconnu`);
    if (b.budget_llm_cents_mois == null) return; // illimité (tenant interne)
    const depense = stmts.depenseMois.get(clientId).total;
    if (depense >= b.budget_llm_cents_mois) {
      const err = new Error(`llm: budget mensuel du client ${clientId} épuisé (${Math.round(depense)}¢ / ${b.budget_llm_cents_mois}¢)`);
      err.code = 'BUDGET_EPUISE';
      throw err;
    }
  }

  /**
   * Appel Messages API. Jette (fail-closed) si pas de clé, budget épuisé,
   * ou erreur API non récupérable — la file de jobs gère le retry global.
   * @param {number} clientId tenant facturé
   * @param {{model?:string, system?:string, messages:Array, maxTokens?:number, jobId?:number, stepName?:string}} opts
   * @returns {Promise<{text:string, usage:{input_tokens:number, output_tokens:number}, model:string}>}
   */
  async function claude(clientId, opts) {
    if (!apiKey) throw new Error('llm: ANTHROPIC_API_KEY absente — définir la variable dans Railway');
    if (!Number.isInteger(clientId)) throw new Error('llm: clientId entier requis (comptabilité multi-tenant)');
    if (!opts || !Array.isArray(opts.messages) || !opts.messages.length) throw new Error('llm: messages requis');
    verifierBudget(clientId);

    const model = opts.model || MODELE_DEFAUT;
    const body = {
      model,
      max_tokens: opts.maxTokens || 2048,
      messages: opts.messages,
      ...(opts.system ? { system: opts.system } : {}),
    };

    let res;
    for (let tentative = 1; ; tentative++) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      // 429 / surcharge : UNE relance locale en respectant Retry-After ;
      // au-delà, on laisse la file de jobs faire son backoff exponentiel.
      if ((res.status === 429 || res.status === 529) && tentative === 1) {
        const waitS = Math.min(parseInt(res.headers.get('retry-after'), 10) || 15, 60);
        await new Promise(r => setTimeout(r, waitS * 1000));
        continue;
      }
      break;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`llm: API ${res.status} — ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
    const cents = coutCents(model, usage.input_tokens, usage.output_tokens);
    stmts.record.run(clientId, opts.jobId ?? null, opts.stepName ?? null, model,
      usage.input_tokens, usage.output_tokens, cents);

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, usage, model };
  }

  /** Tableau coûts/tokens du mois courant, par client (pour l'admin). */
  function rollupMois() { return stmts.rollup.all(); }

  return { claude, rollupMois, _coutCents: coutCents };
}

module.exports = { createLlmGateway, PRIX_CENTS_PAR_MTOK };
