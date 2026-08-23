-- ══════════════════════════════════════════════════════════════════
-- Novalis — Avis & témoignages (réputation affichée honnêtement).
--
-- Novalis DEMANDE déjà des avis (proposition « avis »). Ici on ferme la boucle :
-- le commerçant enregistre les VRAIS avis reçus (Google, Facebook, courriel, en
-- personne), choisit lesquels afficher, et obtient un widget à intégrer sur son
-- site. Règle absolue, cohérente avec la page Confiance : RIEN n'est inventé —
-- chaque témoignage est saisi par le commerçant à partir d'un avis réel, avec sa
-- provenance. La moyenne n'est calculée que sur de vraies notes.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS temoignages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- entreprise (= entreprises.source)
  auteur TEXT NOT NULL,                  -- nom du client (tel qu'il l'a laissé)
  note INTEGER,                          -- 1..5 (facultatif — certains avis n'ont pas d'étoiles)
  texte TEXT NOT NULL,                   -- le contenu de l'avis, tel quel
  provenance TEXT,                       -- 'google' | 'facebook' | 'courriel' | 'direct'
  cle TEXT,                              -- personne rattachée (optionnel : 'm:courriel'/'n:nom')
  affiche INTEGER NOT NULL DEFAULT 1,    -- 1 = montré sur le widget public
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_temo ON temoignages(source, affiche, cree_le);
