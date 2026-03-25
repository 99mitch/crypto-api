import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, CreditCard, CheckCircle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import api from '../hooks/useApi'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { formatUSDT, formatRelativeTime, getDayRange } from '../utils/formatters'
import { STATUS_COLORS } from '../constants'

const STATUS_ORDER = ['swept', 'confirmed', 'confirming', 'pending', 'expired', 'failed']

function useDashboard() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchStats = async () => {
      try {
        const [statsRes, activityRes] = await Promise.all([
          api.get('/stats', { signal }),
          api.get('/recent-activity?limit=10', { signal }),
        ])
        setStats(statsRes.data.stats)
        setActivity(activityRes.data.activities)
        setError(null)
      } catch (err) {
        if (err.code === 'ERR_CANCELED') return
        if (err.response?.status !== 401) setError('Failed to load dashboard data')
      } finally {
        setLoading(prev => prev ? false : prev)
      }
    }

    const fetchChartData = async () => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        return d
      })
      try {
        const results = await Promise.all(
          days.map(day => {
            const { from, to } = getDayRange(day)
            return api.get(`/payments?from=${from}&to=${to}&status=swept&limit=1000`, { signal })
              .then(r => ({
                day: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                revenue: r.data.payments.reduce((sum, p) => sum + (p.receivedAmount || 0), 0),
              }))
          })
        )
        setChartData(results)
      } catch {
        // chart is non-critical, includes ERR_CANCELED on unmount
      }
    }

    fetchStats()
    fetchChartData()
    const interval = setInterval(fetchStats, 15000)

    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  return { stats, activity, chartData, loading, error }
}

export default function Dashboard() {
  const { stats, activity, chartData, loading, error } = useDashboard()

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-rose-400 text-sm">{error}</p>
  }

  const successRate = stats?.totalPayments
    ? ((stats.byStatus?.swept ?? 0) / stats.totalPayments * 100).toFixed(1)
    : '0.0'

  const statusChartData = STATUS_ORDER
    .filter(s => (stats?.byStatus?.[s] ?? 0) > 0)
    .map(s => ({ name: s, count: stats.byStatus[s] }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-zinc-100 animate-pulse" />
          Live
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatUSDT(stats?.totalRevenue ?? 0)}
          icon={DollarSign}
          accent
        />
        <StatCard
          title="Today's Revenue"
          value={formatUSDT(stats?.today?.revenue ?? 0)}
          subtitle={`${stats?.today?.count ?? 0} payments`}
          icon={TrendingUp}
        />
        <StatCard
          title="Total Payments"
          value={stats?.totalPayments ?? 0}
          icon={CreditCard}
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${stats?.byStatus?.swept ?? 0} swept`}
          icon={CheckCircle}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 7-day revenue */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">Revenue — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                labelStyle={{ color: '#f4f4f5' }}
                formatter={v => [`${v.toFixed(2)} USDT`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill="#d4d4d8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status distribution */}
        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">Payments by Status</h2>
          <div className="space-y-3">
            {statusChartData.map(({ name, count }) => {
              const pct = stats?.totalPayments ? (count / stats.totalPayments * 100).toFixed(0) : 0
              const colors = STATUS_COLORS[name]
              return (
                <div key={name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-400 capitalize">{name}</span>
                    <span className="text-zinc-300">{count}</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${colors.dot}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-300 mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-zinc-500 text-sm">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {activity.map(item => (
              <li key={item.paymentId} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={item.status} />
                  <span className="text-sm text-zinc-300 font-mono truncate">{item.paymentId}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm text-zinc-400">{formatUSDT(item.amount)}</span>
                  <span className="text-xs text-zinc-500">{formatRelativeTime(item.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
