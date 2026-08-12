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

## Le parcours, bout à bout

```
Branchement ──▶ Aujourd'hui ──▶ Poste de commande ──▶ (envoi après oui)
   (les clés)     (un écran)        (Approuver)
       │              │                  ▲
       │              ├── Réception ──────┘ (chaque contact capté)
       │              ├── Devis ──────────┘ (soumissions préparées)
       │              └── Pulse ───────────  (où ça décroche)
```

| Surface | URL | Rôle |
|---|---|---|
| **Branchement** | `/core/branchement?source=<site>` | Le commerçant remet ses clés : identité, connexions (coffre chiffré), consentements (Loi 25). Calcule « prêt à opérer % ». |
| **Aujourd'hui** | `/core/aujourdhui?source=<site>` | Le seul écran du matin. Agrège : à approuver, contacts, en attente, prêt à opérer, la fuite Pulse n°1. |
| **Poste de commande** | `/core/propositions?source=<site>` | La file d'approbation. Réponses, avis, devis — Approuver / Modifier / Rejeter. |
| **Réception** | `/core/reception?source=<site>` | Chaque contact (message + clic tél) capté, chronométré, compté. Contient l'entonnoir Pulse. |
| **Devis** | `/core/devis?source=<site>` | Catalogue de services + composeur de soumissions. |
| **Rapport mensuel** | `/r/<source>/<jeton>` | Rapport client, URL signée, sans compte. |
| **Exploitation** | `/core/admin` | File de jobs, steps, coûts IA (interne). |
| **Santé** | `/core/health` | Profondeur de file (public, pour un moniteur externe). |

Toutes les routes `/core/*` (sauf `/health`) exigent l'authentification admin
(`x-admin-pass` ou `?pass=`).

---

## Les pilotes de la file d'approbation

| Type | Déclencheur | Ce que Novalis prépare |
|---|---|---|
| `reponse` | Un client écrit (formulaire du site) | Un accusé de réception rédigé, personnalisé, signé au nom du commerce. |
| `avis` | Un lead passe à « gagné » | Une demande d'avis chaleureuse (avec le lien Google s'il est branché). |
| `devis` | Le commerçant compose une soumission | Un devis assemblé à partir de ses services/prix, total calculé. |

**À venir** (même file, un `type` de plus) : publications réseaux sociaux,
rappels de rendez-vous, ménage de courriel.

L'envoi n'a lieu que si l'entreprise a **consenti à l'envoi** ET que le
**courriel est branché**. Sinon la proposition est « approuvée — à envoyer à la
main ». Un échec d'envoi devient un statut « echec » explicite.

---

## Brancher un vrai client (déroulé)

1. **Générer/relier son site** — son `source` (slug) est la clé de tout.
2. **`/core/branchement?source=<slug>`** — remplir l'identité, brancher le
   courriel du commerce, cocher les consentements (« rédiger », « envoyer »).
3. **`/core/devis?source=<slug>`** — saisir ses services et prix (facultatif).
4. C'est tout. Dès qu'un client écrit sur son site, une réponse l'attend dans
   **Aujourd'hui**. Après un job gagné, une demande d'avis apparaît.

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
