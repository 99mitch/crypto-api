import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import AuditTimeline from '../components/AuditTimeline'
import { formatCrypto, formatDateTime } from '../utils/formatters'

function Toast({ message, type }) {
  return (
    <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${
      type === 'error' ? 'bg-rose-900 text-rose-100 border border-rose-700' : 'bg-zinc-800 text-zinc-100 border border-zinc-700'
    }`}>
      {message}
    </div>
  )
}

function DetailRow({ label, value }) {
  if (value == null || value === '' || value === null) return null
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-500 text-sm sm:w-40 shrink-0">{label}</span>
      <span className="text-zinc-200 text-sm font-mono break-all">{String(value)}</span>
    </div>
  )
}

function CurrencyBadge({ currency }) {
  if (currency === 'BTC') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
        BTC
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-600">
      USDT
    </span>
  )
}

export default function PaymentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [payment, setPayment] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState(null)

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    api.get(`/payments/${id}`)
      .then(res => {
        setPayment(res.data.payment)
        setHistory(res.data.history)
      })
      .catch(() => setError('Failed to load payment details'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleRetrySweep() {
    if (!window.confirm('Retry the sweep for this payment?')) return
    setRetrying(true)
    try {
      await api.post(`/payments/${id}/retry-sweep`)
      showToast('Sweep retry initiated successfully')
      // Refresh payment data
      const res = await api.get(`/payments/${id}`)
      setPayment(res.data.payment)
    } catch {
      showToast('Failed to retry sweep', 'error')
    } finally {
      setRetrying(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this payment?')) return
    setCancelling(true)
    try {
      await api.post(`/payments/${id}/cancel`)
      showToast('Payment cancelled')
      const res = await api.get(`/payments/${id}`)
      setPayment(res.data.payment)
    } catch {
      showToast('Failed to cancel payment', 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 h-64 animate-pulse" />
      </div>
    )
  }

  if (error || !payment) {
    return <p className="text-rose-400 text-sm">{error ?? 'Payment not found'}</p>
  }

  const isBTC = payment.currency === 'BTC'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/payments')}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-zinc-100 font-mono">{payment.paymentId}</h1>
        <StatusBadge status={payment.status} />
        <div className="ml-auto flex items-center gap-2">
          {payment.status === 'pending' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm rounded-lg transition-colors"
            >
              {cancelling ? 'Cancelling\u2026' : 'Cancel Payment'}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment info */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Payment Details</h2>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-zinc-800">
              <span className="text-zinc-500 text-sm sm:w-40 shrink-0">Amount</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-200 text-sm font-mono">{formatCrypto(payment.amount, payment.currency)}</span>
                <CurrencyBadge currency={payment.currency} />
              </div>
            </div>
            {payment.receivedAmount != null && (
              <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-zinc-800">
                <span className="text-zinc-500 text-sm sm:w-40 shrink-0">Received</span>
                <span className="text-zinc-200 text-sm font-mono">{formatCrypto(payment.receivedAmount, payment.currency)}</span>
              </div>
            )}
            {isBTC && payment.usdAmount != null && (
              <DetailRow label="Montant USD" value={`$${Number(payment.usdAmount).toFixed(2)} USD`} />
            )}
            {isBTC && payment.exchangeRate != null && (
              <DetailRow label="Taux" value={`${payment.exchangeRate.toLocaleString()} USD/BTC`} />
            )}
            <DetailRow label="Wallet Address" value={payment.walletAddress} />
            <DetailRow label="Sender Address" value={payment.senderAddress} />
            <DetailRow label="TX Hash" value={payment.txHash} />
            <DetailRow label="Confirmations" value={payment.confirmations} />
            <DetailRow label="Sweep Status" value={payment.sweepStatus} />
            <DetailRow label="Sweep TX Hash" value={payment.sweepTxHash} />
            <DetailRow label="Expires At" value={payment.expiresAt ? formatDateTime(payment.expiresAt) : null} />
            <DetailRow label="Webhook Sent" value={payment.webhookSentAt ? formatDateTime(payment.webhookSentAt) : null} />
            <DetailRow label="Webhook Attempts" value={payment.webhookAttempts} />
            <DetailRow label="Description" value={payment.description} />
            <DetailRow label="Created At" value={formatDateTime(payment.createdAt)} />
            <DetailRow label="Updated At" value={formatDateTime(payment.updatedAt)} />
          </div>
          {payment.metadata && Object.keys(payment.metadata).length > 0 && (
            <div className="mt-3">
              <p className="text-zinc-500 text-sm mb-1">Metadata</p>
              <pre className="text-xs bg-zinc-950 rounded p-2 text-zinc-300 overflow-x-auto">
                {JSON.stringify(payment.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* QR Code */}
        {payment.qrCode && (
          <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 flex flex-col items-center justify-center">
            <h2 className="text-sm font-medium text-zinc-300 mb-4 self-start">Payment QR Code</h2>
            <img
              src={payment.qrCode}
              alt="Payment QR Code"
              className="w-48 h-48 rounded-lg"
            />
            <p className="text-xs text-zinc-500 mt-3 text-center break-all font-mono">{payment.walletAddress}</p>
          </div>
        )}
      </div>

      {/* Audit Timeline */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-300 mb-5">Audit Trail</h2>
        <AuditTimeline history={history} />
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}
