-- ══════════════════════════════════════════════════════════════════
-- Novalis Propositions — « Novalis a déjà fait le travail, vous dites oui ».
--
-- Le cœur de la plateforme opérée. Chaque pilote (réponses, devis, avis,
-- publications) ne fait pas l'action directement : il PRÉPARE une proposition
-- qui atterrit dans une seule file. Le commerçant ouvre son poste de commande
-- et, pour chaque proposition, décide : Approuver · Modifier · Rejeter.
-- Rien ne part sans son oui.
--
-- Première proposition branchée : la réponse rédigée à un nouveau message
-- (ref_type='lead'). Les prochaines (facture, avis…) sont juste un `type` de
-- plus dans la même table.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS propositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- entreprise concernée (= entreprises.source)
  type TEXT NOT NULL,                    -- 'reponse' | (à venir) 'facture','avis','publication'
  ref_type TEXT,                         -- ce à quoi ça se rapporte, ex. 'lead'
  ref_id INTEGER,                        -- id de l'objet source, ex. leads.id
  titre TEXT NOT NULL,                   -- résumé une ligne pour le feed
  apercu TEXT,                           -- contexte lisible (ex. le message reçu)
  brouillon TEXT NOT NULL,               -- le contenu rédigé, MODIFIABLE avant envoi
  destinataire TEXT,                     -- à qui l'action irait (ex. courriel du client)
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','approuve','rejete','envoye','echec')),
  priorite INTEGER NOT NULL DEFAULT 0,   -- plus grand = plus haut dans le feed
  detail TEXT,                           -- note d'exécution / message d'erreur
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le  TEXT NOT NULL DEFAULT (datetime('now')),
  traite_le TEXT                         -- quand approuvé/rejeté/envoyé
);
CREATE INDEX IF NOT EXISTS idx_prop_feed ON propositions(source, statut, priorite, id);

-- Idempotence : un objet source (un lead donné) ne génère qu'UNE proposition
-- d'un type donné, même si l'événement est rejoué.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_ref
  ON propositions(type, ref_type, ref_id) WHERE ref_id IS NOT NULL;
