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
const { planifier: planifierSauvegarde } = require('./sauvegarde');

const PIPELINES = [
  require('./pipelines/audit-prospect'),
  require('./pipelines/demo-prospect'),
  require('./pipelines/genere-site-ia'),
  require('./pipelines/modifie-site-ia'),
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
    // Dépendances injectées dans le ctx de chaque step (ctx.deps) :
    // les pipelines IA ont besoin de la passerelle LLM, de la base et
    // de l'invalidation de step. Injection > require direct : testable.
    deps: { llm, db, queue },
    // Un job mort = intervention humaine requise → alerte immédiate,
    // avec le lien direct vers la page d'exploitation.
    onDead: (job, err) => {
      alerter.alert(
        `Job #${job.id} mort (${job.type})`,
        `Client ${job.client_id} · ${job.attempts} tentatives · ${err.message}\nRelancer : /core/admin`
      );
    },
  });

  // Sauvegarde quotidienne de la base, sauf désactivation explicite. Copies
  // datées dans output/backups/, rotation sur 7. Ne bloque pas le démarrage ;
  // une sauvegarde ratée est journalisée, jamais fatale. (Prochaine étape hors
  // code : pousser la plus récente vers un stockage hors-Railway.)
  let arreterSauvegarde = () => {};
  if (env.SAUVEGARDE_AUTO !== '0') {
    arreterSauvegarde = planifierSauvegarde(db);
    console.log('[core] sauvegarde quotidienne de la base planifiée (SAUVEGARDE_AUTO=0 pour désactiver)');
  }

  return { queue, vault, llm, worker, alerter, arreterSauvegarde, pipelines: PIPELINES.map(p => p.type) };
}

module.exports = { initCore };
