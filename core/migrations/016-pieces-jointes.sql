-- ══════════════════════════════════════════════════════════════════
-- Novalis — Pièces jointes photo sur un dossier client.
--
-- Pour les métiers visuels (garage : avant/après, plaque, pièce usée ;
-- esthétique : résultat ; construction : chantier), une photo vaut mille mots
-- et sert de preuve. On les range DANS la base (BLOB), recompressées par sharp
-- (max ~1600 px, qualité ~80 %) : léger, sauvegardé avec le reste, zéro
-- dépendance de stockage externe. On migrera vers un stockage objet si le
-- volume l'exige.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pieces_jointes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- entreprise (= entreprises.source)
  cle    TEXT NOT NULL,                  -- personne : 'm:courriel' ou 'n:nom'
  nom    TEXT,                           -- nom d'origine (indicatif)
  type   TEXT NOT NULL,                  -- type MIME normalisé (image/jpeg|webp|png)
  taille INTEGER NOT NULL,               -- octets après recompression
  data   BLOB NOT NULL,                  -- l'image, recompressée
  legende TEXT,                          -- légende saisie (ex. « avant », « plaque »)
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pj ON pieces_jointes(source, cle, cree_le);
