import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { createSms, estTelephone, normaliserTel, validerSignature } from '../core/sms.js';

describe('sms — numéros', () => {
  it('reconnaît un numéro nord-américain sous diverses formes', () => {
    expect(estTelephone('514-555-0100')).toBe(true);
    expect(estTelephone('(514) 555-0100')).toBe(true);
    expect(estTelephone('+15145550100')).toBe(true);
    expect(estTelephone('cote@courriel.ca')).toBe(false);
    expect(estTelephone('12')).toBe(false);
  });
  it('normalise vers E.164', () => {
    expect(normaliserTel('514-555-0100')).toBe('+15145550100');
    expect(normaliserTel('1 (514) 555-0100')).toBe('+15145550100');
    expect(normaliserTel('+15145550100')).toBe('+15145550100');
    expect(normaliserTel('allo')).toBeNull();
  });
});

describe('sms — configuration', () => {
  it('non configuré sans clés → aucun faux envoi', async () => {
    const s = createSms({});
    expect(s.configured).toBe(false);
    const r = await s.envoyer({ to: '+15145550100', text: 'test' });
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/non configuré/);
  });
  it('configuré avec les trois clés', () => {
    const s = createSms({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15140000000' });
    expect(s.configured).toBe(true);
  });
});

describe('sms — validation de signature Twilio', () => {
  // Reproduit l'algorithme officiel pour fabriquer une signature valide.
  function signer(token, url, params) {
    let data = url;
    for (const k of Object.keys(params).sort()) data += k + params[k];
    return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  }
  const token = 'mon-auth-token';
  const url = 'https://novalis.example/sms/garage-x';
  const params = { From: '+15145550100', Body: 'Bonjour', To: '+15140000000' };

  it('accepte une signature valide', () => {
    const sig = signer(token, url, params);
    expect(validerSignature(token, url, params, sig)).toBe(true);
  });
  it('refuse une signature falsifiée', () => {
    expect(validerSignature(token, url, params, 'faux')).toBe(false);
  });
  it('refuse si un paramètre a été altéré', () => {
    const sig = signer(token, url, params);
    expect(validerSignature(token, url, { ...params, Body: 'Modifié' }, sig)).toBe(false);
  });
  it('refuse sans token (aucune confiance par défaut)', () => {
    const sig = signer(token, url, params);
    expect(validerSignature('', url, params, sig)).toBe(false);
  });
});
