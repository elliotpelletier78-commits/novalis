'use strict';
// ── File de jobs sur SQLite ──────────────────────────────────────────
// Décision d'architecture : pas de Redis/BullMQ ni de Postgres/pg-boss.
// À l'échelle visée (<10 clients, dizaines de jobs/jour), une table
// SQLite en WAL absorbe la charge avec trois ordres de grandeur de
// marge, et surtout : ZÉRO service supplémentaire à payer, monitorer
// ou relancer pour un opérateur solo. better-sqlite3 étant synchrone
// et single-process, le claim d'un job est naturellement atomique —
// aucun verrou distribué nécessaire.
// Contrainte assumée en échange : UN SEUL processus worker (1 replica
// Railway, jamais deux). Signal de sortie vers pg-boss/Postgres :
// >50 clients ou besoin temps réel.

const BACKOFF_BASE_S = 30;      // 1er retry ~30s, puis 60s, 120s…
const BACKOFF_MAX_S = 3600;     // plafond 1h entre deux tentatives
const STALE_LOCK_MIN = 15;      // job « running » sans heartbeat depuis 15 min = orphelin

/** @param {import('better-sqlite3').Database} db */
function createQueue(db) {
  const stmts = {
    insert: db.prepare(`INSERT INTO jobs (type, client_id, payload, max_attempts, priority, run_at, dedupe_key)
      VALUES (@type, @clientId, @payload, @maxAttempts, @priority, COALESCE(@runAt, datetime('now')), @dedupeKey)`),
    claimSelect: db.prepare(`SELECT id FROM jobs
      WHERE status = 'queued' AND run_at <= datetime('now')
      ORDER BY priority DESC, id ASC LIMIT 1`),
    claimUpdate: db.prepare(`UPDATE jobs
      SET status = 'running', attempts = attempts + 1, locked_at = datetime('now'), error_text = NULL
      WHERE id = ? AND status = 'queued'`),
    getById: db.prepare(`SELECT * FROM jobs WHERE id = ?`),
    heartbeat: db.prepare(`UPDATE jobs SET locked_at = datetime('now') WHERE id = ? AND status = 'running'`),
    complete: db.prepare(`UPDATE jobs SET status = 'done', output = ?, finished_at = datetime('now'), locked_at = NULL
      WHERE id = ? AND status = 'running'`),
    fail: db.prepare(`UPDATE jobs SET status = ?, error_text = ?, run_at = ?, finished_at = ?, locked_at = NULL
      WHERE id = ? AND status = 'running'`),
    recoverStale: db.prepare(`UPDATE jobs SET status = 'queued', locked_at = NULL
      WHERE status = 'running' AND locked_at < datetime('now', '-' || ? || ' minutes')`),
    requeueDead: db.prepare(`UPDATE jobs SET status = 'queued', attempts = 0, error_text = NULL,
      run_at = datetime('now'), finished_at = NULL WHERE id = ? AND status IN ('dead','failed')`),
    stepStart: db.prepare(`INSERT INTO job_steps (job_id, step_name, attempt) VALUES (?, ?, ?)`),
    stepDone: db.prepare(`UPDATE job_steps SET status = 'done', finished_at = datetime('now'), output = ?
      WHERE id = ?`),
    stepFail: db.prepare(`UPDATE job_steps SET status = 'failed', finished_at = datetime('now'), error_text = ?
      WHERE id = ?`),
    lastDoneStep: db.prepare(`SELECT step_name, output FROM job_steps
      WHERE job_id = ? AND status = 'done' ORDER BY id ASC`),
    listRecent: db.prepare(`SELECT j.*, c.nom AS client_nom FROM jobs j
      JOIN clients c ON c.id = j.client_id ORDER BY j.id DESC LIMIT ?`),
    stepsForJob: db.prepare(`SELECT * FROM job_steps WHERE job_id = ? ORDER BY id ASC`),
  };

  /**
   * Enfile un job. dedupeKey rend l'opération idempotente : réenfiler le
   * même (type, dedupeKey) est un no-op silencieux — c'est ce qui rend
   * les schedules sûrs (« rapport client X semaine 27 » n'existe qu'une fois).
   * @returns {{id:number|null, deduped:boolean}}
   */
  function enqueue({ type, clientId, payload = {}, maxAttempts = 4, priority = 0, runAt = null, dedupeKey = null }) {
    if (!type) throw new Error('enqueue: type requis');
    if (!Number.isInteger(clientId)) throw new Error('enqueue: clientId entier requis (isolation multi-tenant)');
    try {
      const info = stmts.insert.run({ type, clientId, payload: JSON.stringify(payload), maxAttempts, priority, runAt, dedupeKey });
      return { id: Number(info.lastInsertRowid), deduped: false };
    } catch (e) {
      if (String(e.message).includes('UNIQUE') && dedupeKey) return { id: null, deduped: true };
      throw e;
    }
  }

  /**
   * Réserve atomiquement le prochain job exécutable.
   * Transaction better-sqlite3 (synchrone) : deux appels concurrents dans
   * le même process se sérialisent, et il n'existe qu'un process (1 replica).
   * @returns {object|null} le job réservé, payload déjà parsé
   */
  const claim = db.transaction(() => {
    const row = stmts.claimSelect.get();
    if (!row) return null;
    const upd = stmts.claimUpdate.run(row.id);
    if (upd.changes !== 1) return null; // course théorique : on repassera au tick suivant
    const job = stmts.getById.get(row.id);
    job.payload = safeParse(job.payload, {});
    return job;
  });

  function heartbeat(jobId) { stmts.heartbeat.run(jobId); }

  function complete(jobId, output) {
    stmts.complete.run(JSON.stringify(output ?? null), jobId);
  }

  /**
   * Échec d'un job : backoff exponentiel puis lettre morte.
   * Le run reprendra AU step échoué (voir runSteps) — on ne repaie
   * jamais un appel API déjà réussi.
   */
  function fail(jobId, err) {
    const job = stmts.getById.get(jobId);
    if (!job) return;
    const msg = String(err && err.message ? err.message : err).slice(0, 2000);
    if (job.attempts >= job.max_attempts) {
      stmts.fail.run('dead', msg, job.run_at, new Date().toISOString(), jobId);
    } else {
      const delayS = Math.min(BACKOFF_BASE_S * 2 ** (job.attempts - 1), BACKOFF_MAX_S);
      const runAt = new Date(Date.now() + delayS * 1000).toISOString().replace('T', ' ').slice(0, 19);
      stmts.fail.run('queued', msg, runAt, null, jobId);
    }
  }

  /** Au boot et périodiquement : libère les jobs orphelins d'un crash. */
  function recoverStale() { return stmts.recoverStale.run(STALE_LOCK_MIN).changes; }

  /** Relance manuelle d'un job mort (bouton admin). */
  function requeue(jobId) { return stmts.requeueDead.run(jobId).changes === 1; }

  /**
   * Exécute la chaîne de steps d'un pipeline avec reprise : les steps
   * déjà « done » lors d'une tentative précédente sont rejoués depuis
   * leur sortie enregistrée, pas réexécutés.
   * @param {object} job job réservé par claim()
   * @param {Array<{name:string, run:(ctx:object)=>Promise<any>}>} steps
   * @returns {Promise<object>} ctx final (sorties de tous les steps)
   */
  async function runSteps(job, steps) {
    const doneBefore = new Map(
      stmts.lastDoneStep.all(job.id).map(r => [r.step_name, safeParse(r.output, null)])
    );
    const ctx = { job, outputs: {} };
    for (const step of steps) {
      if (doneBefore.has(step.name)) {
        ctx.outputs[step.name] = doneBefore.get(step.name);
        continue; // déjà payé, déjà réussi — on ne refait pas
      }
      const stepId = Number(stmts.stepStart.run(job.id, step.name, job.attempts).lastInsertRowid);
      heartbeat(job.id);
      try {
        const out = await step.run(ctx);
        stmts.stepDone.run(JSON.stringify(out ?? null), stepId);
        ctx.outputs[step.name] = out;
      } catch (e) {
        stmts.stepFail.run(String(e && e.message ? e.message : e).slice(0, 2000), stepId);
        throw e; // fail() du job décidera retry/dead
      }
    }
    return ctx;
  }

  function listRecent(limit = 50) {
    return stmts.listRecent.all(limit).map(j => ({ ...j, payload: safeParse(j.payload, {}), output: safeParse(j.output, null) }));
  }
  function stepsForJob(jobId) {
    return stmts.stepsForJob.all(jobId).map(s => ({ ...s, output: safeParse(s.output, null) }));
  }

  return { enqueue, claim, heartbeat, complete, fail, recoverStale, requeue, runSteps, listRecent, stepsForJob };
}

function safeParse(s, fallback) {
  try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; }
}

module.exports = { createQueue };
