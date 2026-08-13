# Novalis — la plateforme opérée

> « Le commerçant remet les clés de son entreprise à Novalis, qui l'amène à un
> autre niveau — dans un seul endroit, automatisé, sans jamais rien envoyer
> sans son oui. »

Ce document est la carte de la plateforme : les surfaces, comment elles
s'enchaînent, les URL, les variables d'environnement, et comment brancher un
vrai client.

---

## Le principe

Chaque capacité (répondre, demander un avis, faire un devis…) ne fait **pas**
l'action directement : elle **prépare une proposition** qui atterrit dans une
seule file. Le commerçant ouvre son poste de commande et décide :
**Approuver · Modifier · Rejeter.** Rien ne part sans son oui.

Tout est **honnête par construction** : aucun avis inventé, aucun prix ou délai
promis à faux, aucune taxe calculée à sa place, jamais de « envoyé » quand ce ne
l'est pas. Les intégrations pas encore prêtes sont marquées « bientôt ».

---

## Nova — l'assistant

**Nova** veille sur chaque entreprise. Elle **repère** (observations classées
urgent / occasion / info, chacune avec l'action concrète), **répond** (chat : en
mode conversation avec une clé IA, sinon repli honnête sur ses observations), et
**agit** (commandes déterministes depuis le chat : « approuve la réponse à Luc »,
« active la réponse instantanée » — jamais d'action inventée par l'IA ; une
question ou une négation n'exécute rien).

## Le parcours, bout à bout

```
Entreprises ─▶ Branchement ─▶ Aujourd'hui (Nova) ─▶ Poste de commande ─▶ (envoi après oui)
  (le hub)       (les clés)      (un écran)             (Approuver)
                                     │                       ▲
                                     ├── Réception ──────────┘ (chaque contact capté + Pulse)
                                     ├── Rendez-vous ────────┘ (carnet + rappels)
                                     ├── Devis ──────────────┘ (soumissions)
                                     └── Publications ───────┘ (réseaux)
```

| Surface | URL | Rôle |
|---|---|---|
| **Entreprises** | `/core/entreprises` (ou `/core`) | Hub d'agence : tous les commerces, triés par attention ; crée une nouvelle entreprise. |
| **Aujourd'hui** | `/core/aujourdhui?source=<site>` | L'écran du matin. Panneau Nova + signaux (à approuver, contacts, en attente, prêt %) + fuite Pulse. |
| **Poste de commande** | `/core/propositions?source=<site>` | La file d'approbation (7 types). Approuver / Modifier / Rejeter. |
| **Réception** | `/core/reception?source=<site>` | Chaque contact capté, vitesse de réponse, preuve Réponse Instantanée, entonnoir Pulse. Export CSV. |
| **Rendez-vous** | `/core/rdv?source=<site>` | Carnet + rappels automatiques (heure de Montréal). |
| **Devis** | `/core/devis?source=<site>` | Catalogue de services + composeur de soumissions. |
| **Publications** | `/core/publications?source=<site>` | Composeur de publications réseaux (le commerçant fournit l'essentiel). |
| **Branchement** | `/core/branchement?source=<site>` | Identité, connexions (coffre chiffré), consentements (Loi 25). « Prêt à opérer % ». |
| **Espace commerçant** | `/e/<source>/<jeton>` | Lien magique signé : le client approuve lui-même, sans mot de passe (isolé par entreprise). |
| **Rapport mensuel** | `/r/<source>/<jeton>` | Rapport client, URL signée, sans compte. |
| **Exploitation** | `/core/admin` | File de jobs, steps, coûts IA (interne). |
| **Santé** | `/core/health` | Profondeur de file (public, pour un moniteur externe). |

Toutes les routes `/core/*` (sauf `/health`) exigent l'authentification admin
(`x-admin-pass` ou `?pass=`). Interface : coquille SaaS indigo (barre latérale,
recherche in-page, accessibilité clavier), assistant Nova flottant sur chaque écran.

---

## Les 7 pilotes de la file d'approbation

| Type | Déclencheur | Ce que Novalis prépare |
|---|---|---|
| `reponse` | Un client écrit (formulaire du site) | Une réponse rédigée, personnalisée, signée au nom du commerce. |
| `avis` | Un lead passe à « gagné » | Une demande d'avis chaleureuse (lien Google si branché), sans incitatif. |
| `devis` | Le commerçant compose une soumission | Un devis assemblé (services/prix, total, taxes en sus). |
| `relance` | Un lead ouvert reste silencieux > 3 jours | Une relance douce (à l'ouverture du tableau de bord). |
| `rappel` | Un rendez-vous approche (< 48 h) | Un rappel au client (réduit les no-shows). |
| `fidelisation` | Un client gagné il y a 6 à 18 mois | Une invitation à revenir, adaptée au métier. |
| `publication` | Le commerçant prépare un message | Une publication réseaux mise en forme (substance fournie par lui). |

En plus : **Réponse Instantanée 24/7** — dès qu'un client écrit, un accusé part
immédiatement (opt-in), sans rien promettre. Distinct de la réponse rédigée.

L'envoi n'a lieu que si l'entreprise a **consenti à l'envoi**, que le **courriel
est branché** ET qu'une **adresse de réponse** existe. Sinon : « approuvé — à
envoyer à la main ». Un échec d'envoi devient un statut « echec » explicite.

---

## Brancher un vrai client (déroulé)

1. **`/core/entreprises`** — « Nouvelle entreprise » : identifiant (slug) + nom.
2. **`/core/branchement?source=<slug>`** — identité, brancher le courriel du
   commerce, cocher les consentements (« rédiger », « envoyer », « accusé 24/7 »).
3. **`/core/devis?source=<slug>`** — saisir ses services et prix (facultatif).
4. **Transmettre le lien magique** affiché dans le poste de commande pour qu'il
   approuve lui-même.
5. C'est tout. Dès qu'un client écrit, une réponse l'attend dans **Aujourd'hui**.
   Job gagné → demande d'avis ; lead silencieux → relance ; RDV proche → rappel ;
   ancien client → invitation à revenir.

---

## Variables d'environnement

| Variable | Rôle | Requis |
|---|---|---|
| `ADMIN_PASS` | Mot de passe des surfaces `/core/*` | Oui |
| `MASTER_KEY` | Clé maître du coffre (64 hex). Chiffre les accès clients. | Oui (coffre) |
| `DATABASE_PATH` | Chemin SQLite (volume persistant en prod) | Recommandé |
| `RESEND_API_KEY` | Envoi de courriels (réponses, avis, devis, alertes) | Pour l'envoi |
| `MAIL_FROM` | Expéditeur des courriels client (défaut : `Novalis <reponse@novalisia.ca>`) | Non |
| `ALERT_WEBHOOK_URL` | Alerte Discord/Slack sur nouveau contact | Non |
| `RESEND_API_KEY` + `ALERT_EMAIL_TO` | Alerte courriel à l'opérateur | Non |

Sans `RESEND_API_KEY`, la plateforme fonctionne en **mode sans envoi** : tout se
prépare et s'approuve, mais les courriels sont « à envoyer à la main » — jamais
de faux envoi.

---

## Mettre en ligne (checklist d'activation)

Le code est prêt ; ces réglages (côté Railway) activent les capacités réelles.

**Envoi réel des courriels** (Réponse Instantanée, réponses/avis/devis approuvés)
1. Créer un compte Resend, générer une clé → variable `RESEND_API_KEY`.
2. Vérifier le domaine `novalisia.ca` dans Resend (enregistrements SPF + DKIM chez
   le registraire) — sans domaine vérifié, Resend refuse d'envoyer.
3. `MAIL_FROM` = ex. `Novalis <reponse@novalisia.ca>` (facultatif ; défaut fourni).
Sans clé, tout se prépare et s'approuve mais reste « à envoyer à la main » —
jamais de faux « envoyé ».

**Nova conversationnelle** (le chat qui répond en langage naturel)
- `ANTHROPIC_API_KEY` = clé Anthropic. Le même moteur alimente aussi la
  génération de sites bespoke. Sans clé, Nova répond quand même avec ses
  observations déterministes (et peut déjà AGIR : approuver, activer un réglage).
- Le coût est compté par client et plafonné (`clients.budget_llm_cents_mois`).

**Alertes opérateur** (facultatif) : `ALERT_WEBHOOK_URL` (Discord/Slack) et/ou
`RESEND_API_KEY` + `ALERT_EMAIL_TO`.

## Confidentialité (Loi 25)

- **Pulse** : mesure première-partie, aucun témoin, aucune donnée personnelle,
  jeton de session éphémère jamais stocké chez le visiteur, « Do Not Track »
  respecté.
- **Coffre** : chiffrement à deux niveaux (DEK par client, wrappée par
  `MASTER_KEY`). Les secrets ne sont jamais relisibles via HTTP ni journalisés.
- **Consentements** : à 0 par défaut. Novalis ne fait rien sans autorisation
  explicite, débranchable à tout moment.

---

## Tests & qualité

```bash
npx vitest run          # suite complète
npx eslint core/ tests/ server.js generate.js
```

Chaque pilote a ses tests, dont des tests d'**honnêteté** (échouent si un avis
est inventé, un prix promis, ou une taxe calculée). Vérifier sur serveur réel
avant de conclure : démarrer `node server.js` avec un `DATABASE_PATH` temporaire.
