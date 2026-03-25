# CryptoPay Admin Dashboard — Design Spec

**Date:** 2026-03-25
**Project:** crypto-pay-api
**Scope:** React admin dashboard in `/dashboard`, served by Express in production

---

## Context

The backend is a Node.js/Express API for USDT TRC-20 payments. It already serves `dashboard/build` as static files in production (`server.js` line 44). The dashboard needs to provide admin visibility and control over payments, audit logs, and system stats.

---

## Stack

- **Vite** + React 18
- **React Router v6** for routing
- **Tailwind CSS** for styling
- **Recharts** for charts
- **Axios** for API calls
- No state management library (Context API + useState)

---

## Authentication

**Approach:** Direct API key via `X-Admin-Key` header — no JWT login flow.

- Login page presents a single password/key input field
- Key is stored in `localStorage` under key `adminKey`
- All API requests send `X-Admin-Key: <key>` header
- On 401 response: clear localStorage key + redirect to `/login`
- Compatible with the PHP app using the same key

No call to `POST /api/admin/login` is needed.

---

## Project Structure

```
dashboard/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx          # Navigation + CryptoPay logo
│   │   ├── StatCard.jsx         # Metric card (revenue, count...)
│   │   ├── StatusBadge.jsx      # Colored badge per payment status
│   │   ├── Pagination.jsx       # Reusable pagination component
│   │   └── AuditTimeline.jsx    # Vertical timeline for audit trail
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Payments.jsx
│   │   ├── PaymentDetail.jsx
│   │   └── AuditLogs.jsx
│   ├── hooks/
│   │   └── useApi.js            # Axios instance + interceptors
│   ├── App.jsx                  # Routes + ProtectedRoute wrapper
│   └── main.jsx
├── package.json
├── tailwind.config.js
└── vite.config.js               # proxy /api → localhost:3000
```

---

## Routing

| Path | Component | Auth |
|------|-----------|------|
| `/login` | Login | Public |
| `/` | → redirect `/dashboard` | — |
| `/dashboard` | Dashboard | Protected |
| `/payments` | Payments | Protected |
| `/payments/:id` | PaymentDetail | Protected |
| `/audit-logs` | AuditLogs | Protected |

`ProtectedRoute` checks `localStorage.getItem('adminKey')` — redirects to `/login` if absent.

---

## API Layer

**`useApi.js`** exports a single Axios instance:
- `baseURL: '/api/admin'`
- Request interceptor: injects `X-Admin-Key` from localStorage
- Response interceptor: on 401 → clear key + `window.location = '/login'`

**Vite dev proxy** (`vite.config.js`):
```js
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

---

## Pages

### Login
- Centered card on dark background
- Single input: "Admin Key" (type=password)
- On submit: store key in localStorage, navigate to `/dashboard`
- No API call — key validity is confirmed on first protected request
- If the key is wrong, the Axios 401 interceptor clears it and redirects back to `/login?error=1`. The Login page checks for `?error=1` in the URL and shows an inline error: "Invalid admin key. Please try again."

### Dashboard
**4 StatCards (top row):**
1. Total Revenue (USDT) — from `stats.totalRevenue`
2. Today's Revenue — from `stats.today.revenue`
3. Total Payments — from `stats.totalPayments`
4. Success Rate — `swept / totalPayments * 100`%

**Charts (two-column):**
- Left: Bar chart — Revenue last 7 days. Computed via `Promise.all` of 7 calls to `GET /payments?from=<day_start>&to=<day_end>&status=swept&limit=1000`, aggregating `receivedAmount` per day client-side. Only `swept` payments are counted to match the logic used by `stats.totalRevenue`.
- Right: Horizontal bar chart — payments by status from `stats.byStatus`

**Recent Activity feed (bottom):**
- `GET /recent-activity?limit=10` — response key is `activities`, each item: `{ paymentId, amount, status, receivedAmount, createdAt, updatedAt }`
- List of entries: Payment ID, amount, status badge, relative time (based on `updatedAt`)
- Auto-refresh every 15s via `setInterval` (applies to stats + activity)
- Live indicator: small animated green dot labeled "Live"

### Payments
- Table columns: Payment ID, Amount (USDT), Status, Created At, Updated At
- Filters above table: status select + date range (from/to)
- Pagination: 20 per page
- Click on row → navigate to `/payments/:id`
- No text search (API does not support free-text query)

### Payment Detail
- Back button + Payment ID in header
- Two-column layout:
  - Left: all payment fields (amount, wallet address, tx hash, confirmations, sweep status, sweep tx hash, expiry, webhook attempts, metadata, description). Note: `sweepRetryCount` is not exposed by `toAdminJSON()` — omit from UI.
  - Right: QR code displayed as `<img src={payment.qrCode} />`. The `qrCode` field is a base64 data URI (e.g. `data:image/png;base64,...`), usable directly as `src`.
- Retry Sweep button: shown only if `payment.sweepStatus === 'failed'`. Calls `POST /payments/:id/retry-sweep`. Shows `window.confirm` before calling. Toast feedback on success/error.
- Bottom: `AuditTimeline` — data from `GET /payments/:id/history`. Response shape: array of `{ _id, action, level, details, ip, createdAt }`. Vertical timeline, one entry per item (sorted ascending by `createdAt`). Each entry shows: Lucide React icon by action category (see table below), action name, level badge, timestamp, collapsible details JSON.

**Action category → Lucide icon mapping:**

| Category | Actions | Icon |
|----------|---------|------|
| Payment lifecycle | `payment_created`, `payment_expired`, `payment_confirmed`, `payment_cancelled`, `payment_partial_received` | `CreditCard` |
| Sweep | `sweep_*` | `ArrowRightLeft` |
| Webhook | `webhook_*` | `Webhook` |
| Admin | `admin_*` | `ShieldCheck` |
| System | `monitor_*`, `api_error`, `rate_limit_hit` | `Settings` |

### Audit Logs
- Table columns: Timestamp, Action, Level (colored badge), Payment ID (link to `/payments/:id` if present), IP
- Filters: action select (see full enum below), level select (`info`, `warn`, `error`, `debug`), date range
- Pagination: 50 per page

**Action enum values** (from `AuditLog.js`):
`payment_created`, `payment_expired`, `payment_confirmed`, `payment_cancelled`, `payment_partial_received`, `sweep_initiated`, `sweep_gas_sent`, `sweep_completed`, `sweep_failed`, `sweep_retry_success`, `sweep_retry_failed`, `sweep_retries_exhausted`, `sweep_manual_retry`, `webhook_sent`, `webhook_failed`, `webhook_retry_success`, `webhook_retry_failed`, `webhook_retries_exhausted`, `admin_login`, `admin_login_failed`, `admin_cancel_payment`, `admin_retry_sweep`, `admin_view_payment`, `monitor_cycle_start`, `monitor_cycle_end`, `monitor_error`, `api_error`, `rate_limit_hit`

---

## Design System

**Color palette:**
- Background: `gray-950`
- Sidebar / cards: `gray-900`
- Primary accent: `emerald-400` / `emerald-500`
- Borders: `gray-800`
- Text: `gray-100` primary, `gray-400` secondary

**Status colors:**

| Status | Color |
|--------|-------|
| pending | gray |
| confirming | yellow |
| confirmed | blue |
| expired | red |
| swept | emerald |
| failed | rose |

**Audit level colors:**

| Level | Color |
|-------|-------|
| info | blue |
| warn | yellow |
| error | red |
| debug | gray |

**Sidebar:** Fixed left, 240px wide, CryptoPay logo at top, nav links with active state highlight.

**Responsive:** Sidebar collapses to icon-only on `md` breakpoint, hidden on mobile with a hamburger toggle.

---

## Error & Loading States

- **Loading:** Skeleton loaders on tables and stat cards during fetch
- **Errors:** Inline error message below the affected component
- **Toast:** Fixed bottom-right div, auto-dismiss after 3s (used for retry sweep feedback)
- **401:** Handled globally by Axios interceptor

---

## Production Build

Express serves `dashboard/build` as static files (already configured in `server.js`). The root API package.json already has:
```json
"dashboard:build": "cd dashboard && npm run build"
```
Vite outputs to `dashboard/dist` by default — configure `build.outDir: 'build'` in `vite.config.js` to match.
