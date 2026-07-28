-- Formulaires de contact reçus depuis les sites vitrines.
-- Un site démo à 10 000 $ doit avoir un formulaire qui fonctionne
-- vraiment : les soumissions atterrissent ici, et une alerte part
-- immédiatement vers le webhook configuré.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,               -- ex: 'progain'
  nom TEXT NOT NULL,
  courriel TEXT NOT NULL,
  entreprise TEXT,
  message TEXT NOT NULL,
  sujets TEXT,                        -- JSON : cases cochées
  langue TEXT,
  ip_hash TEXT,                       -- empreinte tronquée, anti-abus
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source, created_at);
