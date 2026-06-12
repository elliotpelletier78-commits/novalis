'use strict';

// ── Higgsfield AI — Animation cinématique des photos PME ─────────────────────
// Transforme la photo hero (extérieur/facade) en vidéo 5s de qualité cinéma.
// Utilise le modèle DoP-Turbo via @higgsfield/client/v2 (CommonJS).

const { createHiggsfieldClient } = require('@higgsfield/client/v2');
const https = require('https');
const http  = require('http');

// Prompts cinématiques par industrie — tournés autour du mouvement de caméra
const PROMPTS = {
  restaurant:   'Slow cinematic push-in, warm golden candlelight restaurant ambiance, elegant atmosphere, rich colors, no text',
  garage:       'Slow cinematic pan left, professional automotive workshop, dramatic industrial lighting, bold atmosphere, no text',
  salon:        'Gentle slow zoom in, luxury beauty salon interior, soft warm lighting, serene upscale atmosphere, no text',
  clinique:     'Slow dolly zoom, bright modern medical clinic, clean professional environment, soft natural light, no text',
  construction: 'Slow cinematic pan, construction site with blue sky, bold authoritative atmosphere, wide angle, no text',
};

let _client = null;
function getClient() {
  if (_client) return _client;
  const creds = process.env.HIGGSFIELD_CREDENTIALS;
  if (!creds) throw new Error('HIGGSFIELD_CREDENTIALS non défini');
  _client = createHiggsfieldClient({
    credentials: creds,
    maxPollTime:  130_000, // 2min 10s max avant timeout
    pollInterval:   5_000, // poll toutes les 5s
  });
  return _client;
}

// Animer une photo → URL de la vidéo générée
async function animatePhoto(imageUrl, industry = 'restaurant') {
  const client = getClient();
  const prompt = PROMPTS[industry] || PROMPTS.restaurant;

  console.log(`[higgsfield] submit DoP-Turbo pour ${imageUrl.slice(0, 70)}…`);
  const jobSet = await client.subscribe('/v1/image2video/dop', {
    input: {
      model:        'dop-turbo',
      prompt,
      input_images: [{ type: 'image_url', image_url: imageUrl }],
    },
    withPolling: true,
  });

  if (!jobSet.isCompleted) {
    throw new Error(`Higgsfield job non complété (statut: ${jobSet.status})`);
  }

  const videoUrl = jobSet.jobs?.[0]?.results?.raw?.url
    || jobSet.jobs?.[0]?.output?.url
    || jobSet.jobs?.[0]?.url;

  if (!videoUrl) throw new Error('URL vidéo absente dans la réponse Higgsfield');
  console.log(`[higgsfield] ✓ vidéo prête: ${videoUrl.slice(0, 80)}`);
  return videoUrl;
}

// Télécharger la vidéo → Buffer
function downloadVideo(url, timeout = 45_000) {
  return new Promise((resolve, reject) => {
    const mod   = url.startsWith('https') ? https : http;
    const timer = setTimeout(() => reject(new Error('download video timeout')), timeout);
    const chunks = [];
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        clearTimeout(timer);
        return resolve(downloadVideo(res.headers.location, timeout));
      }
      res.on('data', c => chunks.push(c));
      res.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

// Indique si Higgsfield est configuré dans cet environnement
function isEnabled() { return !!process.env.HIGGSFIELD_CREDENTIALS; }

module.exports = { animatePhoto, downloadVideo, isEnabled };
