# Crypto Pay API — Référence des endpoints

Base URL : `http://localhost:3000`

---

## Authentification admin

Les routes `/api/admin/*` requièrent un header d'auth (sauf `/api/admin/login`) :

```
X-Admin-Key: <ADMIN_API_KEY>
# ou
Authorization: Bearer <token>
```

---

## Health

### `GET /api/health`
Vérifie que l'API est en ligne.

**Réponse**
```json
{
  "status": "ok",
  "timestamp": "2026-03-25T10:00:00.000Z",
  "network": "shasta",
  "activeRetries": 0
}
```

---

## Paiements

### `POST /api/payments`
Crée une nouvelle demande de paiement. Génère un wallet dédié et un QR code.

**Body**
```json
{
  "amount": 50,
  "description": "Commande #123",
  "metadata": { "orderId": "ORD-123", "userId": "USR-456" }
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `amount` | number | oui | Montant en USDT (min 0.01) |
| `description` | string | non | Référence libre |
| `metadata` | object | non | Données libres (orderId, userId, etc.) |

**Réponse `201`**
```json
{
  "success": true,
  "payment": {
    "paymentId": "PAY-C3A9E4B6",
    "amount": 50,
    "status": "pending",
    "walletAddress": "TYHrzLQ...",
    "qrCode": "data:image/png;base64,...",
    "txHash": null,
    "senderAddress": null,
    "receivedAmount": 0,
    "sweepStatus": null,
    "expiresAt": "2026-03-25T10:15:00.000Z",
    "metadata": { "orderId": "ORD-123" },
    "description": "Commande #123",
    "createdAt": "2026-03-25T10:00:00.000Z"
  }
}
```

> Le client doit envoyer exactement `amount` USDT TRC-20 à `walletAddress` avant `expiresAt`.

---

### `GET /api/payments/:paymentId`
Récupère les détails complets d'un paiement.

**Réponse `200`**
```json
{
  "success": true,
  "payment": {
    "paymentId": "PAY-C3A9E4B6",
    "amount": 50,
    "status": "swept",
    "walletAddress": "TYHrzLQ...",
    "qrCode": "data:image/png;base64,...",
    "txHash": "d8d6ff9d2ec8...",
    "senderAddress": "TXxxxx...",
    "receivedAmount": 50,
    "sweepStatus": "completed",
    "expiresAt": "2026-03-25T10:15:00.000Z",
    "metadata": {},
    "createdAt": "2026-03-25T10:00:00.000Z",
    "updatedAt": "2026-03-25T10:05:00.000Z"
  }
}
```

**Statuts possibles**

| Statut | Description |
|---|---|
| `pending` | En attente de paiement |
| `confirmed` | Fonds reçus, sweep en cours |
| `swept` | Fonds transférés vers le wallet central |
| `expired` | Délai dépassé sans paiement |
| `failed` | Erreur lors du sweep |

---

### `GET /api/payments/:paymentId/status`
Endpoint léger pour le polling côté front. Retourne uniquement les infos essentielles.

**Réponse `200`**
```json
{
  "paymentId": "PAY-C3A9E4B6",
  "status": "pending",
  "receivedAmount": 0,
  "expiresAt": "2026-03-25T10:15:00.000Z"
}
```

> Préférer cet endpoint pour le polling (rate limit : 30 req/min).

---

### `POST /api/payments/:paymentId/cancel`
Annule un paiement. Uniquement possible si le statut est `pending`.

**Réponse `200`**
```json
{
  "success": true,
  "payment": { "paymentId": "PAY-C3A9E4B6", "status": "expired", ... }
}
```

---

## Admin

### `POST /api/admin/login`
Authentification par mot de passe. Retourne un token valable 24h.

**Body**
```json
{ "password": "admin1234" }
```

**Réponse `200`**
```json
{
  "success": true,
  "token": "eyJ...",
  "expiresAt": "2026-03-26T10:00:00.000Z"
}
```

---

### `GET /api/admin/stats`
Statistiques globales de la plateforme.

**Réponse `200`**
```json
{
  "success": true,
  "stats": {
    "totalPayments": 42,
    "byStatus": {
      "pending": 5,
      "swept": 35,
      "expired": 2
    },
    "totalRevenue": 1750.50,
    "today": {
      "count": 3,
      "revenue": 150.00
    }
  }
}
```

---

### `GET /api/admin/payments`
Liste paginée des paiements avec filtres.

**Query params**

| Param | Description | Exemple |
|---|---|---|
| `status` | Filtrer par statut | `swept` |
| `page` | Numéro de page (défaut: 1) | `2` |
| `limit` | Résultats par page (défaut: 20) | `50` |
| `from` | Date de début (ISO 8601) | `2026-03-01T00:00:00.000Z` |
| `to` | Date de fin (ISO 8601) | `2026-03-31T23:59:59.999Z` |

**Exemple**
```bash
GET /api/admin/payments?status=swept&from=2026-03-01T00:00:00.000Z&page=1&limit=50
```

**Réponse `200`**
```json
{
  "success": true,
  "payments": [...],
  "total": 35,
  "page": 1,
  "totalPages": 1
}
```

---

### `GET /api/admin/payments/:paymentId`
Détail admin d'un paiement (inclut confirmations, webhookAttempts, sweepTxHash).

---

### `GET /api/admin/payments/:paymentId/history`
Audit trail complet d'un paiement — toutes les actions dans l'ordre chronologique.

**Réponse `200`**
```json
{
  "success": true,
  "history": [
    { "action": "payment_created", "timestamp": "...", "details": { "amount": 50 } },
    { "action": "payment_confirmed", "timestamp": "...", "details": { "txHash": "...", "from": "T..." } },
    { "action": "sweep_initiated", "timestamp": "..." },
    { "action": "sweep_completed", "timestamp": "...", "details": { "txHash": "..." } }
  ]
}
```

---

### `POST /api/admin/payments/:paymentId/retry-sweep`
Relance manuellement un sweep dont le statut est `failed`.

**Réponse `200`**
```json
{
  "success": true,
  "message": "Sweep relancé pour PAY-C3A9E4B6"
}
```

---

### `GET /api/admin/recent-activity`
Derniers paiements modifiés (pour un feed temps réel).

**Query params** : `limit` (défaut: 10)

---

### `GET /api/admin/audit-logs`
Recherche dans les logs d'audit.

**Query params**

| Param | Description |
|---|---|
| `action` | Type d'action (`payment_created`, `payment_confirmed`, `sweep_completed`, etc.) |
| `level` | Niveau (`info`, `warn`, `error`) |
| `paymentId` | Filtrer par paiement |
| `from` / `to` | Plage de dates |
| `page` / `limit` | Pagination |

---

### `GET /api/admin/audit-logs/stats`
Stats des logs d'audit sur une période.

**Query params** : `hours` (défaut: 24)

---

## Webhook interne

### `POST /api/internal/payment-confirmed`
Endpoint reçu automatiquement par l'API lors d'un événement. C'est ici que tu branches ta logique métier.

**Events possibles** (header `X-Webhook-Event`)

| Event | Déclencheur |
|---|---|
| `payment.confirmed` | Fonds reçus sur le wallet dédié |
| `payment.swept` | Sweep vers le wallet central terminé |

**Payload `payment.confirmed`**
```json
{
  "event": "payment.confirmed",
  "paymentId": "PAY-C3A9E4B6",
  "amount": 50,
  "receivedAmount": 50,
  "txHash": "d8d6ff9d...",
  "senderAddress": "TXxxxx...",
  "walletAddress": "TYHrzLQ...",
  "metadata": { "orderId": "ORD-123" },
  "confirmedAt": "2026-03-25T10:05:00.000Z"
}
```

**Payload `payment.swept`**
```json
{
  "event": "payment.swept",
  "paymentId": "PAY-C3A9E4B6",
  "amount": 50,
  "sweepTxHash": "9e9c7f3b...",
  "sweptAt": "2026-03-25T10:06:00.000Z"
}
```

> La signature HMAC-SHA256 est dans le header `X-Webhook-Signature` pour vérification.

---

## Rate limits

| Route | Limite |
|---|---|
| Global | 60 req/min |
| `POST /api/payments` | 10 req/min |
| `GET /api/payments/:id/status` | 30 req/min |
| Routes admin | 600 req/min |
