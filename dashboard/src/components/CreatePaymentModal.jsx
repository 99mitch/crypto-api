import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useApi'
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
    if (isNaN(parsedAmount) || parsedAmount < 0.01) {
      setError('Amount must be at least 0.01 USDT')
      return
    }
    const payload = { amount: parsedAmount }
    const trimmedDesc = description.trim()
    if (trimmedDesc) payload.description = trimmedDesc

    setSubmitting(true)
    setError(null)
    try {
      const res = await api.post('/payments', payload)
      navigate('/payments/' + res.data.payment.paymentId)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create payment')
    } finally {
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
