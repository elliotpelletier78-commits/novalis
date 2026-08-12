-- ══════════════════════════════════════════════════════════════════
-- Novalis Rendez-vous — le carnet + les rappels automatiques.
--
-- Pour les métiers sur rendez-vous (salon, clinique, garage), les « no-shows »
-- coûtent cher. Novalis tient le carnet et prépare un rappel au bon moment
-- (déposé dans le poste de commande, comme toute proposition) — le commerçant
-- l'approuve, le client reçoit son rappel, la case ne reste pas vide.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rendezvous (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- entreprise (= entreprises.source)
  client_nom TEXT,
  client_courriel TEXT,
  debut TEXT NOT NULL,                   -- 'YYYY-MM-DD HH:MM' (heure locale du commerce)
  service TEXT,
  note TEXT,
  statut TEXT NOT NULL DEFAULT 'prevu'
    CHECK (statut IN ('prevu','fait','annule')),
  rappel_prop_id INTEGER,                -- proposition de rappel créée (idempotence)
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rdv_source ON rendezvous(source, statut, debut);
