'use strict';
// ── Worker de jobs : boucle de polling dans le process du serveur ────
// Décision d'architecture : PAS de second processus ni de second
// service Railway. À dizaines de jobs/jour, un tick de polling toutes
// les 2 s dans le même process suffit, et il n'y a qu'UN processus à
// surveiller/relancer (Railway le fait). La concurrence est de 1 : les
// pipelines utilisent sharp/playwright (CPU/RAM lourds) — en exécuter
// deux à la fois sur une petite instance est le chemin le plus court
// vers l'OOM. Signal de sortie : si la file accumule du retard sur
// plusieurs heures, passer le worker dans un service Railway séparé.

const TICK_MS = 2000;
const STALE_SWEEP_EVERY = 150; // ~5 min (150 ticks de 2 s)

/**
 * @param {ReturnType<import('./queue').createQueue>} queue
 * @param {Array<{type:string, steps:Array}>} pipelines
 * @param {{log?:(...a:any)=>void}} [opts]
 */
function startWorker(queue, pipelines, opts = {}) {
  const log = opts.log || ((...a) => console.log('[worker]', ...a));
  const registry = new Map(pipelines.map(p => [p.type, p]));
  let busy = false;
  let ticks = 0;
  let stopped = false;

  // Les jobs orphelins d'un crash précédent redeviennent exécutables.
  const recovered = queue.recoverStale();
  if (recovered) log(`${recovered} job(s) orphelin(s) récupéré(s) au démarrage`);

  async function tick() {
    if (busy || stopped) return;
    ticks++;
    if (ticks % STALE_SWEEP_EVERY === 0) queue.recoverStale();

    const job = queue.claim();
    if (!job) return;

    const pipeline = registry.get(job.type);
    if (!pipeline) {
      // Type inconnu = bug de config, pas une erreur transitoire :
      // inutile de retenter, on tue le job avec un message clair.
      queue.fail(job.id, new Error(`type de job inconnu: ${job.type} (pipelines: ${[...registry.keys()].join(', ')})`));
      return;
    }

    busy = true;
    const t0 = Date.now();
    // Heartbeat pendant l'exécution : sans lui, un job long serait
    // « récupéré » comme orphelin par le sweep au bout de 15 min.
    const hb = setInterval(() => queue.heartbeat(job.id), 60_000);
    try {
      log(`job #${job.id} ${job.type} (client ${job.client_id}, tentative ${job.attempts}/${job.max_attempts})`);
      const ctx = await pipeline.steps ? await queue.runSteps(job, pipeline.steps) : null;
      const final = ctx ? ctx.outputs[pipeline.steps[pipeline.steps.length - 1].name] : null;
      queue.complete(job.id, final);
      log(`job #${job.id} terminé en ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      queue.fail(job.id, e);
      log(`job #${job.id} échec: ${e.message}`);
    } finally {
      clearInterval(hb);
      busy = false;
    }
  }

  const interval = setInterval(() => { tick().catch(e => log('tick erreur:', e.message)); }, TICK_MS);
  interval.unref?.(); // ne retient pas le process à l'arrêt

  return {
    stop() { stopped = true; clearInterval(interval); },
    /** Pour les tests : exécute un tick immédiatement. */
    async tickOnce() { await tick(); },
  };
}

module.exports = { startWorker };
