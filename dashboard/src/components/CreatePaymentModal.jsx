import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useApi'
import { X } from 'lucide-react'

export default function CreatePaymentModal({ onClose }) {
  const navigate = useNavigate()
  const [currency, setCurrency] = useState('USDT')
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
    const minAmount = currency === 'BTC' ? 1 : 0.01
    const minLabel = currency === 'BTC' ? '1 USD' : '0.01 USDT'
    if (isNaN(parsedAmount) || parsedAmount < minAmount) {
      setError(`Amount must be at least ${minLabel}`)
      return
    }
    const payload = { amount: parsedAmount, currency }
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

  const isBTC = currency === 'BTC'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-100">New Payment</h2>
          <button
            onClick={() => { if (!submitting) onClose() }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Currency toggle */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Currency</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCurrency('USDT'); setError(null) }}
                className={`flex-1 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  !isBTC
                    ? 'bg-blue-600 text-white border border-blue-600'
                    : 'bg-transparent text-zinc-400 border border-zinc-700 hover:border-zinc-500'
                }`}
              >
                USDT
              </button>
              <button
                type="button"
                onClick={() => { setCurrency('BTC'); setError(null) }}
                className={`flex-1 px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  isBTC
                    ? 'bg-blue-600 text-white border border-blue-600'
                    : 'bg-transparent text-zinc-400 border border-zinc-700 hover:border-zinc-500'
                }`}
              >
                BTC
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              {isBTC ? 'Amount (USD)' : 'Amount (USDT)'} *
            </label>
            {isBTC && (
              <p className="text-xs text-zinc-500 mb-1">(converti en BTC au taux actuel)</p>
            )}
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={isBTC ? '1' : '0.01'}
              step={isBTC ? '1' : '0.01'}
              placeholder="25.00"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Order ref, customer name…"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { if (!submitting) onClose() }}
              className="flex-1 px-4 py-2 text-sm text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium border border-zinc-100 text-zinc-100 rounded-lg hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
