import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createLlmGateway, PRIX_CENTS_PAR_MTOK } from '../core/llm.js';

// La passerelle LLM parle à Anthropic en streaming (SSE). Sans streaming, une
// réponse de 60 000 tokens dépasse le timeout par défaut d'undici et les deux
// steps payants du produit (génération + édition de site) échouaient TOUJOURS.
// Ces tests verrouillent ce comportement : ils simulent l'API au niveau fetch.

function dbTest() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE clients (id INTEGER PRIMARY KEY, nom TEXT, budget_llm_cents_mois INTEGER);
    CREATE TABLE llm_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, job_id INTEGER,
      step_name TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cout_cents REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO clients VALUES (1, 'Interne', NULL), (2, 'Client', 100);
  `);
  return db;
}

function corpsSSE(evts) {
  const enc = new TextEncoder();
  return (async function* () {
    for (const e of evts) yield enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  })();
}
function reponse({ status = 200, headers = {}, body = null }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}
function fluxGeneration(morceaux, inTok, outTok) {
  return [
    { type: 'message_start', message: { usage: { input_tokens: inTok, output_tokens: 0 } } },
    ...morceaux.map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'message_delta', usage: { output_tokens: outTok } },
    { type: 'message_stop' },
  ];
}

let vraiFetch;
beforeEach(() => { vraiFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = vraiFetch; });

describe('passerelle LLM (streaming)', () => {
  it('réassemble le texte streamé dans l\'ordre et enregistre le coût', async () => {
    const db = dbTest();
    const gw = createLlmGateway(db, 'cle');
    globalThis.fetch = async () => reponse({ body: corpsSSE(fluxGeneration(['<!DOCTYPE ', 'html>', '…</html>'], 1200, 900)) });

    const r = await gw.claude(1, { messages: [{ role: 'user', content: 'x' }], maxTokens: 60000 });
    expect(r.text).toBe('<!DOCTYPE html>…</html>');
    expect(r.usage.input_tokens).toBe(1200);
    expect(r.usage.output_tokens).toBe(900);

    const row = db.prepare('SELECT * FROM llm_calls').get();
    // sonnet-5 (tarif intro 200/1000) : (1200*200 + 900*1000)/1e6 = 1.14¢
    expect(row.cout_cents).toBeCloseTo(1.14, 9);
  });

  it('envoie bien stream:true à l\'API', async () => {
    const db = dbTest();
    const gw = createLlmGateway(db, 'cle');
    let corpsEnvoye = null;
    globalThis.fetch = async (url, opts) => { corpsEnvoye = JSON.parse(opts.body); return reponse({ body: corpsSSE(fluxGeneration(['ok'], 1, 1)) }); };
    await gw.claude(1, { messages: [{ role: 'user', content: 'x' }] });
    expect(corpsEnvoye.stream).toBe(true);
  });

  it('relance exactement une fois sur 429 puis réussit', async () => {
    const db = dbTest();
    const gw = createLlmGateway(db, 'cle');
    let appels = 0;
    globalThis.fetch = async () => {
      appels++;
      if (appels === 1) return reponse({ status: 429, headers: { 'retry-after': '0' }, body: 'rate' });
      return reponse({ body: corpsSSE(fluxGeneration(['ok'], 10, 5)) });
    };
    const r = await gw.claude(1, { messages: [{ role: 'user', content: 'x' }] });
    expect(r.text).toBe('ok');
    expect(appels).toBe(2);
  });

  it('propage un événement error du flux', async () => {
    const db = dbTest();
    const gw = createLlmGateway(db, 'cle');
    globalThis.fetch = async () => reponse({ body: corpsSSE([
      { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
      { type: 'error', error: { type: 'overloaded_error', message: 'surcharge' } },
    ]) });
    await expect(gw.claude(1, { messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/flux|surcharge|overloaded/i);
  });

  it('bloque sur budget épuisé AVANT tout appel réseau', async () => {
    const db = dbTest();
    db.prepare('INSERT INTO llm_calls (client_id, model, input_tokens, output_tokens, cout_cents) VALUES (2,?,0,0,?)')
      .run('claude-sonnet-5', 150);
    const gw = createLlmGateway(db, 'cle');
    let toucheReseau = false;
    globalThis.fetch = async () => { toucheReseau = true; return reponse({ body: corpsSSE(fluxGeneration(['x'], 1, 1)) }); };
    await expect(gw.claude(2, { messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ code: 'BUDGET_EPUISE' });
    expect(toucheReseau).toBe(false);
  });

  it('ne facture jamais 0¢ un modèle inconnu', async () => {
    const db = dbTest();
    const gw = createLlmGateway(db, 'cle');
    globalThis.fetch = async () => reponse({ body: corpsSSE(fluxGeneration(['x'], 1000, 1000)) });
    await gw.claude(1, { model: 'modele-inconnu', messages: [{ role: 'user', content: 'x' }] });
    const row = db.prepare('SELECT * FROM llm_calls ORDER BY id DESC').get();
    expect(row.cout_cents).toBeGreaterThan(0);
  });

  it('exige une clé API (fail-closed)', async () => {
    const gw = createLlmGateway(dbTest(), undefined);
    await expect(gw.claude(1, { messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('la table de prix contient le modèle par défaut', () => {
    expect(PRIX_CENTS_PAR_MTOK['claude-sonnet-5']).toBeTruthy();
  });
});
