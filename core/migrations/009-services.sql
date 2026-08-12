-- ══════════════════════════════════════════════════════════════════
-- Novalis Devis — le catalogue de services d'une entreprise, pour préparer
-- des soumissions en un clic. Le commerçant définit ses services et prix une
-- fois ; ensuite Novalis assemble un devis propre à approuver.
--
-- On reste honnête : un prix peut être « sur devis » (NULL), les taxes sont en
-- sus, et un devis est une SOUMISSION (estimation) — jamais une facture émise.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- entreprise (= entreprises.source)
  nom TEXT NOT NULL,
  prix_cents INTEGER,                    -- prix unitaire en cents CAD ; NULL = « sur devis »
  unite TEXT,                            -- ex. 'unité', 'heure', 'pied²', 'forfait'
  actif INTEGER NOT NULL DEFAULT 1,
  ordre INTEGER NOT NULL DEFAULT 0,      -- ordre d'affichage
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_services_source ON services(source, actif, ordre, id);
