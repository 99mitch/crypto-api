# Payment Creation Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "New Payment" button to the Payments page that opens a modal letting admins create a USDT payment by entering an amount and optional description.

**Architecture:** A new `CreatePaymentModal` component owns all form state, validation, API call, and navigation. It calls the public `POST /api/payments` endpoint via plain axios (not the admin singleton). `Payments.jsx` conditionally renders it and owns only the open/close boolean.

**Tech Stack:** React 18, React Router v6 (`useNavigate`), axios, Tailwind CSS v3, Vitest + @testing-library/react

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `dashboard/src/components/CreatePaymentModal.jsx` | Create | Form, validation, API call, navigation |
| `dashboard/src/components/CreatePaymentModal.test.jsx` | Create | Tests for modal behaviour |
| `dashboard/src/pages/Payments.jsx` | Modify | Add button + showCreate state |
| `dashboard/src/pages/Payments.test.jsx` | Create | Smoke tests for New Payment button wiring |

---

### Task 1: CreatePaymentModal component (TDD)

**Files:**
- Create: `dashboard/src/components/CreatePaymentModal.jsx`
- Create: `dashboard/src/components/CreatePaymentModal.test.jsx`

**Note:** `lucide-react` icons `X` and `Plus` are used throughout the existing codebase (e.g. `dashboard/src/components/Sidebar.jsx` uses lucide-react). Both are available at the installed version.

---

- [ ] **Step 1: Write failing tests**

Create `dashboard/src/components/CreatePaymentModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreatePaymentModal from './CreatePaymentModal'

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import axios from 'axios'

function renderModal(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <CreatePaymentModal onClose={onClose} />
    </MemoryRouter>
  )
}

describe('CreatePaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders amount and description fields', () => {
    renderModal()
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/order ref/i)).toBeInTheDocument()
  })

  it('shows validation error when amount is below 0.01', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0.005' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText(/at least 0.01/i)).toBeInTheDocument()
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('shows validation error when amount is zero', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText(/at least 0.01/i)).toBeInTheDocument()
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('omits description from payload when blank', async () => {
    axios.post.mockResolvedValue({ data: { payment: { paymentId: 'PAY-abc' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/payments',
      { amount: 10 }
    ))
  })

  it('includes description in payload when provided', async () => {
    axios.post.mockResolvedValue({ data: { payment: { paymentId: 'PAY-abc' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText(/order ref/i), { target: { value: 'Order #42' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
      '/api/payments',
      { amount: 10, description: 'Order #42' }
    ))
  })

  it('navigates to payment detail on success', async () => {
    axios.post.mockResolvedValue({ data: { payment: { paymentId: 'PAY-xyz' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/payments/PAY-xyz'))
  })

  it('shows API error message on failure', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: 'Montant minimum: 0.01 USDT' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText('Montant minimum: 0.01 USDT')).toBeInTheDocument()
  })

  it('shows fallback error message when API returns no error body', async () => {
    axios.post.mockRejectedValue(new Error('Network Error'))
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText('Failed to create payment')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    renderModal(onClose)
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run src/components/CreatePaymentModal.test.jsx
```

Expected: FAIL — `Cannot find module './CreatePaymentModal'`

- [ ] **Step 3: Implement `CreatePaymentModal`**

Create `dashboard/src/components/CreatePaymentModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { X } from 'lucide-react'

export default function CreatePaymentModal({ onClose }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [submitting, onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount < 0.01) {
      setError('Amount must be at least 0.01 USDT')
      return
    }
    const payload = { amount: parsedAmount }
    const trimmedDesc = description.trim()
    if (trimmedDesc) payload.description = trimmedDesc

    setSubmitting(true)
    setError(null)
    try {
      const res = await axios.post('/api/payments', payload)
      navigate('/payments/' + res.data.payment.paymentId)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create payment')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-100">New Payment</h2>
          <button
            onClick={() => { if (!submitting) onClose() }}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount (USDT) *</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-600"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Order ref, customer name…"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-600"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { if (!submitting) onClose() }}
              className="flex-1 px-4 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run src/components/CreatePaymentModal.test.jsx
```

Expected: **8 tests pass**, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /home/mitch/crypto-api && git add dashboard/src/components/CreatePaymentModal.jsx dashboard/src/components/CreatePaymentModal.test.jsx && git commit -m "feat: add CreatePaymentModal component"
```

---

### Task 2: Wire modal into Payments page (TDD)

**Files:**
- Modify: `dashboard/src/pages/Payments.jsx`
- Create: `dashboard/src/pages/Payments.test.jsx`

---

- [ ] **Step 1: Write failing smoke test for the New Payment button**

Create `dashboard/src/pages/Payments.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Payments from './Payments'

// Mock the admin api singleton so it doesn't make real requests
vi.mock('../hooks/useApi', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { payments: [], total: 0, totalPages: 1 } }) },
}))

// Mock CreatePaymentModal to isolate wiring test
vi.mock('../components/CreatePaymentModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="create-modal">
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

function renderPayments() {
  return render(
    <MemoryRouter>
      <Payments />
    </MemoryRouter>
  )
}

describe('Payments page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a "New Payment" button', () => {
    renderPayments()
    expect(screen.getByRole('button', { name: /new payment/i })).toBeInTheDocument()
  })

  it('opens the modal when "New Payment" is clicked', () => {
    renderPayments()
    expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /new payment/i }))
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
  })

  it('closes the modal when onClose is called', () => {
    renderPayments()
    fireEvent.click(screen.getByRole('button', { name: /new payment/i }))
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run src/pages/Payments.test.jsx
```

Expected: FAIL — "New Payment" button not found.

- [ ] **Step 3: Update `Payments.jsx`**

**Add two imports** to the existing import block at the top of `dashboard/src/pages/Payments.jsx`. The file currently imports from `'react'`, `'react-router-dom'`, `'../hooks/useApi'`, `'../components/StatusBadge'`, `'../components/Pagination'`, and `'../utils/formatters'`. Add these two lines:

```jsx
import { Plus } from 'lucide-react'
import CreatePaymentModal from '../components/CreatePaymentModal'
```

**Add `showCreate` state** inside the `Payments` function body, after the existing state declarations (after line `const [filters, setFilters] = useState(...)`):

```jsx
const [showCreate, setShowCreate] = useState(false)
```

**Replace the bare `<h1>`** (currently the first element inside `return (<div className="space-y-4">`):

Replace:
```jsx
      <h1 className="text-xl font-semibold text-gray-100">Payments</h1>
```

With:
```jsx
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Payments</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors"
        >
          <Plus size={16} />
          New Payment
        </button>
      </div>
```

**Add modal render** as the last child inside the outermost `<div className="space-y-4">`, just before its closing `</div>`:

```jsx
      {showCreate && (
        <CreatePaymentModal onClose={() => setShowCreate(false)} />
      )}
```

- [ ] **Step 4: Run all tests to verify everything passes**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run
```

Expected: **15 tests pass** (4 formatters + 8 modal + 3 Payments page), 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /home/mitch/crypto-api && git add dashboard/src/pages/Payments.jsx dashboard/src/pages/Payments.test.jsx && git commit -m "feat: add New Payment button to Payments page"
```

---

## Manual Verification

After both tasks are complete, verify in the browser:

1. Start the dev server: `cd /home/mitch/crypto-api/dashboard && npm run dev`
2. Navigate to `/payments`
3. Confirm "New Payment" button appears top-right
4. Click it — modal opens with Amount and Description fields
5. Submit with amount `0` → error "Amount must be at least 0.01 USDT" (no API call)
6. Submit with amount `10`, description `Test order` → navigates to `/payments/PAY-...`
7. Open modal again, press Escape or click backdrop → modal closes
