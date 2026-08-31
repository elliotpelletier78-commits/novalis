-- ══════════════════════════════════════════════════════════════════
-- Novalis — Lien d'avis (Google/Facebook) de l'entreprise.
--
-- La proposition « demander un avis » sait déjà inclure un lien (cfg.lienAvis)
-- pour que le client laisse son avis en un clic — mais rien ne le stockait.
-- Le commerçant colle ici son lien d'avis Google (ou autre) ; Novalis l'insère
-- dans la demande d'avis. Sans lien, le message reste générique (jamais cassé).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE entreprises ADD COLUMN lien_avis TEXT;   -- URL publique où laisser un avis (Google, etc.)
