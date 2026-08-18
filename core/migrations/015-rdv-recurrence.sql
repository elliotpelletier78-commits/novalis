-- ══════════════════════════════════════════════════════════════════
-- Novalis Rendez-vous — récurrence (entretien régulier, contrat).
--
-- Pour les métiers d'entretien (garage : vidange aux 6 mois ; CVAC : contrat
-- saisonnier ; clinique : suivi annuel), le rendez-vous revient. Jusqu'ici il
-- fallait le ressaisir. Désormais un rendez-vous peut porter une récurrence :
-- quand il est marqué « fait », Novalis PRÉPARE automatiquement la prochaine
-- occurrence (au carnet), une seule fois. Le commerçant reste maître : il peut
-- l'annuler ou la déplacer. Rien n'est envoyé — c'est une entrée d'agenda.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE rendezvous ADD COLUMN recurrence TEXT;              -- 'hebdo'|'2sem'|'mensuel'|'3mois'|'6mois'|'annuel' ; NULL = ponctuel
ALTER TABLE rendezvous ADD COLUMN recur_gen INTEGER NOT NULL DEFAULT 0;  -- 1 = prochaine occurrence déjà générée (idempotence)
ALTER TABLE rendezvous ADD COLUMN recur_parent INTEGER;        -- id du rendez-vous d'origine (traçabilité)
