# BTC Payments — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Contexte

L'API supporte actuellement les paiements USDT TRC-20 via TRON. L'objectif est d'ajouter Bitcoin (BTC) sur le même endpoint, en laissant le client choisir sa devise. Le montant est toujours exprimé en USD côté marchand — la conversion en BTC est gérée par l'API au moment de la création.

---

## Architecture

### Approche retenue

Extension directe du modèle existant avec un registre de services par devise. Pas d'abstraction formelle — un objet `blockchainServices` dans `paymentService` dispatch vers le bon service selon `currency`.

```
blockchainServices = { USDT: tronService, BTC: btcService }
```

L'ajout d'une 3ème devise dans le futur se fait en une ligne.

### Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `src/services/btcService.js` | Génération wallet, balance, transactions, sweep BTC |
| `src/services/priceService.js` | Conversion USD→BTC, cache 60s, fallback Binance |

### Fichiers modifiés

| Fichier | Changements |
|---|---|
| `src/models/Payment.js` | Ajout `currency`, `usdAmount`, `cryptoAmount`, `exchangeRate`, `requiredConfirmations` |
| `src/services/paymentService.js` | Registre de services, routing par devise, conversion USD→BTC |
| `src/jobs/paymentMonitor.js` | Dispatch par devise, logique confirmations BTC (1→confirming, 3→confirmed) |
| `src/config/index.js` | Variables d'env BTC |
| `src/controllers/paymentController.js` | Validation `currency`, montant minimum BTC |
| `PHP_INTEGRATION.md` | Documentation BTC |

---

## Modèle de données

### Nouveaux champs sur `Payment`

```js
currency: {
  type: String,
  enum: ['USDT', 'BTC'],
  default: 'USDT',
  index: true,
},

// Montant en USD (ce que le marchand envoie, ex: 25.00)
usdAmount: {
  type: Number,
  default: null,
},

// Montant dans la devise native (ex: 0.00029412 BTC ou 25.00 USDT)
// C'est ce montant qui est vérifié lors du monitoring
cryptoAmount: {
  type: Number,
  default: null,
},

// Taux de change USD/crypto au moment de la création (pour audit)
// null pour USDT (taux = 1)
exchangeRate: {
  type: Number,
  default: null,
},

// Nombre de confirmations requises pour valider le paiement
// 1 pour USDT, 3 pour BTC
requiredConfirmations: {
  type: Number,
  default: 1,
},
```

### Comportement USDT (rétrocompatibilité)

Pour USDT, les nouveaux champs sont renseignés de façon transparente :
- `currency = 'USDT'`
- `usdAmount = amount`
- `cryptoAmount = amount`
- `exchangeRate = 1`
- `requiredConfirmations = 1`

Aucun changement de comportement pour les paiements USDT existants.

### Réponse API publique enrichie

```json
{
  "paymentId": "PAY-XXXX",
  "currency": "BTC",
  "usdAmount": 25.00,
  "amount": 0.00029412,
  "exchangeRate": 85000,
  "walletAddress": "bc1q...",
  "qrCode": "data:image/png;base64,...",
  "expiresAt": "2026-03-30T11:15:00.000Z"
}
```

Le champ `amount` contient toujours le montant dans la devise native (BTC ou USDT) — c'est ce que le client doit envoyer.

---

## `priceService.js`

Responsable uniquement de la conversion USD→crypto.

```
getBTCRate() → number (USD par BTC)
  → appel CoinGecko : https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
  → cache en mémoire 60 secondes
  → fallback Binance : https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
  → si les deux échouent → throw (la création du paiement échoue proprement)
```

Aucun stockage persistant — le taux est recalculé à chaque création (le cache évite les appels inutiles en rafale).

---

## `btcService.js`

Interface identique à `tronService` pour que `paymentMonitor` puisse les appeler de façon interchangeable.

### Dépendances

- `bitcoinjs-lib` — génération de wallets HD, construction et signature des transactions
- `axios` — appels Blockcypher API

### Réseau

Configurable via `BTC_NETWORK=mainnet` (ou `testnet`). Les URLs Blockcypher s'adaptent automatiquement (`https://api.blockcypher.com/v1/btc/main` vs `.../btc/test3`).

### Méthodes

**`generateWallet()`**
- Génère une paire clé privée / adresse P2WPKH (bech32, format `bc1q...`)
- P2WPKH = SegWit natif : frais de transaction réduits (~40% moins cher que P2PKH)
- Retourne `{ address, privateKey (WIF), publicKey }`

**`getBalance(address)`**
- `GET /v1/btc/main/addrs/<address>/balance` via Blockcypher
- Retourne le solde confirmé en BTC (conversion depuis satoshis : `/1e8`)

**`getIncomingTransactions(address, sinceTimestamp)`**
- `GET /v1/btc/main/addrs/<address>/full`
- Filtre les transactions reçues depuis `sinceTimestamp`
- Retourne `[{ txHash, amount (BTC), confirmations, timestamp }]`

**`getTransactionConfirmations(txHash)`**
- `GET /v1/btc/main/txs/<txHash>`
- Retourne le nombre de confirmations actuelles

**`sweepBTC(privateKeyWIF, fromAddress, toAddress, feesWalletAddress, feesPercentage)`**
- Récupère les UTXOs de `fromAddress` via Blockcypher
- Calcule les frais réseau (fee rate estimé via Blockcypher `/v1/btc/main` → `medium_fee_per_kb`)
- Si `feesPercentage > 0` : construit 2 outputs (fees wallet + central wallet)
- Signe avec `bitcoinjs-lib` (P2WPKH)
- Broadcast via `POST /v1/btc/main/txs/push`
- Retourne `{ sweepTxHash, feesTxHash: null }` — les deux outputs sont dans la même tx BTC (contrairement à USDT qui nécessite 2 transactions séparées)

> **Différence clé vs USDT sweep** : en BTC, fees + central wallet sont dans une seule transaction (2 outputs), donc `feesTxHash` n'existe pas séparément.

---

## `paymentMonitor.js` — logique BTC

### `_checkPendingPayments()`

La méthode interroge les paiements `pending` ET `confirming` (nouveauté BTC — les USDT passent directement à `confirmed`).

```
Pour chaque paiement pending/confirming :
  service = blockchainServices[payment.currency]
  balance = service.getBalance(payment.wallet.address)

  if balance >= cryptoAmount × (1 - tolerance):
    txs = service.getIncomingTransactions(address, createdAt)
    confirmations = service.getTransactionConfirmations(txs[0].txHash)

    if confirmations >= 1 && payment.status === 'pending':
      status = 'confirming'   ← intermédiaire BTC uniquement

    if confirmations >= requiredConfirmations:
      status = 'confirmed'
      → webhook + sweep
```

Pour USDT, `requiredConfirmations = 1` donc on passe directement à `confirmed` sans s'arrêter à `confirming`.

### `_processSweeps()`

```
service = blockchainServices[payment.currency]

if currency === 'USDT':
  → même flow qu'aujourd'hui (ensureGasForSweep + 2 txs séparées)

if currency === 'BTC':
  → sweepBTC() avec 2 outputs dans une seule tx
  → payment.sweepTxHash = txHash
  → payment.feesTxHash = null (inclus dans la même tx)
```

### Expiration BTC

Les paiements BTC `pending` ET `confirming` sont éligibles à l'expiration. Un paiement à `confirming` (1 confirmation reçue) ne doit **pas** expirer — il a déjà reçu des fonds. L'expiration ne s'applique qu'aux `pending`.

```
_expirePendingPayments() → status === 'pending' uniquement (déjà le cas ✅)
```

---

## Configuration

### Nouvelles variables d'environnement

```env
# Bitcoin réseau
BTC_NETWORK=mainnet                        # ou testnet

# Blockcypher (optionnel — augmente les rate limits de 3 à 200 req/h)
BLOCKCYPHER_TOKEN=

# Wallet central BTC (reçoit les sweeps)
BTC_CENTRAL_WALLET_ADDRESS=bc1q...
BTC_CENTRAL_WALLET_WIF=                    # clé privée WIF du wallet central

# Wallet de frais BTC (reçoit les 3%)
BTC_FEES_WALLET_ADDRESS=bc1q...            # peut être identique à BTC_CENTRAL_WALLET_ADDRESS

# Durée de vie d'un paiement BTC (en minutes, défaut 60)
BTC_PAYMENT_EXPIRATION_MINUTES=60

# Confirmations requises (défaut 3)
BTC_REQUIRED_CONFIRMATIONS=3

# Tolérance de montant BTC (défaut identique USDT : 1.5%)
BTC_AMOUNT_TOLERANCE=0.015
```

---

## API

### `POST /api/payments`

**Paramètres ajoutés** :

```json
{
  "amount": 25.00,
  "currency": "BTC",
  "metadata": {},
  "externalRef": "order-789"
}
```

- `currency` : `"USDT"` (défaut) ou `"BTC"`
- `amount` : toujours en USD pour BTC. Pour USDT, comportement inchangé.
- Minimum BTC : 1 USD (montant trop petit = frais réseau supérieurs au paiement)

**Réponse** :

```json
{
  "success": true,
  "payment": {
    "paymentId": "PAY-XXXX",
    "currency": "BTC",
    "usdAmount": 25.00,
    "amount": 0.00029412,
    "exchangeRate": 85000,
    "status": "pending",
    "walletAddress": "bc1q...",
    "qrCode": "data:image/png;base64,...",
    "expiresAt": "2026-03-30T11:15:00.000Z"
  }
}
```

### Statuts BTC

| Statut | Signification |
|---|---|
| `pending` | En attente — aucune transaction détectée |
| `confirming` | 1 confirmation reçue, en attente des 2 suivantes (~20 min) |
| `confirmed` | 3 confirmations — paiement validé ✅ |
| `swept` | Fonds transférés au wallet central ✅ |
| `expired` | Délai dépassé sans transaction |

---

## Frais (3%)

Même logique que USDT. Lors du sweep BTC :

```
sweepTotal = solde réel du wallet (en BTC)
feesAmount = sweepTotal × fees.percentage (ex: 0.03)
netAmount  = sweepTotal - feesAmount - fraisRéseau

Transaction BTC avec 2 outputs :
  output 1 → BTC_FEES_WALLET_ADDRESS : feesAmount
  output 2 → BTC_CENTRAL_WALLET_ADDRESS : netAmount
```

Les frais réseau Bitcoin sont déduits du `netAmount` (pas des fees).

Si `BTC_FEES_WALLET_ADDRESS` n'est pas configuré → sweep en 1 seul output vers le wallet central (comportement dégradé gracieux).

---

## Gestion d'erreurs

| Scénario | Comportement |
|---|---|
| CoinGecko + Binance down au moment de la création | `500` avec message clair — le paiement n'est pas créé |
| Blockcypher rate limit | Retry au prochain cycle du monitor (10s) |
| Sweep BTC échoué | `retryService.scheduleSweepRetry()` — même logique que USDT |
| Paiement à `confirming` au moment de l'expiration | Non expiré — les fonds sont arrivés, le monitor continue à checker les confirmations |

---

## Hors scope

- Conversion automatique BTC→USDT post-réception
- Support Lightning Network
- Webhooks distincts par devise (le payload webhook inclura `currency` — côté PHP, même endpoint)
