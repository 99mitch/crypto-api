import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import { formatUSDT, formatDateTime } from '../utils/formatters'

const STATUS_OPTIONS = ['', 'pending', 'confirming', 'confirmed', 'expired', 'swept', 'failed']

export default function Payments() {
  const navigate = useNavigate()
  const [payments, setPayments] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ status: '', from: '', to: '' })

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 20 })
    if (filters.status) params.set('status', filters.status)
    // Convert YYYY-MM-DD (date input) to ISO strings the API expects
    if (filters.from) params.set('from', new Date(filters.from + 'T00:00:00').toISOString())
    if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59').toISOString())

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
      <h1 className="text-xl font-semibold text-gray-100">Payments</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={e => handleFilterChange('status', e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-600"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={e => handleFilterChange('from', e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-600"
        />
        <input
          type="date"
          value={filters.to}
          onChange={e => handleFilterChange('to', e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-600"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {error && <p className="p-4 text-rose-400 text-sm">{error}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
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
                  <tr key={i} className="border-b border-gray-800">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : payments.map(p => (
                  <tr
                    key={p.paymentId}
                    onClick={() => navigate(`/payments/${p.paymentId}`)}
                    className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-gray-300 truncate max-w-xs">{p.paymentId}</td>
                    <td className="px-4 py-3 text-gray-300">{formatUSDT(p.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDateTime(p.updatedAt)}</td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {!loading && payments.length === 0 && !error && (
          <p className="p-6 text-center text-gray-500 text-sm">No payments found.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{total} total payments</p>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}
