# Payment Creation Modal — Design Spec

## Goal

Allow admins to instantiate a new USDT payment directly from the dashboard, via a modal on the Payments page.

## Architecture

A new `CreatePaymentModal` component handles all form state and submission logic, including navigation on success. `Payments.jsx` owns the open/close toggle via conditional rendering (no `isOpen` prop — the component mounts when needed and unmounts on close). The modal calls the public `POST /api/payments` endpoint using plain axios (not the admin singleton, which is scoped to `/api/admin`). This endpoint is intentionally public — no auth header is needed or sent.

## Files

- **Create:** `dashboard/src/components/CreatePaymentModal.jsx`
- **Modify:** `dashboard/src/pages/Payments.jsx` — add "New Payment" button + `showCreate` state

## API

**Endpoint:** `POST /api/payments` (public, no auth required — intentional). Rate-limited to 10 requests/minute.

**Server-side validation (in order):**
1. `amount` absent or `<= 0` → 400: `{ error: 'Montant invalide. Doit être > 0.' }`
2. `amount < 0.01` → 400: `{ error: 'Montant minimum: 0.01 USDT' }`

So `0.005` fails check 2 and returns the minimum amount message.

**Request body:** always include `amount`; include `description` only if non-empty after trimming.
```json
{ "amount": number }
// or
{ "amount": number, "description": "some text" }
```

**Success response (201):**
```json
{
  "success": true,
  "payment": { "paymentId": "PAY-...", "amount": ..., "status": "pending", ... }
}
```
Navigate to `/payments/` + `response.data.payment.paymentId` (matched by the existing route `/payments/:id` in `App.jsx`).

**Error responses:** `{ "error": "<message>" }` — API messages are in French; display them as-is.

## Component: `CreatePaymentModal`

**Props:** `onClose: () => void`

**No `isOpen` prop** — conditional rendering handles visibility. `showCreate` in `Payments.jsx` stays `true` after successful navigation, but this is harmless: navigating away unmounts `Payments.jsx` and its state resets on return.

**Internal hooks:** calls `useNavigate()` directly — navigation is owned by the modal.

**Form:**
- Use `noValidate` on the `<form>` element to suppress browser native validation; the component handles all validation.
- `amount` — number input, min 0.01, step 0.01, placeholder "0.00"
- `description` — text input, optional, placeholder "Order ref, customer name…"

**States:** `idle` | `submitting` | `error`

**Behaviour:**
1. On submit: validate `amount >= 0.01` client-side; if invalid, show `"Amount must be at least 0.01 USDT"` as the error message and do not call the API; trim `description` and omit from payload if empty; call `axios.post('/api/payments', payload)`
2. On success: call `navigate('/payments/' + response.data.payment.paymentId)` — route change unmounts the component; `onClose` is not called
3. On error: display `err.response?.data?.error ?? 'Failed to create payment'` inside the modal; form retains user input
4. Clicking backdrop or pressing Escape: if not submitting, call `onClose()`; if submitting, ignore
5. Submit button disabled + shows "Creating…" while submitting

**Styling:** dark fixed overlay (`bg-black/60`), centered `bg-gray-900 rounded-xl border border-gray-800` card, emerald primary button, rose error text — consistent with the rest of the dashboard design system.

## Changes to `Payments.jsx`

- Add `showCreate` boolean state (default `false`)
- Replace the bare `<h1>` at the top of the page with a flex row: `<div className="flex items-center justify-between">` containing the `<h1>` on the left and the "New Payment" button on the right (emerald background, `Plus` icon from lucide-react, white label text)
- Render `<CreatePaymentModal onClose={() => setShowCreate(false)} />` when `showCreate` is true

## Error handling

| Scenario | Behaviour |
|---|---|
| Amount < 0.01 | Client-side: show "Amount must be at least 0.01 USDT", no API call |
| API 400 | Show French error message from `error.response.data.error` |
| API 429 / 5xx | Show "Failed to create payment" |
| Network error | Show "Failed to create payment" |

All error cases retain form input.

## Out of scope

- `metadata` field
- List auto-refresh after modal close without navigation
- Duplicate submission guard beyond disabling the button
