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
// prix Anthropic = un commit, visible en revue. Ces chiffres servent à la fois
// à la comptabilité présentée au client et au plafond budgétaire par client ;
// une valeur fausse fausse les deux (et l'argumentaire de coût d'un dossier
// de subvention). Vérifiés le 2026-08-12.
//   ⚠ Sonnet 5 est en tarif d'introduction (2 $/10 $ par MTok) jusqu'au
//     2026-08-31 ; passer à 300/1500 après cette date.
//   L'ancienne table facturait Opus 4.8 à 1500/7500 — trois fois trop cher
//     (le vrai tarif est 5 $/25 $ = 500/2500).
const PRIX_CENTS_PAR_MTOK = {
  'claude-sonnet-5':          { in: 200,  out: 1000 },  // intro jusqu'au 2026-08-31, puis 300/1500
  'claude-opus-4-8':          { in: 500,  out: 2500 },
  'claude-opus-5':            { in: 500,  out: 2500 },
  'claude-haiku-4-5-20251001':{ in: 100,  out: 500  },
  'claude-haiku-4-5':         { in: 100,  out: 500  },
};
const MODELE_DEFAUT = 'claude-sonnet-5';

// Si aucune donnée n'arrive pendant ce délai, on considère la connexion morte
// et on abandonne. En streaming, des fragments arrivent en continu (toutes les
// quelques centaines de ms), donc ce délai surveille l'INACTIVITÉ, pas la durée
// totale : une génération de 60k tokens qui prend 15 minutes légitimes n'est
// jamais coupée tant qu'elle produit du texte.
const INACTIVITE_MAX_MS = 90 * 1000;

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
    if (!p) {
      // Modèle inconnu : facturer 0 en silence est un piège — le plafond
      // budgétaire ne se déclenche jamais et la facture Anthropic réelle
      // grimpe sans qu'aucun compteur ne bouge. On facture au tarif du
      // modèle le plus cher connu (borne haute prudente) et on crie fort.
      const pMax = Object.values(PRIX_CENTS_PAR_MTOK).reduce((a, b) => (b.out > a.out ? b : a));
      console.warn(`[llm] modèle inconnu « ${model} » — facturé au tarif prudent le plus élevé. Ajouter son prix à PRIX_CENTS_PAR_MTOK.`);
      return (inTok * pMax.in + outTok * pMax.out) / 1_000_000;
    }
    return (inTok * p.in + outTok * p.out) / 1_000_000;
  }

  /**
   * Consomme un flux SSE de la Messages API et reconstitue le texte + l'usage.
   * Le streaming n'est pas un luxe : sans lui, une réponse de 60 000 tokens
   * demande à Anthropic de tenir la connexion ouverte pendant 12-20 minutes
   * avant d'envoyer le moindre octet, et le timeout par défaut d'undici (300 s)
   * la coupe — donc les deux steps payants du produit (génération et édition
   * de site) échouaient TOUJOURS. En streaming, les fragments arrivent en
   * continu et la génération aboutit.
   * @returns {Promise<{text:string, usage:{input_tokens:number, output_tokens:number}}>}
   */
  async function lireFluxSSE(res, signalInactivite) {
    let texte = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let tampon = '';
    const decodeur = new TextDecoder();

    for await (const morceau of res.body) {
      signalInactivite(); // réarme le chrono d'inactivité à chaque fragment reçu
      tampon += decodeur.decode(morceau, { stream: true });

      // SSE : événements séparés par une ligne vide ; on traite ligne à ligne.
      let idx;
      while ((idx = tampon.indexOf('\n')) !== -1) {
        const ligne = tampon.slice(0, idx).trim();
        tampon = tampon.slice(idx + 1);
        if (!ligne.startsWith('data:')) continue; // on ignore les lignes « event: » et vides
        const charge = ligne.slice(5).trim();
        if (!charge || charge === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(charge); } catch { continue; }

        switch (ev.type) {
          case 'message_start':
            inputTokens = ev.message?.usage?.input_tokens ?? inputTokens;
            outputTokens = ev.message?.usage?.output_tokens ?? outputTokens;
            break;
          case 'content_block_delta':
            if (ev.delta?.type === 'text_delta') texte += ev.delta.text;
            break;
          case 'message_delta':
            // Le compte final d'output_tokens arrive ici (cumulatif).
            if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
            break;
          case 'error':
            throw new Error(`llm: erreur de flux — ${ev.error?.type || ''} ${ev.error?.message || ''}`.trim());
          default:
            break; // ping, content_block_start/stop, message_stop
        }
      }
    }
    return { text: texte, usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
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
      stream: true, // voir lireFluxSSE : indispensable pour les longues générations
      ...(opts.system ? { system: opts.system } : {}),
    };

    let res;
    let controleur;
    for (let tentative = 1; ; tentative++) {
      // Chrono d'inactivité : un AbortController réarmé à chaque fragment.
      controleur = new AbortController();
      let minuteur = setTimeout(() => controleur.abort(new Error('inactivité')), INACTIVITE_MAX_MS);
      const rearmer = () => {
        clearTimeout(minuteur);
        minuteur = setTimeout(() => controleur.abort(new Error('inactivité')), INACTIVITE_MAX_MS);
      };

      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controleur.signal,
        });
      } catch (e) {
        clearTimeout(minuteur);
        if (e && e.message === 'inactivité') throw new Error('llm: connexion Anthropic sans réponse (timeout d\'inactivité)', { cause: e });
        throw new Error(`llm: échec réseau vers Anthropic — ${e && e.message}`, { cause: e });
      }

      // 429 / surcharge : UNE relance locale en respectant Retry-After ;
      // au-delà, on laisse la file de jobs faire son backoff exponentiel.
      if ((res.status === 429 || res.status === 529) && tentative === 1) {
        clearTimeout(minuteur);
        // Retry-After: 0 est valide (« réessaie tout de suite ») — l'ancien
        // `|| 15` le transformait en 15 s parce que 0 est falsy. On ne retombe
        // sur 15 s que si l'en-tête est absent ou illisible.
        const ra = parseInt(res.headers.get('retry-after'), 10);
        const waitS = Math.min(Number.isFinite(ra) ? ra : 15, 60);
        if (waitS > 0) await new Promise(r => setTimeout(r, waitS * 1000));
        continue;
      }

      if (!res.ok) {
        clearTimeout(minuteur);
        const detail = await res.text().catch(() => '');
        throw new Error(`llm: API ${res.status} — ${detail.slice(0, 300)}`);
      }

      // Réponse OK : on consomme le flux, en réarmant le chrono à chaque fragment.
      let resultat;
      try {
        resultat = await lireFluxSSE(res, rearmer);
      } catch (e) {
        if (controleur.signal.aborted) throw new Error('llm: flux Anthropic interrompu (timeout d\'inactivité)', { cause: e });
        throw e;
      } finally {
        clearTimeout(minuteur);
      }

      const usage = resultat.usage;
      const cents = coutCents(model, usage.input_tokens, usage.output_tokens);
      stmts.record.run(clientId, opts.jobId ?? null, opts.stepName ?? null, model,
        usage.input_tokens, usage.output_tokens, cents);
      return { text: resultat.text, usage, model };
    }
  }

  /** Tableau coûts/tokens du mois courant, par client (pour l'admin). */
  function rollupMois() { return stmts.rollup.all(); }

  return { claude, rollupMois, _coutCents: coutCents };
}

module.exports = { createLlmGateway, PRIX_CENTS_PAR_MTOK };
