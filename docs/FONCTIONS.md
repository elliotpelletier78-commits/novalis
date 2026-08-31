# Novalis — ce que fait le produit

Novalis est une **plateforme opérée** pour les PME du Québec : vous « remettez
les clés », Novalis prépare tout le travail dans un **poste de commande**, et
**rien ne part sans votre oui**. Honnête par construction : aucun avis, prix,
paiement ou statut n'est inventé.

## Le cœur — le poste de commande
Chaque pilote ne fait pas l'action directement : il **prépare une proposition**
(réponse, devis, avis, relance, rappel, fidélisation, publication) déposée dans
une file unique. Vous **Approuvez · Modifiez · Rejetez**. À l'approbation, si le
canal est branché et le consentement donné, c'est envoyé — sinon « à envoyer à
la main ». Jamais de faux envoi.

## Réception & réponse
- **Réception** : chaque message (formulaire de site, SMS, appel manqué) capté
  au même endroit, avec l'heure — et un drapeau « hors des heures ».
- **Réponse instantanée 24/7** : un accusé part en secondes (courriel ou SMS),
  pendant que la vraie réponse vous attend pour approbation.
- **Réponse rédigée** : le brouillon est prêt, à votre nom.

## Clients (CRM 360)
- **Fiche client** : une personne = tout son historique (messages, RDV, devis,
  paiements, photos, avis), regroupé par courriel (sinon nom), avec téléphone.
- **Dossier** : étape (pipeline), responsable assigné, notes internes privées.
- **Pipeline** : vue par étape (nouveau → contacté → gagné → perdu).
- **Photos** : avant/après, plaque, pièce — internes, recompressées.
- **Portail client** : lien signé où le client voit ses RDV, devis, paiements à
  régler, et son historique.
- **Export CSV** : portabilité des données (Loi 25).

## Devis
- Catalogue de services + prix ; composeur de soumissions (vos chiffres).
- Acceptation en ligne par le client (lien signé).
- **Devis → Demander le paiement** en un clic (lien Stripe au bon montant).

## Rendez-vous
- Carnet + rappels automatiques (par SMS si le numéro est connu, sinon courriel).
- Confirmation en ligne par le client (anti-no-show).
- **Récurrence** (aux 6 mois, etc.) : la prochaine occurrence se prépare seule.
- Réservation en ligne publique (le client demande, vous confirmez).

## Réputation
- **Demande d'avis** préparée au bon moment (avec votre lien Google), par SMS ou
  courriel.
- **Avis & témoignages** : enregistrez les vrais avis reçus, choisissez lesquels
  afficher, et intégrez le **widget** sur votre site. La note moyenne interne
  porte sur *tous* les avis (impossible à gonfler en masquant).

## Paiements
- **Demander un paiement** : page hébergée par Stripe (aucune donnée de carte
  chez nous) ; le webhook signé confirme.
- **Reçu comptant / Interac** + **Marquer payé** : encaissement hors Stripe. Le
  moyen est distingué (stripe = prouvé, manuel = déclaré).

## Marketing
- Relance des clients silencieux ; fidélisation des anciens clients gagnés ;
  composeur de publications réseaux.

## Résultats
- Relevé de valeur : contacts captés, vitesse de réponse, travail préparé,
  réputation, encaissements, résultats clients — **comptés**, jamais estimés
  (sauf la « valeur estimée », marquée comme telle).

## Nova
- L'assistant « repère » : lit les chiffres réels et propose une action concrète
  (clients qui attendent, paiements en attente, avis à afficher…). Déterministe.

## Fondations
- **Approbation avant tout envoi** + **honnêteté par construction** — ce
  qu'aucun concurrent ne fait.
- Multi-entreprises (cabinet/agence). Rôles admin / employé (lecture seule).
- Coffre chiffré pour les secrets ; Loi 25 ; PWA installable.
- Sécurité : sessions signées, jetons HMAC, signatures de webhooks (Stripe,
  Twilio) vérifiées, protection anti-XSS et anti-injection CSV, limitation de
  débit.

## Branchements (chacun « à activer » sans casser)
| Canal | Ce qu'il ajoute | Clés |
|---|---|---|
| Gmail (OAuth) | Envoi depuis la boîte du commerçant | GOOGLE_OAUTH_* |
| QuickBooks (OAuth) | Facture dans son compte | QUICKBOOKS_* |
| Twilio | SMS entrant/sortant, appel manqué | TWILIO_* |
| Stripe | Paiements en ligne | STRIPE_* |
| Resend | Envoi courriel de repli | RESEND_API_KEY |

Voir `docs/BRANCHEMENT.md` (activation) et `docs/DEPLOIEMENT.md` (mise en ligne).
