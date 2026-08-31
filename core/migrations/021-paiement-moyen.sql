-- ══════════════════════════════════════════════════════════════════
-- Novalis — Moyen de paiement (Stripe vs confirmé à la main).
--
-- Beaucoup de PME encaissent aussi comptant ou par virement Interac. Le
-- commerçant peut alors marquer une demande « payée » lui-même. On distingue
-- honnêtement le moyen : « stripe » (confirmé par le webhook signé, preuve
-- automatique) vs « manuel » (le commerçant atteste l'avoir reçu). Jamais
-- Novalis qui invente un paiement — c'est Stripe qui prouve, ou le commerçant
-- qui déclare.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE paiements ADD COLUMN moyen TEXT;   -- 'stripe' | 'manuel' (NULL tant que non payé)
