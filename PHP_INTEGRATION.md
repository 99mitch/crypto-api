# Crypto Pay API — Intégration PHP

**Base URL:** `https://crypto-api-e2zh.onrender.com`

---

## Classe utilitaire

```php
<?php

class CryptoPayAPI {
    private string $baseUrl = 'https://crypto-api-e2zh.onrender.com';
    private string $webhookSecret;

    public function __construct(string $webhookSecret) {
        $this->webhookSecret = $webhookSecret;
    }

    private function request(string $method, string $path, array $body = []): array {
        $ch = curl_init($this->baseUrl . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 30,
        ]);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $response = curl_exec($ch);
        $status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if (!$response) throw new RuntimeException('Curl error');
        $data = json_decode($response, true);
        if ($status >= 400) throw new RuntimeException($data['error'] ?? 'API error ' . $status);

        return $data;
    }

    /** Créer un paiement */
    public function createPayment(float $amount, array $metadata = [], string $externalRef = null, string $currency = 'USDT'): array {
        return $this->request('POST', '/api/payments', [
            'amount'      => $amount,
            'currency'    => $currency,
            'metadata'    => $metadata,
            'externalRef' => $externalRef,
        ]);
    }

    /** Récupérer un paiement complet */
    public function getPayment(string $paymentId): array {
        return $this->request('GET', '/api/payments/' . $paymentId);
    }

    /** Vérifier le statut (léger, pour polling) */
    public function getStatus(string $paymentId): array {
        return $this->request('GET', '/api/payments/' . $paymentId . '/status');
    }

    /** Annuler un paiement */
    public function cancelPayment(string $paymentId): array {
        return $this->request('POST', '/api/payments/' . $paymentId . '/cancel');
    }

    /** Vérifier la signature d'un webhook entrant */
    public function verifyWebhook(string $rawBody, string $signature): bool {
        $expected = hash_hmac('sha256', $rawBody, $this->webhookSecret);
        return hash_equals($expected, $signature);
    }
}
```

---

## Cas d'usage

### 1. Créer un paiement

```php
$api = new CryptoPayAPI($_ENV['WEBHOOK_SECRET']);

$result = $api->createPayment(
    amount: 25.00,
    metadata: ['order_id' => '789', 'user_id' => '42'],
    externalRef: 'order-789'  // optionnel, pour idempotence
);

$payment = $result['payment'];

echo $payment['paymentId'];     // "pay_xxxx"
echo $payment['walletAddress']; // adresse TRX où le client doit envoyer
echo $payment['qrCode'];        // data URI base64 — affiche avec <img src="...">
echo $payment['expiresAt'];     // ISO 8601, expiration dans 15 min
```

### 2. Afficher la page de paiement

```php
$_SESSION['pending_payment_id'] = $payment['paymentId'];

echo '<img src="' . $payment['qrCode'] . '" width="200">';
echo '<p>Envoyer exactement <strong>' . $payment['amount'] . ' USDT</strong> à :</p>';
echo '<code>' . $payment['walletAddress'] . '</code>';
echo '<p>Expire le : ' . $payment['expiresAt'] . '</p>';
```

### 3. Polling du statut

```php
$status = $api->getStatus($_SESSION['pending_payment_id']);
// Retourne: { paymentId, status, receivedAmount, expiresAt }

switch ($status['status']) {
    case 'pending':    // En attente du paiement
    case 'confirming': // Transaction détectée, en confirmation
    case 'confirmed':  // Paiement reçu et confirmé
    case 'swept':      // Fonds transférés au wallet central
    case 'expired':    // Délai dépassé
    case 'cancelled':  // Annulé
    case 'failed':     // Erreur
}
```

### 4. Recevoir le webhook

L'API envoie un POST sur ton URL quand le paiement est confirmé.
Configure la variable `WEBHOOK_INTERNAL_URL` sur Render pour pointer vers ton endpoint PHP.

```php
// webhook.php — ton endpoint public
$api = new CryptoPayAPI($_ENV['WEBHOOK_SECRET']);

$rawBody   = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';

if (!$api->verifyWebhook($rawBody, $signature)) {
    http_response_code(401);
    exit('Invalid signature');
}

$event = json_decode($rawBody, true);

if ($event['event'] === 'payment.confirmed') {
    $paymentId      = $event['paymentId'];
    $receivedAmount = $event['receivedAmount'];
    $metadata       = $event['metadata']; // ton order_id, user_id, etc.

    activateOrder($metadata['order_id']);
}

http_response_code(200);
echo json_encode(['received' => true]);
```

---

## Statuts du paiement

| Statut | Signification |
|---|---|
| `pending` | En attente — affiche le QR au client |
| `confirming` | Transaction vue sur la blockchain |
| `confirmed` | Paiement confirmé ✅ |
| `swept` | Fonds reçus dans le wallet central ✅ |
| `expired` | 15 min écoulées sans paiement |
| `cancelled` | Annulé manuellement |
| `failed` | Erreur technique |

> Considère `confirmed` et `swept` comme paiement réussi. Le sweep peut prendre quelques secondes de plus.

---

## Rate limits

| Endpoint | Limite |
|---|---|
| `POST /api/payments` | 10 req/min |
| `GET /api/payments/:id/status` | 30 req/min |

---

## Variable d'environnement PHP requise

```env
WEBHOOK_SECRET=valeur_identique_a_celle_sur_render
```

---

## Mise à jour temps réel du navigateur (sans polling de l'API)

Quand un paiement est confirmé, l'API envoie automatiquement un webhook POST vers ton endpoint PHP. Le navigateur n'a pas besoin d'appeler l'API — il écoute ton propre backend via **Server-Sent Events (SSE)**.

### Flux complet

```
API crypto (Render)
  → POST webhook.php        (notification de confirmation)
    → sauvegarde en DB
      → navigateur écoute payment-stream.php via SSE
        → UI se met à jour automatiquement
```

### Étape 1 — Configurer la variable d'environnement sur Render

Dans les settings de ton service Render, ajouter :

```
WEBHOOK_INTERNAL_URL = https://ton-site.com/webhook.php
```

> `WEBHOOK_SECRET` doit être identique des deux côtés (déjà requis ci-dessus).

---

### Étape 2 — `webhook.php`

Endpoint public qui reçoit les notifications de l'API. Vérifie la signature HMAC et met à jour le statut en base.

```php
<?php
// webhook.php — URL publique à renseigner dans WEBHOOK_INTERNAL_URL sur Render

$rawBody   = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$secret    = $_ENV['WEBHOOK_SECRET'];

$expected = hash_hmac('sha256', $rawBody, $secret);
if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    exit;
}

$event = json_decode($rawBody, true);

if (in_array($event['event'], ['payment.confirmed', 'payment.swept'])) {
    $pdo    = new PDO($_ENV['DATABASE_URL']);
    $status = $event['event'] === 'payment.swept' ? 'swept' : 'confirmed';
    $stmt   = $pdo->prepare('UPDATE payments SET status = ?, confirmed_at = NOW() WHERE payment_id = ?');
    $stmt->execute([$status, $event['paymentId']]);

    // Place ici ta logique métier (activer une commande, envoyer un email, etc.)
    // $event['metadata'] contient les données passées à la création du paiement
    // ex: $event['metadata']['order_id'], $event['metadata']['user_id']
}

http_response_code(200);
echo json_encode(['received' => true]);
```

**Payload reçu pour `payment.confirmed` :**

```json
{
  "event": "payment.confirmed",
  "paymentId": "pay_xxxx",
  "amount": 25.00,
  "receivedAmount": 25.00,
  "txHash": "abc123...",
  "senderAddress": "TXxx...",
  "walletAddress": "TYxx...",
  "metadata": { "order_id": "789", "user_id": "42" },
  "confirmedAt": "2024-01-15T10:30:00.000Z"
}
```

**Payload reçu pour `payment.swept` :**

```json
{
  "event": "payment.swept",
  "paymentId": "pay_xxxx",
  "amount": 25.00,
  "sweepTxHash": "def456...",
  "sweptAt": "2024-01-15T10:30:05.000Z"
}
```

> Considère `confirmed` et `swept` comme un paiement réussi. Le sweep suit la confirmation de quelques secondes.

---

### Étape 3 — `payment-stream.php`

Endpoint SSE qui maintient une connexion ouverte avec le navigateur et envoie un événement dès que le statut change en base.

```php
<?php
// payment-stream.php?id=pay_xxxx

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no'); // important si derrière nginx

$paymentId = $_GET['id'] ?? '';
if (!$paymentId) exit;

$pdo       = new PDO($_ENV['DATABASE_URL']);
$startTime = time();
$timeout   = 900; // 15 min max (durée de vie d'un paiement)

while (time() - $startTime < $timeout) {
    $stmt = $pdo->prepare('SELECT status FROM payments WHERE payment_id = ?');
    $stmt->execute([$paymentId]);
    $row = $stmt->fetch();

    if ($row && in_array($row['status'], ['confirmed', 'swept', 'expired', 'cancelled'])) {
        echo "data: " . json_encode(['status' => $row['status']]) . "\n\n";
        ob_flush();
        flush();
        break;
    }

    // Heartbeat pour garder la connexion ouverte
    echo ": heartbeat\n\n";
    ob_flush();
    flush();
    sleep(3);
}
```

---

### Étape 4 — JavaScript sur la page de paiement

À intégrer dans la page où tu affiches le QR code. Ouvre une connexion SSE vers `payment-stream.php` et réagit à la réponse.

```javascript
const paymentId = '<?= htmlspecialchars($paymentId) ?>';
const source    = new EventSource('/payment-stream.php?id=' + paymentId);

source.onmessage = function (e) {
    const { status } = JSON.parse(e.data);
    source.close(); // ferme la connexion dès réception

    if (status === 'confirmed' || status === 'swept') {
        // Paiement reçu — redirige vers page de confirmation
        window.location.href = '/confirmation.php';
    } else if (status === 'expired') {
        document.getElementById('payment-expired').style.display = 'block';
        document.getElementById('payment-qr').style.display     = 'none';
    } else if (status === 'cancelled') {
        document.getElementById('payment-cancelled').style.display = 'block';
    }
};

source.onerror = function () {
    source.close();
    // Optionnel : afficher un message d'erreur de connexion
};
```

---

### Résumé des fichiers à créer

| Fichier | Rôle |
|---|---|
| `webhook.php` | Reçoit les notifications de l'API (serveur → serveur) |
| `payment-stream.php` | Pousse les mises à jour au navigateur via SSE |

### Schéma de table suggéré

Si tu n'as pas encore de table `payments` côté PHP :

```sql
CREATE TABLE payments (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    payment_id   VARCHAR(64) UNIQUE NOT NULL,  -- ex: "pay_xxxx"
    order_id     VARCHAR(64),
    amount       DECIMAL(10, 2),
    status       VARCHAR(20) DEFAULT 'pending',
    confirmed_at DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

> `payment_id` est la valeur retournée par `POST /api/payments` — c'est la clé de liaison entre les deux systèmes.

---

## Paiements BTC

### Créer un paiement BTC

```php
$result = $api->createPayment(
    amount: 25.00,           // Toujours en USD pour BTC
    metadata: ['order_id' => '789'],
    externalRef: 'order-789', // optionnel
    currency: 'BTC'
);

$payment = $result['payment'];

echo $payment['currency'];      // "BTC"
echo $payment['usdAmount'];     // 25.00  (USD — ce que tu as passé)
echo $payment['amount'];        // 0.00029412  (BTC à envoyer)
echo $payment['exchangeRate'];  // 85000  (taux USD/BTC au moment de la création)
echo $payment['walletAddress']; // "bc1q..."  adresse Bitcoin
echo $payment['qrCode'];        // data URI — format BIP21 bitcoin:<address>?amount=<btc>
echo $payment['expiresAt'];     // ISO 8601 — expiration dans 60 min
```

### Statuts spécifiques BTC

| Statut | Signification |
|---|---|
| `pending` | En attente — aucune transaction détectée |
| `confirming` | 1 confirmation reçue, en attente des 2 suivantes (~20 min) |
| `confirmed` | 3 confirmations — paiement validé ✅ |
| `swept` | Fonds transférés au wallet central ✅ |
| `expired` | 60 min écoulées sans transaction |

> Considère `confirmed` et `swept` comme paiement réussi.
> Le statut `confirming` est intermédiaire — **ne pas livrer encore** à ce stade.

### Variables d'environnement Render à ajouter

```env
BTC_NETWORK=mainnet
BTC_CENTRAL_WALLET_ADDRESS=bc1q...
BTC_CENTRAL_WALLET_WIF=
BTC_FEES_WALLET_ADDRESS=bc1q...
BLOCKCYPHER_TOKEN=          # optionnel, augmente les rate limits
```
