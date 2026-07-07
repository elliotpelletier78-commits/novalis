-- ══════════════════════════════════════════════════════════════════
-- Noyau Novalis — schéma multi-tenant, file de jobs, coûts LLM, coffre
-- Décision d'architecture : single-database + row-level tenancy.
-- Chaque table métier porte client_id NOT NULL ; l'isolation est
-- appliquée par la couche repository (jamais de SQL direct en route).
-- À <10 clients, schema-per-tenant serait de la sur-ingénierie.
-- ══════════════════════════════════════════════════════════════════

-- Les clients de Novalis. id=1 réservé à Novalis elle-même : sa propre
-- prospection consomme la même infrastructure que les clients payants.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','pause','archive')),
  -- Plafond budgétaire IA mensuel en cents CAD. NULL = illimité (réservé
  -- au tenant interne). Le dépassement bloque les appels LLM (hard stop).
  budget_llm_cents_mois INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO clients (id, nom, statut, budget_llm_cents_mois)
  VALUES (1, 'Novalis (interne)', 'actif', NULL);

-- File de jobs. Décision : la queue vit DANS la base métier — un step
-- qui écrit un résultat ET marque le job avancé est une seule
-- transaction, chose impossible avec un broker externe (Redis).
-- Contrainte assumée : un seul processus worker (1 replica Railway).
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                 -- nom du pipeline (registre du worker)
  client_id INTEGER NOT NULL REFERENCES clients(id),
  payload TEXT NOT NULL DEFAULT '{}', -- JSON : paramètres d'entrée du run
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  priority INTEGER NOT NULL DEFAULT 0,      -- plus grand = plus urgent
  run_at TEXT NOT NULL DEFAULT (datetime('now')), -- backoff = repousser run_at
  dedupe_key TEXT,                    -- idempotence des schedules
  locked_at TEXT,                     -- heartbeat du worker
  error_text TEXT,
  output TEXT,                        -- JSON : résultat final du pipeline
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedupe
  ON jobs(type, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, run_at, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id, created_at);

-- Trace de chaque step d'un pipeline : c'est ici qu'on répond à
-- « où exactement cette automatisation a-t-elle échoué ? » et qu'on
-- reprend un run au step raté sans repayer les steps réussis.
CREATE TABLE IF NOT EXISTS job_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  step_name TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','done','failed')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  error_text TEXT,
  output TEXT                          -- JSON : sortie du step (réutilisée au requeue)
);
CREATE INDEX IF NOT EXISTS idx_steps_job ON job_steps(job_id, id);

-- Comptabilité LLM : une ligne par appel, rollup par client.
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  job_id INTEGER REFERENCES jobs(id),
  step_name TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cout_cents REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_llm_client_mois ON llm_calls(client_id, created_at);

-- Coffre à credentials — envelope encryption à deux niveaux :
-- une DEK AES-256 par client (générée aléatoirement), elle-même
-- chiffrée (wrappée) par la clé maître qui ne vit QUE dans la
-- variable d'environnement Railway MASTER_KEY. Compromission de la
-- base seule = inutilisable ; rotation de la master key = re-wrap
-- des DEK sans retoucher les credentials.
CREATE TABLE IF NOT EXISTS client_deks (
  client_id INTEGER PRIMARY KEY REFERENCES clients(id),
  dek_wrapped BLOB NOT NULL,          -- DEK chiffrée par MASTER_KEY (GCM: iv|tag|ct)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS client_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,                 -- ex: 'google_business_api_key'
  ciphertext BLOB NOT NULL,           -- valeur chiffrée par la DEK du client (GCM: iv|tag|ct)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, name)
);
