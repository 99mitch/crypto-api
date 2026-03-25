# 🪙 CryptoPay API — Paiements USDT TRC-20

API de paiement en crypto-monnaie (USDT sur Tron) avec wallet dédié par transaction, vérification automatique, sweep vers wallet central et dashboard admin React.

---

## Architecture

```
crypto-pay-api/
├── src/
│   ├── config/
│   │   ├── index.js          # Configuration centralisée
│   │   └── database.js       # Connexion MongoDB
│   ├── models/
│   │   └── Payment.js        # Schéma Mongoose (Payment)
│   ├── services/
│   │   ├── tronService.js    # Interaction blockchain Tron (TronWeb/TronGrid)
│   │   ├── paymentService.js # Logique métier paiements
│   │   └── webhookService.js # Envoi webhooks + signature HMAC
│   ├── controllers/
│   │   ├── paymentController.js  # Endpoints paiements
│   │   └── adminController.js    # Endpoints admin/dashboard
│   ├── routes/
│   │   ├── payment.js        # Routes /api/payments
│   │   ├── admin.js          # Routes /api/admin
│   │   └── webhook.js        # Route /api/internal (webhook receiver)
│   ├── jobs/
│   │   └── paymentMonitor.js # Job de monitoring (polling blockchain)
│   └── server.js             # Point d'entrée Express
├── dashboard/                 # Dashboard React (à builder séparément)
├── .env.example              # Template des variables d'environnement
└── package.json
```

---

## Flux de paiement

```
1. [Client] → POST /api/payments       → Crée un paiement + wallet dédié
2. [Client] ← Reçoit adresse wallet    → Affiche QR code / adresse à l'utilisateur
3. [User]   → Envoie USDT à l'adresse  → Transaction sur la blockchain Tron
4. [Monitor] ← Polling toutes les 10s  → Détecte la réception USDT
5. [Monitor] → Met à jour status=confirmed + envoie webhook
6. [Monitor] → Sweep automatique       → Transfère les USDT vers wallet central
7. [Client] ← Webhook payment.confirmed → Exécute la logique métier
```

---

## Installation

```bash
# 1. Cloner et installer
git clone <repo>
cd crypto-pay-api
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env avec tes valeurs (voir section Configuration)

# 3. Démarrer MongoDB
mongod

# 4. Lancer l'API
npm run dev    # développement (nodemon)
npm start      # production
```

---

## Configuration (.env)

| Variable | Description |
|----------|-------------|
| `TRONGRID_API_KEY` | Clé API gratuite sur [trongrid.io](https://www.trongrid.io/) |
| `CENTRAL_WALLET_ADDRESS` | Ton wallet principal TRX (reçoit les sweep) |
| `CENTRAL_WALLET_PRIVATE_KEY` | Clé privée du wallet central (pour envoyer le gas) |
| `TRON_NETWORK` | `shasta` (testnet) ou `mainnet` |
| `USDT_CONTRACT_ADDRESS` | Contrat USDT TRC-20 (voir .env.example) |
| `WEBHOOK_SECRET` | Clé secrète pour signer les webhooks HMAC |

---

## Endpoints API

### Paiements

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/payments` | Créer un paiement |
| `GET` | `/api/payments/:paymentId` | Récupérer un paiement |
| `GET` | `/api/payments/:paymentId/status` | Polling statut (léger) |
| `POST` | `/api/payments/:paymentId/cancel` | Annuler un paiement pending |

### Admin / Dashboard

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/admin/stats` | Statistiques globales |
| `GET` | `/api/admin/payments` | Liste paginée + filtres |
| `GET` | `/api/admin/payments/:paymentId` | Détail admin |
| `POST` | `/api/admin/payments/:paymentId/retry-sweep` | Relancer un sweep failed |
| `GET` | `/api/admin/recent-activity` | Dernières activités |

### Webhook interne

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/internal/payment-confirmed` | Reçoit les confirmations |

---

## Exemples d'utilisation

### Créer un paiement

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50,
    "description": "Abonnement Pro",
    "metadata": {
      "orderId": "ORD-12345",
      "userId": "USR-678"
    }
  }'
```

**Réponse :**
```json
{
  "success": true,
  "payment": {
    "paymentId": "PAY-A3F7B2C1",
    "amount": 50,
    "status": "pending",
    "walletAddress": "TJk8s7F...",
    "expiresAt": "2024-01-15T14:30:00.000Z",
    "metadata": { "orderId": "ORD-12345", "userId": "USR-678" }
  }
}
```

### Polling du statut

```bash
curl http://localhost:3000/api/payments/PAY-A3F7B2C1/status
```

### Webhook reçu

```json
{
  "event": "payment.confirmed",
  "paymentId": "PAY-A3F7B2C1",
  "amount": 50,
  "receivedAmount": 50,
  "txHash": "abc123...",
  "metadata": { "orderId": "ORD-12345" }
}
```

---

## Cycle de vie d'un paiement

```
pending → confirmed → swept
pending → expired
confirmed → swept (failed → retry)
```

| Status | Description |
|--------|-------------|
| `pending` | En attente de réception USDT |
| `confirming` | Transaction détectée, en attente de confirmation |
| `confirmed` | Paiement reçu et confirmé |
| `expired` | Délai de 15 min dépassé |
| `swept` | USDT transféré vers wallet central |
| `failed` | Erreur (sweep échoué, etc.) |

---

## Sécurité — Points importants

1. **Clés privées** : En production, chiffre les clés privées en base (AES-256). Ne les stocke jamais en clair.
2. **Webhook HMAC** : Vérifie toujours la signature `X-Webhook-Signature` côté récepteur.
3. **Rate limiting** : Ajoute `express-rate-limit` sur les endpoints publics.
4. **HTTPS** : Obligatoire en production.
5. **Variables d'env** : Utilise un gestionnaire de secrets (Vault, AWS Secrets Manager).

---

## Dashboard

Le dashboard React est disponible en preview (fichier `.jsx`). Pour l'intégrer :

1. Remplace le flag `MOCK = true` par `MOCK = false` dans le composant
2. Build avec `npm run build` dans le dossier dashboard
3. Les fichiers statiques sont servis automatiquement par Express en production

---

## Testnet (Shasta)

Pour tester sans risque :
1. Utilise le réseau Shasta (`TRON_NETWORK=shasta`)
2. Obtiens des TRX de test sur [shasta.tronex.io](https://www.tronlink.org/shasta)
3. Utilise le contrat USDT de test (voir `.env.example`)
