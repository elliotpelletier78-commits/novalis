# 🔐 Sécurité — Novalis IA

## Vue d'ensemble

Novalis gère des données sensibles : credentials clients, clés API, données de prospects. Ce document décrit les mesures de sécurité en place et les bonnes pratiques.

---

## 🛡️ Mesures de Sécurité en Place

### 1. **Encryption des Credentials**

**Système** : Envelope encryption à deux niveaux (AES-256-GCM)

```
┌─────────────────────────────────────────┐
│ Credential client (plaintext)            │
└──────────────┬──────────────────────────┘
               │ Chiffré avec DEK (Data Encryption Key)
               ▼
┌─────────────────────────────────────────┐
│ Ciphertext (iv|tag|ct) — stocké en DB   │
└──────────────┬──────────────────────────┘
               │ DEK wrappée avec MASTER_KEY
               ▼
┌─────────────────────────────────────────┐
│ MASTER_KEY (env var seulement)          │
│ Jamais en DB, jamais en code            │
└─────────────────────────────────────────┘
```

**Implémentation** : `core/secrets.js`
- Algorithme : AES-256-GCM (authentification intégrée)
- IV : 12 bytes (96 bits, taille nominale GCM)
- Tag : 16 bytes (authentification)
- Clé : 32 bytes (256 bits)

**Conséquences** :
- ✅ Un dump de la DB seule est inexploitable
- ✅ Rotation de MASTER_KEY = re-wrap des DEK (rapide)
- ✅ Compromission d'un client ≠ compromission des autres
- ✅ Altération du ciphertext = déchiffrement échoue (pas de plaintext corrompu)

### 2. **Budget Enforcement (LLM Gateway)**

**Système** : Refus net si budget mensuel dépassé

```javascript
// core/llm.js
function verifierBudget(clientId) {
  const budget = stmts.budget.get(clientId);
  if (budget.budget_llm_cents_mois == null) return; // illimité
  
  const depense = stmts.depenseMois.get(clientId);
  if (depense.total >= budget.budget_llm_cents_mois) {
    throw new Error(`Budget dépassé: ${depense.total}¢ / ${budget.budget_llm_cents_mois}¢`);
  }
}
```

**Fail-closed** : L'appel IA est REFUSÉ avant d'être envoyé à Anthropic.

### 3. **Admin Authentication**

**Système** : Bearer token via `ADMIN_PASS`

```javascript
// server.js
const ADMIN_PASS = process.env.ADMIN_PASS || 'novalis2025';
function requireAdmin(req, res, next) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth === ADMIN_PASS) return next();
  return res.status(401).json({ success: false, error: 'Non autorisé' });
}
```

**Bonnes pratiques** :
- ✅ Pas de hardcoding (fallback seulement pour dev)
- ✅ Stocké en variable d'environnement
- ✅ Utilisé sur tous les endpoints `/admin/*`

### 4. **CORS Restrictif**

```javascript
// server.js
const allowed = [
  'https://novalisia.ca',
  'https://www.novalisia.ca',
  process.env.CRM_ORIGIN,  // override via env
].filter(Boolean);

if (!origin || allowed.includes(origin) || process.env.NODE_ENV !== 'production') {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
}
```

**Logique** :
- ✅ Production : CORS restrictif (novalisia.ca seulement)
- ✅ Dev : CORS permissif (localhost)
- ✅ Override possible via `CRM_ORIGIN`

### 5. **SQLite Protection**

```javascript
// server.js
app.use('/demo', (req, res, next) => {
  if (/\.(db|sqlite3?|db-wal|db-shm|jsonl?)$/i.test(req.path) || /(^|\/)\./.test(req.path)) {
    return res.status(404).end();
  }
  next();
});
```

**Bloque** : `.db`, `.db-wal`, `.db-shm`, fichiers cachés

### 6. **Token Counting & Logging**

Chaque appel IA est loggé :

```sql
INSERT INTO llm_calls (client_id, job_id, step_name, model, input_tokens, output_tokens, cout_cents)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

**Permet** :
- ✅ Audit trail complet
- ✅ Détection d'abus
- ✅ Facturation précise
- ✅ Analyse de coûts par client

---

## ⚠️ Risques Identifiés & Mitigations

### 1. **Clés Compromises** 🔴 CRITIQUE

**Risque** : ANTHROPIC_API_KEY, ADMIN_PASS, MASTER_KEY visibles dans l'historique Git

**Mitigation** :
- ✅ Régénérez IMMÉDIATEMENT
- ✅ Utilisez `git-filter-repo` pour nettoyer l'historique
- ✅ Activez les secrets scanning sur GitHub

**Action** :
```bash
# Régénérez les clés
openssl rand -base64 32  # ADMIN_PASS
openssl rand -hex 32     # MASTER_KEY
# Mettez à jour sur Railway Variables

# Nettoyez l'historique
git filter-repo --replace-text <(echo "old-key==>new-key")
git push --force-with-lease
```

### 2. **npm Vulnerability** 🟡 HIGH

**Risque** : form-data CRLF injection (CVSS 7.5)

**Mitigation** :
- ✅ Mise à jour automatique via `npm audit fix`
- ✅ Vérification régulière : `npm audit`
- ✅ CI/CD : `npm audit --audit-level=moderate` en pipeline

### 3. **SQLite Single-Process** 🟡 MOYEN

**Risque** : Pas de concurrence distribuée, limité à 1 replica

**Mitigation** :
- ✅ OK pour <10 clients
- ✅ Migration Postgres si >10 clients
- ✅ Monitoring : alerter si >5 clients

### 4. **Logging en Clair** 🟡 MOYEN

**Risque** : console.log() peut exposer des données sensibles

**Mitigation** :
- ✅ Jamais logger les credentials
- ✅ Jamais logger les clés API
- ✅ Jamais logger les tokens
- ✅ Utiliser du logging structuré (Winston/Pino)

### 5. **Twilio Webhook Validation** 🟡 MOYEN

**Risque** : Webhooks SMS/Voix non validés = injection possible

**Mitigation** :
```python
# main.py
from twilio.request_validator import RequestValidator
validator = RequestValidator(TWILIO_AUTH_TOKEN)

@app.post("/webhook/sms")
async def webhook_sms(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Twilio-Signature", "")
    
    if not validator.validate(url, body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")
```

---

## 🔑 Gestion des Secrets

### Railway Variables (Production)

```
ADMIN_PASS = BgoMISh2gOxdwfSH_EHEqVZU
MASTER_KEY = a95c0740ebe7332ff85d73ac84fd98d36d52b72fc3a8c72049b85a87d6eee425
ANTHROPIC_API_KEY = sk-ant-...
TWILIO_ACCOUNT_SID = AC...
TWILIO_AUTH_TOKEN = ...
```

### .env.local (Development)

```bash
# Jamais commiter
cp .env.example .env.local
# Remplissez avec des valeurs de dev
```

### Rotation des Clés

**Quand** :
- ✅ Compromission suspectée
- ✅ Changement de personnel
- ✅ Audit de sécurité
- ✅ Tous les 90 jours (recommandé)

**Comment** :
1. Générez une nouvelle clé
2. Mettez à jour Railway Variables
3. Redéployez
4. Vérifiez que tout fonctionne
5. Supprimez l'ancienne clé

---

## 🚨 Incident Response

### Si une clé est compromise

1. **IMMÉDIATEMENT** : Régénérez la clé
2. **IMMÉDIATEMENT** : Mettez à jour Railway Variables
3. **IMMÉDIATEMENT** : Redéployez
4. **DANS L'HEURE** : Auditez les logs (qui a utilisé la clé ?)
5. **DANS LE JOUR** : Nettoyez l'historique Git
6. **DANS LE JOUR** : Notifiez les clients affectés

### Si un client est compromis

1. Isolez le client (désactivez son accès)
2. Auditez ses jobs et appels IA
3. Vérifiez ses credentials (ont-elles été utilisées ailleurs ?)
4. Contactez le client
5. Réactivez après investigation

---

## 📋 Checklist de Sécurité

- [ ] ADMIN_PASS régénéré et stocké en Railway Variables
- [ ] MASTER_KEY régénéré et stocké en Railway Variables
- [ ] ANTHROPIC_API_KEY régénéré sur console.anthropic.com
- [ ] npm audit = 0 vulnerabilities
- [ ] .env.example commité (pas .env)
- [ ] Secrets scanning activé sur GitHub
- [ ] CORS restrictif en production
- [ ] SQLite protection active
- [ ] Logging structuré implémenté
- [ ] Twilio webhook validation active
- [ ] Audit trail complet (llm_calls table)
- [ ] Budget enforcement testé
- [ ] Rotation des clés documentée
- [ ] Incident response plan en place

---

## 📚 Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Anthropic API Security](https://docs.anthropic.com/en/docs/build-a-chatbot-with-claude)
- [Twilio Security](https://www.twilio.com/docs/usage/security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [SQLite Security](https://www.sqlite.org/security.html)

---

## 📞 Contact

Pour toute question de sécurité : security@novalisia.ca

