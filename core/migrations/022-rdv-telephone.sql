-- ══════════════════════════════════════════════════════════════════
-- Novalis — Téléphone du client sur un rendez-vous (rappel par SMS).
--
-- Le rappel de rendez-vous partait toujours par courriel. Si le client a laissé
-- un numéro, le rappel peut partir par SMS (bien plus lu) : on met le numéro
-- comme destinataire de la proposition « rappel » ; le canal choisit alors le
-- SMS automatiquement. Toujours après l'approbation du commerçant.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE rendezvous ADD COLUMN client_telephone TEXT;   -- pour le rappel par SMS
