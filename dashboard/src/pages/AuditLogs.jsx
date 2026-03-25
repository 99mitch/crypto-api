import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import { formatDateTime, getDayRange } from '../utils/formatters'
import { ACTION_ENUM, LEVEL_COLORS } from '../constants'

const LEVEL_OPTIONS = Object.keys(LEVEL_COLORS)
const FILTER_CLS = 'px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-600'

export default function AuditLogs() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ action: '', level: '', from: '', to: '' })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 50 })
    if (filters.action) params.set('action', filters.action)
    if (filters.level) params.set('level', filters.level)
    if (filters.from) params.set('from', getDayRange(new Date(filters.from)).from)
    if (filters.to) params.set('to', getDayRange(new Date(filters.to)).to)

    api.get(`/audit-logs?${params}`, { signal: controller.signal })
      .then(r => {
        setLogs(r.data.logs)
        setTotal(r.data.total)
        setTotalPages(r.data.totalPages)
        setError(null)
      })
      .catch(err => { if (err.code !== 'ERR_CANCELED') setError('Failed to load audit logs') })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [page, filters])

  function handleFilterChange(field, value) {
    setFilters(f => ({ ...f, [field]: value }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-100">Audit Logs</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.action}
          onChange={e => handleFilterChange('action', e.target.value)}
          className={`${FILTER_CLS} max-w-xs`}
        >
          <option value="">All actions</option>
          {ACTION_ENUM.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={filters.level}
          onChange={e => handleFilterChange('level', e.target.value)}
          className={FILTER_CLS}
        >
          <option value="">All levels</option>
          {LEVEL_OPTIONS.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={e => handleFilterChange('from', e.target.value)}
          className={FILTER_CLS}
        />
        <input
          type="date"
          value={filters.to}
          onChange={e => handleFilterChange('to', e.target.value)}
          className={FILTER_CLS}
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {error && <p className="p-4 text-rose-400 text-sm">{error}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Payment ID</th>
              <th className="px-4 py-3 font-medium hidden xl:table-cell">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : logs.map((log, i) => (
                  <tr key={log._id ?? i} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3"><StatusBadge level={log.level} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {log.paymentId
                        ? <button
                            onClick={() => navigate(`/payments/${log.paymentId}`)}
                            className="text-emerald-400 hover:text-emerald-300 font-mono text-xs transition-colors"
                          >
                            {log.paymentId}
                          </button>
                        : <span className="text-gray-600">&mdash;</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden xl:table-cell">{log.ip ?? '—'}</td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {!loading && logs.length === 0 && !error && (
          <p className="p-6 text-center text-gray-500 text-sm">No logs found.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{total} total logs</p>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}
