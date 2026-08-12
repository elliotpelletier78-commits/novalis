-- ══════════════════════════════════════════════════════════════════
-- Novalis Réception — la couche qui capture chaque client et prouve la valeur.
--
-- Le site web est un achat ponctuel. Réception est le produit RÉCURRENT :
-- chaque contact (formulaire OU clic sur le téléphone) est capturé, chronométré,
-- et compté. À la fin du mois, le commerçant voit trois nombres RÉELS —
-- contacts reçus, combien hors des heures d'ouverture, valeur estimée — au lieu
-- de perdre des clients dans le noir. C'est ce qui rend l'abonnement indispensable.
-- ══════════════════════════════════════════════════════════════════

-- On enrichit la table leads existante avec le cycle de vie commercial.
-- (SQLite : un ALTER par colonne ; ignoré si la colonne existe déjà via le
--  runner de migrations qui applique chaque fichier une seule fois.)
ALTER TABLE leads ADD COLUMN statut TEXT NOT NULL DEFAULT 'nouveau';
ALTER TABLE leads ADD COLUMN valeur_cents INTEGER;      -- valeur estimée de ce client
ALTER TABLE leads ADD COLUMN repondu_le TEXT;           -- quand le proprio a répondu (→ délai de réponse)
ALTER TABLE leads ADD COLUMN hors_heures INTEGER NOT NULL DEFAULT 0; -- 1 = reçu hors des heures d'ouverture
ALTER TABLE leads ADD COLUMN notes TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_statut ON leads(source, statut, created_at);

-- Clics sur les canaux de contact (téléphone, bouton d'appel) — l'autre moitié
-- des contacts, invisible jusqu'ici. Un clic « appeler » depuis le site EST une
-- intention d'achat, même si aucun formulaire n'est rempli.
CREATE TABLE IF NOT EXISTS taps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                 -- identifiant du site (= leads.source)
  canal TEXT NOT NULL DEFAULT 'tel'     -- 'tel' | 'cta' | 'courriel'
    CHECK (canal IN ('tel','cta','courriel')),
  hors_heures INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,                         -- empreinte tronquée, anti-double-comptage
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_taps_source ON taps(source, cree_le);

-- Configuration par site : valeur d'un client capté (pour chiffrer la valeur
-- récupérée) et heures d'ouverture (pour classer « hors heures »). Un jeton de
-- rapport signé permet au commerçant de consulter son rapport mensuel via une
-- URL privée non devinable, sans compte à créer.
CREATE TABLE IF NOT EXISTS reception_config (
  source TEXT PRIMARY KEY,
  secteur TEXT,
  valeur_lead_cents INTEGER NOT NULL DEFAULT 30000, -- 300 $ par client capté, défaut prudent
  -- Heures d'ouverture en JSON : { "1":[8,18], ... "0":null }  (0=dimanche),
  -- fuseau America/Montreal. NULL/absent = défaut lun-ven 8-18, sam 9-13.
  heures_json TEXT,
  nom_commerce TEXT,
  rapport_token TEXT,                   -- jeton d'accès au rapport mensuel (URL signée)
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
