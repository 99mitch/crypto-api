# Payment Creation Modal — Design Spec

## Goal

Allow admins to instantiate a new USDT payment directly from the dashboard, via a modal on the Payments page.

## Architecture

A new `CreatePaymentModal` component handles all form state and submission logic. `Payments.jsx` owns the open/close toggle and re-uses existing navigation patterns on success. The modal calls the public `POST /api/payments` endpoint using plain axios (not the admin singleton, which is scoped to `/api/admin`).

## Files

- **Create:** `dashboard/src/components/CreatePaymentModal.jsx`
- **Modify:** `dashboard/src/pages/Payments.jsx` — add "New Payment" button + `showCreate` state

## API

**Endpoint:** `POST /api/payments` (public route, no auth required)

**Request body:**
```json
{ "amount": number, "description": string }
```

**Success response (201):**
```json
{
  "success": true,
  "payment": { "paymentId": "PAY-...", ... }
}
```

**Error response (400):**
```json
{ "error": "Amount must be a positive number" }
```

## Component: `CreatePaymentModal`

**Props:** `onClose: () => void`

**Form fields:**
- `amount` — number input, required, min 0.01, step 0.01, placeholder "0.00"
- `description` — text input, optional, placeholder "Order ref, customer name…"

**States:** `idle` | `submitting` | `error`

**Behaviour:**
1. On submit: validate `amount > 0`, call `axios.post('/api/payments', { amount, description })`
2. On success: call `onClose()` then `navigate('/payments/' + paymentId)`
3. On error: display `err.response?.data?.error ?? 'Failed to create payment'` inside the modal (no toast — error is local to the form)
4. Clicking backdrop or pressing Escape closes the modal (only when not submitting)
5. Submit button disabled + shows "Creating…" while submitting

**Styling:** matches existing modal patterns in `PaymentDetail.jsx` (dark overlay, `bg-gray-900` card, emerald primary button, rose error text).

## Changes to `Payments.jsx`

- Add `showCreate` boolean state (default `false`)
- Add "New Payment" button (emerald, `Plus` icon from lucide-react) to the page header, right-aligned
- Render `<CreatePaymentModal onClose={() => setShowCreate(false)} />` when `showCreate` is true
- No list refresh needed — navigating to detail page on success means the user leaves the list anyway

## Error handling

| Scenario | Behaviour |
|---|---|
| Amount ≤ 0 | Client-side validation, no API call |
| API 400 (bad amount) | Show `error.response.data.error` in modal |
| API 429 (rate limited) | Show generic "Failed to create payment" |
| Network error | Show generic "Failed to create payment" |

## Out of scope

- `metadata` field (admin doesn't need it)
- List auto-refresh after creation (navigate to detail instead)
- Duplicate submission guard beyond disabling the button
