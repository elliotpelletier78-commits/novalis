-- ══════════════════════════════════════════════════════════════════
-- Novalis — Numéro de téléphone sur un message (canal SMS).
--
-- Un message reçu par SMS (ou un appel manqué capté par Twilio) n'a pas de
-- courriel mais un numéro. On l'ajoute ici pour que le canal de RÉPONSE soit
-- choisi automatiquement : destinataire = numéro → on répond par SMS ;
-- destinataire = courriel → on répond par courriel. Rien n'est envoyé sans
-- l'approbation du commerçant, comme toujours.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE leads ADD COLUMN telephone TEXT;   -- E.164 (+1XXXXXXXXXX) pour les messages SMS / appels
