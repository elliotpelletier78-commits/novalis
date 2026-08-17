-- Confirmation client d'un rendez-vous (le client confirme ou demande à reporter
-- en un clic depuis le rappel). Levier anti-no-show (+26 % de confirmations).
ALTER TABLE rendezvous ADD COLUMN client_reponse TEXT;      -- 'confirme' | 'reporter' | NULL
ALTER TABLE rendezvous ADD COLUMN client_reponse_le TEXT;   -- horodatage ISO
