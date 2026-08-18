-- ══════════════════════════════════════════════════════════════════
-- Novalis Clients v2 — le dossier client PERSISTANT.
--
-- La fiche client (core/clients.js) regroupe déjà messages + rendez-vous +
-- devis par personne, mais tout était CALCULÉ : impossible d'y ajouter une
-- note, de fixer une étape à la main, ou d'assigner la personne à un employé.
--
-- Cette table donne à chaque personne (clé stable : courriel, sinon nom) un
-- vrai dossier où le commerçant écrit. Rien n'est inventé : ces champs sont
-- SAISIS par le commerçant. Le statut ici, s'il est présent, PRIME sur le
-- statut déduit des leads (étape choisie à la main dans le pipeline).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_dossiers (
  source TEXT NOT NULL,                 -- entreprise (= entreprises.source)
  cle    TEXT NOT NULL,                 -- clé de personne : 'm:courriel' ou 'n:nom'
  statut TEXT,                          -- étape choisie à la main ; NULL = auto (déduit)
  notes  TEXT,                          -- notes internes du commerçant
  assigne TEXT,                         -- nom de l'employé responsable
  maj_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, cle)
);
