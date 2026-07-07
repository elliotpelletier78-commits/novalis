'use strict';
// ── Point d'assemblage du noyau Novalis ──────────────────────────────
// server.js appelle initCore(db) une fois au démarrage : migrations,
// file de jobs, coffre à credentials, passerelle LLM, worker.
// Tout est fail-safe : si un composant optionnel manque (MASTER_KEY,
// ANTHROPIC_API_KEY), le reste du site fonctionne et les opérations
// concernées échouent avec un message actionnable.

const { runMigrations } = require('./db');
const { createQueue } = require('./queue');
const { createVault } = require('./secrets');
const { createLlmGateway } = require('./llm');
const { startWorker } = require('./worker');
const { createAlerter } = require('./alerts');

const PIPELINES = [
  require('./pipelines/audit-prospect'),
  require('./pipelines/demo-prospect'),
];

/**
 * @param {import('better-sqlite3').Database} db connexion partagée du serveur
 * @param {NodeJS.ProcessEnv} [env]
 */
function initCore(db, env = process.env) {
  const { applied } = runMigrations(db);
  if (applied.length) console.log('[core] migrations appliquées:', applied.join(', '));

  const queue = createQueue(db);
  const vault = createVault(db, env.MASTER_KEY);
  const llm = createLlmGateway(db, env.ANTHROPIC_API_KEY);
  const alerter = createAlerter(env);
  const worker = startWorker(queue, PIPELINES, {
    // Un job mort = intervention humaine requise → alerte immédiate,
    // avec le lien direct vers la page d'exploitation.
    onDead: (job, err) => {
      alerter.alert(
        `Job #${job.id} mort (${job.type})`,
        `Client ${job.client_id} · ${job.attempts} tentatives · ${err.message}\nRelancer : /core/admin`
      );
    },
  });

  return { queue, vault, llm, worker, alerter, pipelines: PIPELINES.map(p => p.type) };
}

module.exports = { initCore };
