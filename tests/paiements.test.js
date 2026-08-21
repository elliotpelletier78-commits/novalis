import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { createStripe, validerSignature } from '../core/paiements.js';

describe('paiements — configuration', () => {
  it('non configuré sans clé → aucun faux paiement', async () => {
    const s = createStripe({});
    expect(s.configured).toBe(false);
    const r = await s.creerLien({ montant_cents: 5000, description: 'Test' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/non configuré/);
  });
  it('configuré avec la clé secrète', () => {
    expect(createStripe({ STRIPE_SECRET_KEY: 'sk_test_x' }).configured).toBe(true);
  });
  it('refuse un montant sous le minimum', async () => {
    const s = createStripe({ STRIPE_SECRET_KEY: 'sk_test_x' });
    const r = await s.creerLien({ montant_cents: 10, description: 'Trop petit' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/minimum/);
  });
});

describe('paiements — validation de signature Stripe', () => {
  const secret = 'whsec_test';
  const corps = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } });
  function entete(t, body, sec = secret) {
    const sig = crypto.createHmac('sha256', sec).update(t + '.' + body).digest('hex');
    return `t=${t},v1=${sig}`;
  }
  const now = 1700000000;

  it('accepte une signature valide dans la tolérance', () => {
    expect(validerSignature(secret, corps, entete(now, corps), 300, now)).toBe(true);
  });
  it('accepte le corps sous forme de Buffer', () => {
    const buf = Buffer.from(corps, 'utf8');
    expect(validerSignature(secret, buf, entete(now, corps), 300, now)).toBe(true);
  });
  it('refuse une signature falsifiée', () => {
    expect(validerSignature(secret, corps, `t=${now},v1=deadbeef`, 300, now)).toBe(false);
  });
  it('refuse un corps altéré', () => {
    const h = entete(now, corps);
    expect(validerSignature(secret, corps + 'x', h, 300, now)).toBe(false);
  });
  it('refuse hors de la tolérance temporelle (rejeu)', () => {
    expect(validerSignature(secret, corps, entete(now - 10000, corps), 300, now)).toBe(false);
  });
  it('refuse sans secret et sans en-tête', () => {
    expect(validerSignature('', corps, entete(now, corps), 300, now)).toBe(false);
    expect(validerSignature(secret, corps, '', 300, now)).toBe(false);
  });
});
