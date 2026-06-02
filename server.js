const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use('/sites', express.static(path.join(__dirname, 'output')));

// Page d'accueil — liste tous les sites générés
app.get('/', (req, res) => {
  const outputDir = path.join(__dirname, 'output');
  let files = [];
  if (fs.existsSync(outputDir)) {
    files = fs.readdirSync(outputDir).filter(f => f.endsWith('.html'));
  }
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Novalis IA — Aperçus</title>
  <style>body{font-family:system-ui,sans-serif;background:#07090F;color:#F1F5FF;padding:40px;max-width:800px;margin:0 auto}
  h1{font-size:32px;margin-bottom:8px}p{color:#94A3B8;margin-bottom:32px}
  .list{display:flex;flex-direction:column;gap:12px}
  .item{background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center}
  .item a{color:#3B82F6;text-decoration:none;font-weight:600}
  .item a:hover{text-decoration:underline}
  .empty{color:#4B5563;font-style:italic}</style></head><body>
  <h1>Novalis IA</h1><p>Sites de démonstration générés</p>
  <div class="list">${files.length === 0
    ? '<div class="empty">Aucun site généré pour l\'instant.</div>'
    : files.map(f => {
        const name = f.replace('.html', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `<div class="item"><span>${name}</span><a href="/sites/${f}" target="_blank">Voir l'aperçu →</a></div>`;
      }).join('')
  }</div></body></html>`);
});

// API pour recevoir les données et générer un site
app.post('/generate', async (req, res) => {
  try {
    const { generate } = require('./generate');
    const result = await generate(req.body);
    res.json({ success: true, url: `/sites/${result.slug}.html`, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Novalis IA en ligne sur le port ${PORT}`));
