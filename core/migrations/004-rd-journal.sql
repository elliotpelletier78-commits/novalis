-- ══════════════════════════════════════════════════════════════════
-- Journal de R&D — le cahier de laboratoire qu'exigent la RS&DE et l'IRAP.
--
-- La file de jobs (jobs, job_steps, llm_calls) constitue DÉJÀ une trace
-- horodatée, au cent et à la seconde près, de chaque exécution du moteur :
-- c'est la preuve d'exécution. Ce qui manquait, c'est la couche d'INTENTION
-- scientifique : quelle hypothèse on testait, quelle métrique on mesurait,
-- la valeur avant et après, et le temps humain investi. Un conseiller
-- technique ne finance pas une intention — il finance une incertitude
-- technologique formulée, mesurée, et documentée avant/après.
--
-- Une ligne = une itération d'expérience. On la relie au job qui l'a
-- produite (job_id) quand il y en a un, pour raccrocher l'intention à la
-- preuve d'exécution correspondante.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rd_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Axe d'investigation : un identifiant court et stable qui regroupe les
  -- itérations d'une même incertitude technologique (ex. 'edition-portee-bornee',
  -- 'conformite-design', 'auto-correction-validation').
  axe TEXT NOT NULL,
  -- L'hypothèse testée, en une phrase évaluable.
  hypothese TEXT NOT NULL,
  -- Ce qu'on mesure (unité comprise) : ex. « taux de sites publiables sans
  -- revue humaine (%) », « minutes humaines par modification ».
  mesure TEXT NOT NULL,
  valeur_avant REAL,
  valeur_apres REAL,
  -- Temps humain investi sur cette itération, en heures — la variable qui
  -- décide du montant IRAP (il rembourse un pourcentage des salaires de R&D).
  heures REAL NOT NULL DEFAULT 0,
  -- Résultat : l'incertitude a-t-elle avancé ? conclu ? échoué (un échec
  -- documenté est admissible et même précieux en RS&DE).
  resultat TEXT NOT NULL DEFAULT 'en_cours'
    CHECK (resultat IN ('en_cours', 'progres', 'concluant', 'echec')),
  notes TEXT,
  -- Rattachement optionnel à la preuve d'exécution.
  job_id INTEGER REFERENCES jobs(id),
  client_id INTEGER REFERENCES clients(id),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rd_axe ON rd_journal(axe, cree_le);
CREATE INDEX IF NOT EXISTS idx_rd_date ON rd_journal(cree_le);
