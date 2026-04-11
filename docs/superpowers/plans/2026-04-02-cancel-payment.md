# Cancel Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cancel button on the payment detail page that sets a `pending` payment to `cancelled`.

**Architecture:** One new controller method (`cancelPayment`) + one new route, plus a cancel button in `PaymentDetail.jsx` visible only when `status === 'pending'`.

**Tech Stack:** Node.js/Express, Mongoose, React, Axios, Tailwind CSS

---

## Files

- Modify: `src/controllers/adminController.js` — add `cancelPayment` method
- Modify: `src/routes/admin.js` — register `POST /payments/:paymentId/cancel`
- Modify: `dashboard/src/pages/PaymentDetail.jsx` — add cancel button + handler
- Modify: `tests/integration/api.test.js` — add cancel endpoint tests

---

### Task 1: Backend — `cancelPayment` controller + route

**Files:**
- Modify: `src/controllers/adminController.js`
- Modify: `src/routes/admin.js`

- [ ] **Step 1: Add `cancelPayment` method to `adminController.js`**

In `src/controllers/adminController.js`, add this method inside the `AdminController` class, after `retrySweep`:

```js
  /**
   * POST /api/admin/payments/:paymentId/cancel
   * Annule un paiement en attente
   */
  async cancelPayment(req, res) {
    try {
      const payment = await Payment.findOne({ paymentId: req.params.paymentId });

      if (!payment) {
        return res.status(404).json({ error: 'Paiement non trouvé' });
      }

      if (payment.status !== 'pending') {
        return res.status(400).json({
          error: `Impossible d'annuler un paiement au statut "${payment.status}"`,
        });
      }

      payment.status = 'cancelled';
      await payment.save();

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_cancelled',
        req,
      });

      return res.json({ success: true, payment });
    } catch (error) {
      console.error('Erreur cancelPayment:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }
```

- [ ] **Step 2: Register the route in `src/routes/admin.js`**

Add after the `retry-sweep` line:

```js
// Annuler un paiement
router.post('/payments/:paymentId/cancel', adminController.cancelPayment);
```

---

### Task 2: Integration tests

**Files:**
- Modify: `tests/integration/api.test.js`

- [ ] **Step 1: Add cancel tests**

Append this `describe` block to `tests/integration/api.test.js`, before the final closing of the file:

```js
describe('POST /api/admin/payments/:paymentId/cancel', () => {
  it('cancels a pending payment', async () => {
    const createRes = await request
      .post('/api/payments')
      .send({ amount: 10, currency: 'USDT' })
    const paymentId = createRes.body.paymentId

    const res = await request
      .post(`/api/admin/payments/${paymentId}/cancel`)
      .set(adminHeaders)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.payment.status).toBe('cancelled')
  })

  it('returns 400 when payment is not pending', async () => {
    const createRes = await request
      .post('/api/payments')
      .send({ amount: 10, currency: 'USDT' })
    const paymentId = createRes.body.paymentId

    // Cancel once
    await request
      .post(`/api/admin/payments/${paymentId}/cancel`)
      .set(adminHeaders)

    // Try to cancel again
    const res = await request
      .post(`/api/admin/payments/${paymentId}/cancel`)
      .set(adminHeaders)

    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown paymentId', async () => {
    const res = await request
      .post('/api/admin/payments/PAY-UNKNOWN/cancel')
      .set(adminHeaders)

    expect(res.status).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const createRes = await request
      .post('/api/payments')
      .send({ amount: 10, currency: 'USDT' })
    const paymentId = createRes.body.paymentId

    const res = await request.post(`/api/admin/payments/${paymentId}/cancel`)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mitch/crypto-api && npx jest tests/integration/api.test.js --no-coverage 2>&1 | tail -20
```

Expected: all tests pass (including the 4 new ones).

- [ ] **Step 3: Commit**

```bash
git add src/controllers/adminController.js src/routes/admin.js tests/integration/api.test.js
git commit -m "feat: cancel payment endpoint (POST /admin/payments/:id/cancel)"
```

---

### Task 3: Frontend — cancel button in `PaymentDetail.jsx`

**Files:**
- Modify: `dashboard/src/pages/PaymentDetail.jsx`

- [ ] **Step 1: Add `cancelling` state**

Find the existing state declarations (around line 51):
```js
const [retrying, setRetrying] = useState(false)
```
Add after it:
```js
const [cancelling, setCancelling] = useState(false)
```

- [ ] **Step 2: Add `handleCancel` function**

Add after `handleRetrySweep`:

```js
  async function handleCancel() {
    if (!window.confirm('Annuler ce paiement ?')) return
    setCancelling(true)
    try {
      await api.post(`/payments/${id}/cancel`)
      showToast('Paiement annulé')
      const res = await api.get(`/payments/${id}`)
      setPayment(res.data.payment)
    } catch {
      showToast('Impossible d\'annuler le paiement', 'error')
    } finally {
      setCancelling(false)
    }
  }
```

- [ ] **Step 3: Add cancel button in the header**

Find the header block containing the "Retry Sweep" button (around line 112):

```jsx
        {payment.sweepStatus === 'failed' && (
          <button
            onClick={handleRetrySweep}
            disabled={retrying}
            className="ml-auto px-4 py-2 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-rose-100 text-sm rounded-lg transition-colors"
          >
            {retrying ? 'Retrying\u2026' : 'Retry Sweep'}
          </button>
        )}
```

Replace with:

```jsx
        <div className="ml-auto flex items-center gap-2">
          {payment.status === 'pending' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm rounded-lg transition-colors"
            >
              {cancelling ? 'Annulation\u2026' : 'Cancel Payment'}
            </button>
          )}
          {payment.sweepStatus === 'failed' && (
            <button
              onClick={handleRetrySweep}
              disabled={retrying}
              className="px-4 py-2 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-rose-100 text-sm rounded-lg transition-colors"
            >
              {retrying ? 'Retrying\u2026' : 'Retry Sweep'}
            </button>
          )}
        </div>
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/pages/PaymentDetail.jsx
git commit -m "feat: cancel payment button on payment detail page"
```
