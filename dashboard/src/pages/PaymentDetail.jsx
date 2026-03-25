import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import AuditTimeline from '../components/AuditTimeline'
import { formatUSDT, formatDateTime } from '../utils/formatters'

function Toast({ message, type }) {
  return (
    <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 ${
      type === 'error' ? 'bg-rose-900 text-rose-100 border border-rose-700' : 'bg-emerald-900 text-emerald-100 border border-emerald-700'
    }`}>
      {message}
    </div>
  )
}

function DetailRow({ label, value }) {
  if (value == null || value === '' || value === null) return null
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 text-sm sm:w-40 shrink-0">{label}</span>
      <span className="text-gray-200 text-sm font-mono break-all">{String(value)}</span>
    </div>
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
  const [toast, setToast] = useState(null)

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    Promise.all([
      api.get(`/payments/${id}`),
      api.get(`/payments/${id}/history`),
    ])
      .then(([payRes, histRes]) => {
        setPayment(payRes.data.payment)
        setHistory(histRes.data.history)
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="bg-gray-900 rounded-xl border border-gray-800 h-64 animate-pulse" />
      </div>
    )
  }

  if (error || !payment) {
    return <p className="text-rose-400 text-sm">{error ?? 'Payment not found'}</p>
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/payments')}
          className="p-1.5 text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-gray-100 font-mono">{payment.paymentId}</h1>
        <StatusBadge status={payment.status} />
        {payment.sweepStatus === 'failed' && (
          <button
            onClick={handleRetrySweep}
            disabled={retrying}
            className="ml-auto px-4 py-2 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-rose-100 text-sm rounded-lg transition-colors"
          >
            {retrying ? 'Retrying\u2026' : 'Retry Sweep'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment info */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Payment Details</h2>
          <div>
            <DetailRow label="Amount" value={formatUSDT(payment.amount)} />
            <DetailRow label="Received" value={payment.receivedAmount ? formatUSDT(payment.receivedAmount) : null} />
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
              <p className="text-gray-500 text-sm mb-1">Metadata</p>
              <pre className="text-xs bg-gray-950 rounded p-2 text-gray-300 overflow-x-auto">
                {JSON.stringify(payment.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* QR Code */}
        {payment.qrCode && (
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex flex-col items-center justify-center">
            <h2 className="text-sm font-medium text-gray-300 mb-4 self-start">Payment QR Code</h2>
            <img
              src={payment.qrCode}
              alt="Payment QR Code"
              className="w-48 h-48 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-3 text-center break-all font-mono">{payment.walletAddress}</p>
          </div>
        )}
      </div>

      {/* Audit Timeline */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h2 className="text-sm font-medium text-gray-300 mb-5">Audit Trail</h2>
        <AuditTimeline history={history} />
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}
