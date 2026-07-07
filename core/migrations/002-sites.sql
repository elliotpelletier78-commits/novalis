-- Sites générés/gérés par le moteur IA (Novalis Studio).
-- Un site appartient à un client (multi-tenant) et pointe vers un
-- fichier output/{slug}.html servi sous /demo/{slug}.html.
-- Les modifications par chat créent des sauvegardes dans
-- output/versions/ — la table ne garde que l'état courant.
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  slug TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '{}',   -- JSON : le brief d'origine
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','archive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_id, updated_at);
