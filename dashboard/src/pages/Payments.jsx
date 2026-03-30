import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import { formatCrypto, formatDateTime, getDayRange } from '../utils/formatters'
import CreatePaymentModal from '../components/CreatePaymentModal'

const STATUS_OPTIONS = ['', 'pending', 'confirming', 'confirmed', 'expired', 'cancelled', 'swept', 'failed']
const CURRENCY_OPTIONS = ['', 'USDT', 'BTC']

export default function Payments() {
  const navigate = useNavigate()
  const [payments, setPayments] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ status: '', currency: '', from: '', to: '' })
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 20 })
    if (filters.status) params.set('status', filters.status)
    if (filters.currency) params.set('currency', filters.currency)
    if (filters.from) params.set('from', getDayRange(new Date(filters.from)).from)
    if (filters.to) params.set('to', getDayRange(new Date(filters.to)).to)

    api.get(`/payments?${params}`)
      .then(r => {
        setPayments(r.data.payments)
        setTotal(r.data.total)
        setTotalPages(r.data.totalPages)
        setError(null)
      })
      .catch(() => setError('Failed to load payments'))
      .finally(() => setLoading(false))
  }, [page, filters])

  function handleFilterChange(field, value) {
    setFilters(f => ({ ...f, [field]: value }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Payments</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-zinc-100 text-zinc-100 rounded-lg hover:bg-zinc-100 hover:text-zinc-950 transition-colors"
        >
          <Plus size={16} />
          New Payment
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={e => handleFilterChange('status', e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-400"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filters.currency}
          onChange={e => handleFilterChange('currency', e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-400"
        >
          <option value="">All currencies</option>
          {CURRENCY_OPTIONS.filter(Boolean).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={e => handleFilterChange('from', e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-400"
        />
        <input
          type="date"
          value={filters.to}
          onChange={e => handleFilterChange('to', e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-400"
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        {error && <p className="p-4 text-rose-400 text-sm">{error}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
              <th className="px-4 py-3 font-medium">Payment ID</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Created</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : payments.map(p => (
                  <tr
                    key={p.paymentId}
                    onClick={() => navigate(`/payments/${p.paymentId}`)}
                    className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-zinc-300 truncate max-w-xs">{p.paymentId}</td>
                    <td className="px-4 py-3 text-zinc-300">{formatCrypto(p.amount, p.currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{formatDateTime(p.updatedAt)}</td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {!loading && payments.length === 0 && !error && (
          <p className="p-6 text-center text-zinc-500 text-sm">No payments found.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{total} total payments</p>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {showCreate && (
        <CreatePaymentModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  )
}
