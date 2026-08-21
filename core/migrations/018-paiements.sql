-- ══════════════════════════════════════════════════════════════════
-- Novalis — Demandes de paiement (Stripe).
--
-- Le commerçant demande un paiement (montant + description) ; Novalis crée une
-- page de paiement hébergée par Stripe et garde ici la trace. Le statut passe
-- à « paye » UNIQUEMENT sur confirmation du webhook signé de Stripe — jamais
-- « payé » sans preuve. Aucune donnée de carte n'est stockée (Stripe héberge
-- tout le paiement).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                  -- entreprise (= entreprises.source)
  cle    TEXT,                           -- personne rattachée : 'm:courriel' / 'n:nom' (optionnel)
  description TEXT NOT NULL,             -- ce qui est facturé
  montant_cents INTEGER NOT NULL,        -- montant demandé
  devise TEXT NOT NULL DEFAULT 'cad',
  courriel TEXT,                         -- courriel du client (pré-rempli au checkout)
  statut TEXT NOT NULL DEFAULT 'demande' -- 'demande' | 'paye' | 'annule'
    CHECK (statut IN ('demande','paye','annule')),
  session_id TEXT,                       -- id de session Stripe Checkout
  url TEXT,                              -- lien de paiement à envoyer au client
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  paye_le TEXT
);
CREATE INDEX IF NOT EXISTS idx_paie ON paiements(source, statut, cree_le);
CREATE INDEX IF NOT EXISTS idx_paie_session ON paiements(session_id);
