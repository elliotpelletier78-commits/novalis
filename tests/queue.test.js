import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { createQueue } from '../core/queue.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

describe('file de jobs SQLite', () => {
  let db, q;
  beforeEach(() => { db = freshDb(); q = createQueue(db); });

  it('enqueue puis claim retourne le job avec payload parsé', () => {
    const { id } = q.enqueue({ type: 'audit-prospect', clientId: 1, payload: { url: 'https://x.test' } });
    const job = q.claim();
    expect(job.id).toBe(id);
    expect(job.status).toBe('running');
    expect(job.payload.url).toBe('https://x.test');
    expect(job.attempts).toBe(1);
  });

  it('claim est exclusif : un job réservé ne se claim pas deux fois', () => {
    q.enqueue({ type: 't', clientId: 1 });
    expect(q.claim()).not.toBeNull();
    expect(q.claim()).toBeNull();
  });

  it('la priorité passe avant l\'ordre d\'insertion', () => {
    q.enqueue({ type: 'lent', clientId: 1, priority: 0 });
    const { id: urgent } = q.enqueue({ type: 'urgent', clientId: 1, priority: 5 });
    expect(q.claim().id).toBe(urgent);
  });

  it('fail → requeue avec backoff, puis dead après max_attempts', () => {
    const { id } = q.enqueue({ type: 't', clientId: 1, maxAttempts: 2 });
    let job = q.claim();
    q.fail(job.id, new Error('boom 1'));
    let row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    expect(row.status).toBe('queued');
    expect(row.run_at > row.created_at).toBe(true); // repoussé dans le futur

    // On force le run_at pour re-claim immédiatement
    db.prepare(`UPDATE jobs SET run_at = datetime('now', '-1 second') WHERE id = ?`).run(id);
    job = q.claim();
    expect(job.attempts).toBe(2);
    q.fail(job.id, new Error('boom 2'));
    row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    expect(row.status).toBe('dead');
    expect(row.error_text).toContain('boom 2');
  });

  it('dedupe_key rend l\'enqueue idempotent', () => {
    const a = q.enqueue({ type: 'rapport', clientId: 1, dedupeKey: 'client1-sem27' });
    const b = q.enqueue({ type: 'rapport', clientId: 1, dedupeKey: 'client1-sem27' });
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
    expect(db.prepare('SELECT COUNT(*) n FROM jobs').get().n).toBe(1);
  });

  it('recoverStale remet en queue les jobs orphelins', () => {
    const { id } = q.enqueue({ type: 't', clientId: 1 });
    q.claim();
    db.prepare(`UPDATE jobs SET locked_at = datetime('now', '-30 minutes') WHERE id = ?`).run(id);
    expect(q.recoverStale()).toBe(1);
    expect(db.prepare('SELECT status FROM jobs WHERE id = ?').get(id).status).toBe('queued');
  });

  it('runSteps reprend au step échoué sans réexécuter les steps réussis', async () => {
    let executionsStep1 = 0;
    const steps = [
      { name: 'un', run: async () => { executionsStep1++; return { valeur: 42 }; } },
      { name: 'deux', run: async (ctx) => {
          if (ctx.job.attempts < 2) throw new Error('échec transitoire');
          return { double: ctx.outputs['un'].valeur * 2 };
        } },
    ];
    const { id } = q.enqueue({ type: 'pipe', clientId: 1 });

    let job = q.claim();
    await expect(q.runSteps(job, steps)).rejects.toThrow('échec transitoire');
    q.fail(job.id, new Error('échec transitoire'));

    db.prepare(`UPDATE jobs SET run_at = datetime('now', '-1 second') WHERE id = ?`).run(id);
    job = q.claim();
    const ctx = await q.runSteps(job, steps);
    expect(ctx.outputs['deux'].double).toBe(84);
    expect(executionsStep1).toBe(1); // le step 1 n'a PAS été rejoué
  });

  it('requeue relance un job mort', () => {
    const { id } = q.enqueue({ type: 't', clientId: 1, maxAttempts: 1 });
    q.claim();
    q.fail(id, new Error('x'));
    expect(db.prepare('SELECT status FROM jobs WHERE id=?').get(id).status).toBe('dead');
    expect(q.requeue(id)).toBe(true);
    expect(db.prepare('SELECT status FROM jobs WHERE id=?').get(id).status).toBe('queued');
  });

  it('exige un clientId entier (isolation multi-tenant)', () => {
    expect(() => q.enqueue({ type: 't' })).toThrow(/clientId/);
  });

  it('fail retourne le statut résultant (pour les alertes)', () => {
    const { id } = q.enqueue({ type: 't', clientId: 1, maxAttempts: 2 });
    q.claim();
    expect(q.fail(id, new Error('a'))).toBe('queued');   // retry planifié
    db.prepare(`UPDATE jobs SET run_at = datetime('now', '-1 second') WHERE id = ?`).run(id);
    q.claim();
    expect(q.fail(id, new Error('b'))).toBe('dead');     // lettre morte → alerte
    expect(q.fail(999999, new Error('c'))).toBeNull();   // job inexistant
  });
});
