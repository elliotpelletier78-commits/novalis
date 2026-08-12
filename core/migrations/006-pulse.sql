-- ══════════════════════════════════════════════════════════════════
-- Novalis Pulse — la mesure vivante d'un site, en respectant les gens.
--
-- Ce que personne ne donne à un commerce de quartier : savoir OÙ ses visiteurs
-- décrochent, et quoi changer. Pas Google Analytics (cookies, surveillance,
-- illisible) — une mesure PREMIÈRE-PARTIE : aucun témoin, aucune donnée
-- personnelle, session éphémère (un jeton aléatoire qui vit le temps de la
-- visite, jamais stocké chez le visiteur), IP hachée et salée, « Do Not Track »
-- respecté côté beacon. Conçu pour la Loi 25 québécoise.
--
-- Une ligne = un événement anonyme d'un visiteur. On en déduit un entonnoir de
-- conversion et le point de fuite n°1.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pulse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                 -- identifiant du site (= leads.source)
  -- Étape mesurée. Non-PII, énuméré côté serveur.
  type TEXT NOT NULL
    CHECK (type IN ('vue','section','profondeur','form_start','form_submit','tel','cta')),
  etiquette TEXT,                       -- nom de section, palier de profondeur (25/50/75/100), etc.
  session_hash TEXT NOT NULL,           -- hash(jeton de session éphémère + sel) — regroupe une visite, jamais le visiteur
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pulse_source ON pulse_events(source, created_at);
CREATE INDEX IF NOT EXISTS idx_pulse_session ON pulse_events(source, session_hash);
