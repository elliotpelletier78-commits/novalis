# Déployer Novalis en ligne

Novalis est une app Node/Express autonome qui range tout dans **un fichier
SQLite**. Déployer = lancer `node server.js` sur un hébergeur, avec un **volume
persistant** pour la base et quelques variables d'environnement.

> Règle d'or : la base SQLite doit vivre sur un **disque persistant**. Sans
> volume, chaque redéploiement repart d'une base vide (entreprises, clients,
> paiements : tout perdu).

## Prérequis (minimum vital)

```
MASTER_KEY=<64 caractères hex>        # coffre chiffré — OBLIGATOIRE
ADMIN_PASS=<mot de passe fort>        # accès au poste de commande
DATABASE_PATH=/data/novalis.db        # sur le volume persistant (voir plus bas)
```

Générer la clé maître :
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Les autres variables (Resend, OAuth Google/QuickBooks, Twilio, Stripe) sont
**optionnelles** : sans elles, les canaux concernés s'affichent « à activer »,
jamais cassés. Voir `.env.example` et `docs/BRANCHEMENT.md`.

## Railway (recommandé — config déjà en place)

Le dépôt contient déjà `railway.toml` + `Dockerfile.node` (build Docker,
healthcheck `/health`). Étapes :

1. **railway.app** → New Project → Deploy from GitHub repo → ce dépôt.
2. **Variables** : ajoutez `MASTER_KEY`, `ADMIN_PASS`, `DATABASE_PATH=/data/novalis.db`
   (+ les clés de canaux voulues).
3. **Volume** : Railway → votre service → **Volumes** → New Volume, monté sur
   **`/data`**. (C'est ce qui rend la base persistante.)
4. Déployez. Railway build le `Dockerfile.node`, démarre `node server.js`, et
   sonde `/health`.
5. Ouvrez l'URL fournie → `/login` avec `ADMIN_PASS`.

## Autres hébergeurs

- **Render / Fly.io / VPS** : même principe. Build avec `Dockerfile.node` (ou
  `node server.js` directement), montez un disque persistant, pointez
  `DATABASE_PATH` dessus, exposez `$PORT` (l'app écoute sur `process.env.PORT`,
  défaut 3000, sur `0.0.0.0`).
- **Docker local** :
  ```
  docker build -f Dockerfile.node -t novalis .
  docker run -p 3000:3000 -v novalis-data:/data \
    -e MASTER_KEY=... -e ADMIN_PASS=... -e DATABASE_PATH=/data/novalis.db novalis
  ```

## Après le déploiement

1. `/login` avec `ADMIN_PASS`.
2. **Entreprises → Nouvelle entreprise**, puis **Branchement** : identité,
   consentements, et branchez les canaux (Gmail, QuickBooks, Twilio, Stripe) —
   chacun affiche son état et ses URLs de webhook à coller.
3. Les webhooks (Twilio, Stripe) doivent pointer sur votre **URL publique** :
   ils s'affichent déjà avec le bon domaine dans l'écran Branchement.

## Notes

- **Sauvegardes** : sauvegardez périodiquement le fichier `/data/novalis.db`
  (il contient tout, chiffré pour les secrets). `SAUVEGARDE_AUTO=1` active la
  copie de sécurité interne si configurée.
- **Playwright** n'est pas installé en production (devDependencies) — inutile à
  l'exécution.
- **HTTPS** : indispensable en production (cookies de session, webhooks signés).
  Railway/Render fournissent le TLS automatiquement.
