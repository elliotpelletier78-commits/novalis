-- ══════════════════════════════════════════════════════════════════
-- Horodatage du moment où un lead devient un client GAGNÉ.
--
-- La fidélisation doit viser « clients gagnés il y a 6 à 18 mois » — pas
-- « leads arrivés il y a 6 à 18 mois ». created_at = date d'acquisition ;
-- gagne_le = date où on a gagné le client. Sans cette colonne, on relançait
-- un client tout juste servi (dont le lead était vieux). On filtre désormais
-- sur gagne_le.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE leads ADD COLUMN gagne_le TEXT;
