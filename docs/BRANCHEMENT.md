# Activer les branchements Gmail et QuickBooks

Ce guide explique comment **activer** les branchements pour que chaque
commerçant puisse connecter **son propre** compte Gmail et QuickBooks.

> **Important — sécurité.** Vous créez ici *une* application OAuth (celle de
> Novalis). Vous ne connectez **jamais** votre compte personnel. Chaque
> commerçant autorise ensuite **son** compte sur l'écran de Google / Intuit ;
> son jeton est rangé chiffré dans le coffre, jamais visible. Les clés
> d'application (`client_id` / `client_secret`) vont **uniquement** dans les
> variables d'environnement — jamais dans le code, jamais commitées.

Tant que ces clés sont absentes, le branchement s'affiche « à activer » dans
l'écran Branchement : rien n'est cassé, la connexion est simplement inactive.

L'URL de retour (redirect URI) suit toujours ce patron — remplacez le domaine
par le vôtre :

```
https://VOTRE-DOMAINE/core/connexion/google/callback
https://VOTRE-DOMAINE/core/connexion/quickbooks/callback
```

En développement local : `http://localhost:3000/core/connexion/google/callback`.

---

## 1. Gmail (Google Cloud Console)

1. Ouvrez **console.cloud.google.com** → créez (ou choisissez) un projet.
2. **APIs & Services → Library** → activez **Gmail API**.
3. **APIs & Services → OAuth consent screen** :
   - Type **External**, remplissez le nom de l'app, le courriel de support.
   - **Scopes** : ajoutez
     `.../auth/gmail.send` et `.../auth/gmail.readonly`
     (ce sont exactement les portées demandées par Novalis).
   - **Test users** : ajoutez l'adresse d'un commerçant pour tester avant la
     validation publique de Google.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** :
   - Type **Web application**.
   - **Authorized redirect URIs** : collez votre
     `https://VOTRE-DOMAINE/core/connexion/google/callback`.
   - Créez → copiez le **Client ID** et le **Client secret**.
5. Mettez-les en variables d'environnement :

   ```
   GOOGLE_OAUTH_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=xxxxxxxx
   ```

6. Redémarrez Novalis. Le branchement Gmail passe de « à activer » à « à
   brancher ».

> Google affiche un écran « app non vérifiée » tant que vous n'avez pas soumis
> l'app à la validation. C'est normal en phase de test (les *test users*
> passent quand même). Pour un usage large, soumettez la vérification Google.

---

## 2. QuickBooks (Intuit Developer)

1. Ouvrez **developer.intuit.com** → **My Apps → Create an app** →
   **QuickBooks Online and Payments**.
2. Dans l'app → **Keys & credentials** : vous avez deux jeux de clés,
   **Development** (sandbox) et **Production**.
   - Pour tester : utilisez les clés **Development** et mettez
     `QUICKBOOKS_ENV=sandbox`.
   - Pour du réel : clés **Production** et `QUICKBOOKS_ENV=production`.
3. **Redirect URIs** : ajoutez
   `https://VOTRE-DOMAINE/core/connexion/quickbooks/callback`.
4. Le scope utilisé est `com.intuit.quickbooks.accounting` (déjà configuré
   côté Novalis).
5. Variables d'environnement :

   ```
   QUICKBOOKS_CLIENT_ID=xxxxxxxx
   QUICKBOOKS_CLIENT_SECRET=xxxxxxxx
   QUICKBOOKS_ENV=sandbox
   ```

6. Redémarrez Novalis.

> Un compte **QuickBooks sandbox** gratuit est fourni par Intuit pour tester
> sans toucher de vraies données : **developer.intuit.com → Dashboard →
> Sandbox**.

---

## 3. Canal SMS (Twilio)

Le canal texto : messages entrants, accusé instantané, réponse par SMS depuis
le poste de commande, et **rappel d'appel manqué** (« on a manqué votre appel »).

1. Créez un compte sur **twilio.com** → achetez un numéro (Buy a Number) avec
   la capacité **SMS** (et **Voice** pour l'appel manqué).
2. **Console Twilio → Account Info** : copiez **Account SID** et **Auth Token**.
3. Variables d'environnement :

   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_FROM=+1XXXXXXXXXX     # votre numéro Twilio, format E.164
   ```

4. Redémarrez Novalis. Dans **Branchement**, le « Canal SMS (Twilio) » passe de
   « à activer » à « actif » et affiche **deux URLs de webhook** à coller dans
   Twilio :
   - **SMS entrant** → Numéro Twilio → *Messaging* → « A message comes in » →
     Webhook (POST) : collez l'URL `/sms/<votre-slug>`.
   - **Appel manqué** → Numéro Twilio → *Voice* → status callback (POST) :
     collez l'URL `/voix/<votre-slug>`.

> Sécurité : Novalis **valide la signature Twilio** (X-Twilio-Signature) de
> chaque webhook avec votre Auth Token — une requête non signée est rejetée
> (403). Rien n'est envoyé au client sans votre approbation (sauf l'accusé
> instantané, qui n'engage rien).

---

## 4. Canal Paiement (Stripe)

Demandez un paiement depuis une fiche client : Novalis crée une page de paiement
**hébergée par Stripe**. Le client paie chez Stripe — aucune donnée de carte ne
passe par Novalis (aucun fardeau PCI).

1. Créez un compte sur **stripe.com** (ou **dashboard.stripe.com** si vous en
   avez déjà un).
2. **Developers → API keys** : copiez la **Secret key** (`sk_live_…` ou
   `sk_test_…` pour tester).
3. **Developers → Webhooks → Add endpoint** :
   - Endpoint URL : collez `/paiements/<votre-slug>/webhook` (affiché dans
     Branchement).
   - Événement à écouter : **checkout.session.completed**.
   - Créez → copiez le **Signing secret** (`whsec_…`).
4. Variables d'environnement :

   ```
   STRIPE_SECRET_KEY=sk_test_…VOTRE_CLE
   STRIPE_WEBHOOK_SECRET=whsec_…VOTRE_SECRET
   ```

5. Redémarrez Novalis. Dans une fiche client, « Demander un paiement » crée un
   lien Stripe à envoyer ; dès que le client paie, le webhook signé marque la
   demande « payé ✓ ».

> Sécurité : Novalis **vérifie la signature Stripe** de chaque webhook sur le
> corps brut. Une demande n'est jamais marquée « payé » sans cette preuve.
> Utilisez les clés `sk_test_…` + un webhook de test pour valider sans argent réel.

---

## 5. Vérifier que le câblage fonctionne

1. Dans Novalis, ouvrez **Branchement** pour une entreprise.
2. Panneau **« Connexions en un clic »** → cliquez **Connecter** sur Gmail.
3. Vous êtes redirigé vers l'écran de Google → autorisez avec le compte du
   commerçant → retour automatique à Novalis (« connecté »).
4. Cliquez **Tester** : Novalis appelle vraiment Google et affiche l'adresse
   Gmail réelle + le nombre de courriels. C'est la preuve de bout en bout.
5. Même chose pour QuickBooks : **Tester** affiche le nom de l'entreprise
   telle qu'enregistrée dans QuickBooks.

À partir de là, quand vous **approuvez** une réponse dans le poste de commande
et que le Gmail du commerçant est branché, le courriel part **de sa boîte**,
avec son historique. Sinon, Novalis retombe sur l'envoi global (Resend) si
configuré, ou marque « à envoyer à la main » — **jamais de faux envoi**.

---

## Récapitulatif des variables

| Variable | Rôle | Sans elle |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | App OAuth Gmail | Branchement Gmail « à activer » |
| `QUICKBOOKS_CLIENT_ID` / `_SECRET` | App OAuth QuickBooks | Branchement QBO « à activer » |
| `QUICKBOOKS_ENV` | `sandbox` (test) ou `production` | Défaut `production` |
| `RESEND_API_KEY` | Envoi courriel de repli | Approbation « à envoyer à la main » |
| `MASTER_KEY` | Chiffre le coffre à jetons | Le coffre refuse de démarrer |

Voir `.env.example` pour la liste complète.
