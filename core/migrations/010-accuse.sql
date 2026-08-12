-- ══════════════════════════════════════════════════════════════════
-- Novalis Réponse Instantanée — l'accusé de réception 24/7.
--
-- La vitesse de réponse est le tueur de conversion n°1 des PME : un client sans
-- nouvelle part chez le concurrent. Le commerçant ne peut pas répondre en 30
-- secondes (il travaille) — Novalis le fait pour lui, à sa voix, sans rien
-- promettre de précis (aucun prix, aucun délai chiffré). Sûr à envoyer sans
-- approbation, parce que ça n'engage rien. La vraie réponse rédigée attend quand
-- même dans le poste de commande.
--
-- Opt-in : un consentement dédié. On garde la preuve (accuse_le) pour montrer au
-- commerçant combien de clients ont eu une réponse instantanée, même hors heures.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE entreprises ADD COLUMN consent_accuse INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN accuse_le TEXT;  -- quand l'accusé instantané a été envoyé
