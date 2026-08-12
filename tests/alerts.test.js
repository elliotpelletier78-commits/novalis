import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAlerter } from '../core/alerts.js';

let vraiFetch;
beforeEach(() => { vraiFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = vraiFetch; vi.restoreAllMocks(); });

describe('alertes — webhook + courriel', () => {
  it('n\'est pas configuré sans aucun canal', () => {
    const a = createAlerter({});
    expect(a.configured).toBe(false);
    expect(a.canaux).toEqual({ webhook: false, courriel: false });
  });

  it('envoie au webhook Discord/Slack (content + text)', async () => {
    const appels = [];
    globalThis.fetch = async (url, opts) => { appels.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 204 }; };
    const a = createAlerter({ ALERT_WEBHOOK_URL: 'https://discord.test/webhook' });
    const r = await a.alert('Nouveau message — garage-x', 'Marie · marie@x.ca');
    expect(r.webhook.sent).toBe(true);
    const w = appels.find(x => x.url === 'https://discord.test/webhook');
    expect(w.body.content).toContain('Nouveau message');
    expect(w.body.text).toContain('Nouveau message'); // couvre Slack ET Discord
  });

  it('envoie un courriel via l\'API Resend quand configuré', async () => {
    const appels = [];
    globalThis.fetch = async (url, opts) => { appels.push({ url, headers: opts.headers, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; };
    const a = createAlerter({ RESEND_API_KEY: 'rk_test', ALERT_EMAIL_TO: 'elliot@x.ca' });
    expect(a.canaux.courriel).toBe(true);
    const r = await a.alert('Nouveau message — salon-y', 'Ana veut un rendez-vous');
    expect(r.courriel.sent).toBe(true);
    const e = appels.find(x => x.url === 'https://api.resend.com/emails');
    expect(e.headers.authorization).toBe('Bearer rk_test');
    expect(e.body.to).toEqual(['elliot@x.ca']);
    expect(e.body.subject).toContain('salon-y');
    expect(e.body.text).toContain('Ana');
  });

  it('supporte plusieurs destinataires séparés par des virgules', async () => {
    let capté = null;
    globalThis.fetch = async (url, opts) => { if (url.includes('resend')) capté = JSON.parse(opts.body); return { ok: true, status: 200 }; };
    const a = createAlerter({ RESEND_API_KEY: 'k', ALERT_EMAIL_TO: 'a@x.ca, b@x.ca' });
    await a.alert('t', 'd');
    expect(capté.to).toEqual(['a@x.ca', 'b@x.ca']);
  });

  it('déclenche les DEUX canaux et ne casse pas si l\'un échoue', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('resend')) throw new Error('réseau courriel down');
      return { ok: true, status: 204 };
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = createAlerter({ ALERT_WEBHOOK_URL: 'https://d/w', RESEND_API_KEY: 'k', ALERT_EMAIL_TO: 'e@x.ca' });
    const r = await a.alert('titre', 'détail');
    expect(r.webhook.sent).toBe(true);      // le webhook passe
    expect(r.courriel.sent).toBe(false);    // le courriel échoue proprement
    expect(r.sent).toBe(true);              // au moins un canal → globalement envoyé
  });
});
