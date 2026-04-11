# Cancel Payment — Design Spec

**Date:** 2026-04-02

## Summary

Add the ability for an admin to cancel a `pending` payment from the payment detail page.

## Backend

### Route
`POST /api/admin/payments/:paymentId/cancel`
Protected by `adminAuth` + `adminLimiter` (same as all other admin routes).

### Controller (`adminController.cancelPayment`)
1. Find payment by `paymentId`.
2. Return `404` if not found.
3. Return `400` if `status !== 'pending'` (cannot cancel confirmed/expired/swept/already-cancelled payments).
4. Set `status = 'cancelled'`, save.
5. Write audit log entry: `action: 'payment_cancelled'`.
6. Return `{ success: true, payment }`.

### No side effects
A cancelled payment has no funds on-chain (still pending), so no sweep or webhook is triggered.

## Frontend

### Component: `PaymentDetail.jsx`
- Add `cancelling` state (boolean).
- Add `handleCancel` function: `window.confirm` → `POST /payments/:id/cancel` → toast + refresh payment.
- Render cancel button in the header row, next to the existing "Retry Sweep" button.
- Button visible only when `payment.status === 'pending'`.
- Button style: `bg-zinc-800 hover:bg-zinc-700 text-zinc-100` (neutral destructive, consistent with the dark theme).
- Disabled + label "Cancelling…" while in-flight.

## Error handling
- API error → toast `'Failed to cancel payment'` (type `error`).
- Non-pending status blocked at API level (400), dashboard also hides the button defensively.

## Audit
Adds one audit log entry per cancel: `payment_cancelled` at level `info`.
