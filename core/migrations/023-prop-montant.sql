-- ══════════════════════════════════════════════════════════════════
-- Novalis — Montant sur une proposition (devis chiffré → paiement).
--
-- Le total d'un devis était calculé mais pas conservé. On le range ici pour
-- fermer la boucle « devis accepté → demander le paiement » en un clic, avec le
-- bon montant pré-rempli. NULL quand le devis n'est pas entièrement chiffré
-- (postes « sur devis ») — on ne devine jamais un montant.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE propositions ADD COLUMN montant_cents INTEGER;   -- total chiffré (devis), sinon NULL
