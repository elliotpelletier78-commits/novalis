-- ══════════════════════════════════════════════════════════════════
-- Novalis Branchement — la porte d'entrée : le commerçant remet ses clés.
--
-- C'est ici que « donner son entreprise à Novalis » devient concret. Une
-- entreprise branchée, c'est : son identité, son site, ses ACCÈS (dans le
-- coffre chiffré déjà bâti), et surtout ses CONSENTEMENTS explicites — ce que
-- Novalis a le droit de faire en son nom (Loi 25). Rien n'est opéré sans un
-- oui écrit.
--
-- Clé d'unification : `source` (le même identifiant que leads/taps/pulse) est
-- relié à `client_id` (coffre/jobs/budget). Tout le reste de la plateforme —
-- Réception, Pulse, Réponse, factures — se branche sur cette table.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entreprises (
  source TEXT PRIMARY KEY,               -- clé universelle (= leads.source)
  client_id INTEGER REFERENCES clients(id), -- lien coffre/jobs/budget (créé au branchement)
  nom TEXT,
  secteur TEXT,
  ville TEXT,
  telephone TEXT,
  courriel TEXT,                         -- courriel du commerce (reply-to, contact humain)
  site_url TEXT,                         -- son site (généré par nous ou existant)
  statut TEXT NOT NULL DEFAULT 'branchement'
    CHECK (statut IN ('branchement','actif','pause')),
  -- Consentements explicites. Chacun débloque une catégorie d'actions et rien
  -- de plus. Par défaut : tout à 0 (Novalis ne fait rien sans autorisation).
  consent_rediger INTEGER NOT NULL DEFAULT 0,  -- rédiger des réponses/brouillons pour moi
  consent_envoyer INTEGER NOT NULL DEFAULT 0,  -- envoyer APRÈS mon approbation
  consent_operer  INTEGER NOT NULL DEFAULT 0,  -- agir sur mes comptes connectés
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- État de chaque « clé » remise. Le SECRET lui-même ne vit JAMAIS ici : il est
-- chiffré dans le coffre (client_credentials). Cette table ne garde que l'état
-- du branchement et une étiquette lisible (ex. l'adresse du compte), pour que
-- le tableau de bord montre « Gmail : branché (garagex@gmail.com) » sans jamais
-- exposer de secret.
CREATE TABLE IF NOT EXISTS connexions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  type TEXT NOT NULL,                    -- 'courriel','google','telephonie','facturation','reseaux'
  statut TEXT NOT NULL DEFAULT 'a_brancher'
    CHECK (statut IN ('a_brancher','branche','erreur')),
  compte_label TEXT,                     -- identifiant LISIBLE (jamais le secret)
  detail TEXT,                           -- note ou message d'erreur
  maj_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, type)
);
CREATE INDEX IF NOT EXISTS idx_connexions_source ON connexions(source);
