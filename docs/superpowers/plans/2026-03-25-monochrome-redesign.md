# Monochrome UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current gray/emerald/coloured palette with a neutral zinc-based monochrome theme across all 12 dashboard files.

**Architecture:** Pure class-name substitution — no logic, layout, or component structure changes. The general rule is `gray-N → zinc-N` (same shade number) everywhere, with specific overrides for emerald/yellow/blue/red colours detailed per-task. All changes are in `dashboard/src/`.

**Tech Stack:** React 18, Tailwind CSS v3, Vite

---

## File Map

| File | Change type |
|------|------------|
| `dashboard/src/constants/index.js` | Full STATUS_COLORS + LEVEL_COLORS replacement |
| `dashboard/src/App.jsx` | gray→zinc mechanical |
| `dashboard/src/components/Sidebar.jsx` | gray→zinc + emerald→zinc overrides |
| `dashboard/src/components/StatCard.jsx` | gray→zinc + emerald accent→zinc |
| `dashboard/src/components/Pagination.jsx` | gray→zinc mechanical |
| `dashboard/src/components/AuditTimeline.jsx` | gray→zinc + emerald toggle→zinc |
| `dashboard/src/components/CreatePaymentModal.jsx` | gray→zinc + emerald button→white outline |
| `dashboard/src/pages/Login.jsx` | gray→zinc + emerald logo/button/input→zinc |
| `dashboard/src/pages/Dashboard.jsx` | gray→zinc + chart inline styles + live dot |
| `dashboard/src/pages/Payments.jsx` | gray→zinc + emerald button→white outline + filter focus |
| `dashboard/src/pages/PaymentDetail.jsx` | gray→zinc + emerald toast→zinc |
| `dashboard/src/pages/AuditLogs.jsx` | gray→zinc + emerald link/focus→zinc |

---

## Task 1: Color constants

**Files:**
- Modify: `dashboard/src/constants/index.js`

This is the foundation. After this change, `StatusBadge` and the progress bars in `Dashboard.jsx` automatically inherit the new zinc/rose palette — no structural changes to those components needed.

- [ ] **Step 1: Replace STATUS_COLORS and LEVEL_COLORS**

Replace the first 15 lines of `dashboard/src/constants/index.js` (everything before `export const ACTION_ENUM`) with:

```js
export const STATUS_COLORS = {
  swept:      { bg: 'bg-zinc-100',                          text: 'text-zinc-900', dot: 'bg-zinc-900' },
  confirmed:  { bg: 'bg-zinc-800 border border-zinc-700',   text: 'text-zinc-200', dot: 'bg-zinc-200' },
  confirming: { bg: 'bg-zinc-800 border border-zinc-700',   text: 'text-zinc-300', dot: 'bg-zinc-400' },
  pending:    { bg: 'bg-zinc-900 border border-zinc-700',   text: 'text-zinc-400', dot: 'bg-zinc-500' },
  expired:    { bg: 'bg-zinc-900 border border-zinc-800',   text: 'text-zinc-500', dot: 'bg-zinc-600' },
  failed:     { bg: 'bg-rose-950 border border-rose-900',   text: 'text-rose-400', dot: 'bg-rose-500' },
}

export const LEVEL_COLORS = {
  error: { bg: 'bg-rose-950 border border-rose-900', text: 'text-rose-400' },
  warn:  { bg: 'bg-zinc-800 border border-zinc-700', text: 'text-zinc-300' },
  info:  { bg: 'bg-zinc-900 border border-zinc-800', text: 'text-zinc-400' },
  debug: { bg: 'bg-zinc-900 border border-zinc-800', text: 'text-zinc-600' },
}
```

Leave `ACTION_ENUM`, `ACTION_ICON`, and `getActionIcon` unchanged.

- [ ] **Step 2: Verify build passes**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: `✓ built in` with no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/constants/index.js
git commit -m "style: replace STATUS_COLORS and LEVEL_COLORS with zinc/rose palette"
```

---

## Task 2: App shell — App.jsx and Sidebar.jsx

**Files:**
- Modify: `dashboard/src/App.jsx`
- Modify: `dashboard/src/components/Sidebar.jsx`

- [ ] **Step 1: Update App.jsx**

Three class string replacements in `dashboard/src/App.jsx`:

```
// Line 20 — layout wrapper
"flex h-screen bg-gray-950 text-gray-100 overflow-hidden"
→
"flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden"

// Line 31 — mobile top bar
"md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800"
→
"md:hidden flex items-center gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800"

// Line 34 — hamburger button
"p-1.5 text-gray-400 hover:text-gray-100 rounded-lg"
→
"p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg"
```

- [ ] **Step 2: Update Sidebar.jsx**

Replace the entire `className` template literal on the `<aside>` (lines 19-24):

```jsx
// was:
<aside className={`
  fixed md:static inset-y-0 left-0 z-30
  w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0
  transform transition-transform duration-200
  ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
`}>

// becomes:
<aside className={`
  fixed md:static inset-y-0 left-0 z-30
  w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0
  transform transition-transform duration-200
  ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
`}>
```

Logo section (lines 26-34):
```jsx
// was:
<div className="flex items-center justify-between gap-2.5 px-5 py-5 border-b border-gray-800">
  <div className="flex items-center gap-2.5">
    <Zap size={22} className="text-emerald-400" />
    <span className="text-base font-semibold text-gray-100">CryptoPay</span>
  </div>
  <button onClick={onClose} className="md:hidden p-1 text-gray-500 hover:text-gray-300">

// becomes:
<div className="flex items-center justify-between gap-2.5 px-5 py-5 border-b border-zinc-800">
  <div className="flex items-center gap-2.5">
    <Zap size={22} className="text-zinc-100" />
    <span className="text-base font-semibold text-zinc-100">CryptoPay</span>
  </div>
  <button onClick={onClose} className="md:hidden p-1 text-zinc-500 hover:text-zinc-300">
```

NavLink className function (lines 43-47) — replace the whole conditional:

```jsx
// was:
className={({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
    isActive
      ? 'bg-emerald-900/40 text-emerald-400 font-medium'
      : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
  }`
}

// becomes:
className={({ isActive }) =>
  isActive
    ? 'flex items-center gap-3 pl-[10px] pr-3 py-2.5 rounded-lg text-sm transition-colors border-l-2 border-zinc-100 text-zinc-100 font-medium bg-zinc-800/50'
    : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
}
```

Logout section (lines 57-64):
```jsx
// was:
<div className="px-3 py-4 border-t border-gray-800">
  <button
    onClick={handleLogout}
    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-rose-400 hover:bg-gray-800 transition-colors"

// becomes:
<div className="px-3 py-4 border-t border-zinc-800">
  <button
    onClick={handleLogout}
    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
```

- [ ] **Step 3: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/App.jsx dashboard/src/components/Sidebar.jsx
git commit -m "style: App shell and Sidebar — gray→zinc, emerald→zinc"
```

---

## Task 3: Shared UI components — StatCard, Pagination, AuditTimeline

**Files:**
- Modify: `dashboard/src/components/StatCard.jsx`
- Modify: `dashboard/src/components/Pagination.jsx`
- Modify: `dashboard/src/components/AuditTimeline.jsx`

- [ ] **Step 1: Rewrite StatCard.jsx**

Replace the entire file content:

```jsx
export default function StatCard({ title, value, subtitle, icon: Icon, accent = false }) {
  return (
    <div className={`bg-zinc-900 rounded-xl p-5 border ${accent ? 'border-zinc-100' : 'border-zinc-800'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-zinc-100">
            {value}
          </p>
          {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-2 bg-zinc-800 rounded-lg">
            <Icon size={20} className="text-zinc-400" />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update Pagination.jsx**

Replace the entire file content:

```jsx
export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-zinc-400">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-sm bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40 hover:bg-zinc-700 transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-sm bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40 hover:bg-zinc-700 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update AuditTimeline.jsx**

Replace the entire file content:

```jsx
import { useState } from 'react'
import { CreditCard, ArrowRightLeft, Webhook, ShieldCheck, Settings } from 'lucide-react'
import { getActionIcon } from '../constants'
import StatusBadge from './StatusBadge'
import { formatDateTime } from '../utils/formatters'

const ICON_MAP = { CreditCard, ArrowRightLeft, Webhook, ShieldCheck, Settings }

export default function AuditTimeline({ history }) {
  const [expanded, setExpanded] = useState({})

  if (!history?.length) {
    return <p className="text-zinc-500 text-sm">No history available.</p>
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-800" />

      <ul className="space-y-4">
        {history.map((entry, i) => {
          const iconName = getActionIcon(entry.action)
          const Icon = ICON_MAP[iconName] ?? Settings
          const hasDetails = entry.details && Object.keys(entry.details).length > 0
          const isExpanded = expanded[entry._id ?? i]

          return (
            <li key={entry._id ?? i} className="relative flex gap-4 pl-10">
              {/* Icon bubble */}
              <div className="absolute left-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 shrink-0">
                <Icon size={14} className="text-zinc-400" />
              </div>

              <div className="flex-1 bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-zinc-200">{entry.action}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge level={entry.level} />
                    <span className="text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</span>
                  </div>
                </div>

                {entry.ip && (
                  <p className="text-xs text-zinc-500 mt-1">IP: {entry.ip}</p>
                )}

                {hasDetails && (
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [entry._id ?? i]: !isExpanded }))}
                    className="text-xs text-zinc-300 hover:text-zinc-100 mt-2 transition-colors"
                  >
                    {isExpanded ? 'Hide details' : 'Show details'}
                  </button>
                )}

                {isExpanded && (
                  <pre className="mt-2 text-xs bg-zinc-950 rounded p-2 text-zinc-300 overflow-x-auto">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/components/StatCard.jsx \
        dashboard/src/components/Pagination.jsx \
        dashboard/src/components/AuditTimeline.jsx
git commit -m "style: StatCard, Pagination, AuditTimeline — gray→zinc, emerald→zinc"
```

---

## Task 4: Login page

**Files:**
- Modify: `dashboard/src/pages/Login.jsx`

- [ ] **Step 1: Rewrite Login.jsx**

Replace the entire file content:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Zap, KeyRound } from 'lucide-react'

export default function Login() {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hasError = searchParams.get('error') === '1'

  useEffect(() => {
    if (localStorage.getItem('adminKey')) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  function handleSubmit(e) {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    localStorage.setItem('adminKey', key.trim())
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2.5 bg-zinc-800/50 rounded-xl">
            <Zap size={28} className="text-zinc-100" />
          </div>
          <span className="text-2xl font-bold text-zinc-100">CryptoPay</span>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800">
          <h1 className="text-lg font-semibold text-zinc-100 mb-1">Admin Access</h1>
          <p className="text-sm text-zinc-400 mb-6">Enter your admin key to continue</p>

          {hasError && (
            <div className="mb-4 px-3 py-2.5 bg-rose-900/40 border border-rose-800 rounded-lg text-sm text-rose-300">
              Invalid admin key. Please try again.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Admin Key</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="password"
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter admin key"
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full py-2.5 border border-zinc-100 text-zinc-100 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/pages/Login.jsx
git commit -m "style: Login page — gray→zinc, emerald→white-outline"
```

---

## Task 5: Dashboard page

**Files:**
- Modify: `dashboard/src/pages/Dashboard.jsx`

This file has the most non-mechanical changes: chart inline styles (JS hex values, not Tailwind classes).

- [ ] **Step 1: Update loading skeleton**

```jsx
// was (lines 84-90):
<div className="space-y-6">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="bg-gray-900 rounded-xl p-5 border border-gray-800 h-28 animate-pulse" />
    ))}
  </div>
</div>

// becomes:
<div className="space-y-6">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 h-28 animate-pulse" />
    ))}
  </div>
</div>
```

- [ ] **Step 2: Update page header**

```jsx
// was (lines 108-114):
<div className="flex items-center justify-between">
  <h1 className="text-xl font-semibold text-gray-100">Dashboard</h1>
  <div className="flex items-center gap-2 text-xs text-gray-400">
    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
    Live
  </div>
</div>

// becomes:
<div className="flex items-center justify-between">
  <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
  <div className="flex items-center gap-2 text-xs text-zinc-400">
    <span className="w-2 h-2 rounded-full bg-zinc-100 animate-pulse" />
    Live
  </div>
</div>
```

- [ ] **Step 3: Update revenue chart panel**

```jsx
// was (lines 146-160):
<div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
  <h2 className="text-sm font-medium text-gray-300 mb-4">Revenue — Last 7 Days</h2>
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
      <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
      <Tooltip
        contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}
        labelStyle={{ color: '#e5e7eb' }}
        formatter={v => [`${v.toFixed(2)} USDT`, 'Revenue']}
      />
      <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</div>

// becomes:
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
```

- [ ] **Step 4: Update status distribution chart panel**

```jsx
// was (lines 163-186):
<div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
  <h2 className="text-sm font-medium text-gray-300 mb-4">Payments by Status</h2>
  <div className="space-y-3">
    {statusChartData.map(({ name, count }) => {
      const pct = stats?.totalPayments ? (count / stats.totalPayments * 100).toFixed(0) : 0
      const colors = STATUS_COLORS[name]
      return (
        <div key={name}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 capitalize">{name}</span>
            <span className="text-gray-300">{count}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
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

// becomes:
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
```

- [ ] **Step 5: Update Recent Activity section**

```jsx
// was (lines 189-210):
<div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
  <h2 className="text-sm font-medium text-gray-300 mb-4">Recent Activity</h2>
  {activity.length === 0 ? (
    <p className="text-gray-500 text-sm">No activity yet.</p>
  ) : (
    <ul className="divide-y divide-gray-800">
      {activity.map(item => (
        <li key={item.paymentId} className="py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <StatusBadge status={item.status} />
            <span className="text-sm text-gray-300 font-mono truncate">{item.paymentId}</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-sm text-gray-400">{formatUSDT(item.amount)}</span>
            <span className="text-xs text-gray-500">{formatRelativeTime(item.updatedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  )}
</div>

// becomes:
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
```

- [ ] **Step 6: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/pages/Dashboard.jsx
git commit -m "style: Dashboard page — gray→zinc, emerald→zinc, chart palette"
```

---

## Task 6: Payments page

**Files:**
- Modify: `dashboard/src/pages/Payments.jsx`

- [ ] **Step 1: Rewrite Payments.jsx**

Replace the entire file content:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import { formatUSDT, formatDateTime, getDayRange } from '../utils/formatters'
import CreatePaymentModal from '../components/CreatePaymentModal'

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
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 20 })
    if (filters.status) params.set('status', filters.status)
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
                    <td className="px-4 py-3 text-zinc-300">{formatUSDT(p.amount)}</td>
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
```

- [ ] **Step 2: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Run existing Payments tests to confirm no regressions**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run src/pages/Payments.test.jsx 2>&1 | tail -15
```
Expected: all 3 tests pass (they test behaviour, not styling — should be unaffected).

- [ ] **Step 4: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/pages/Payments.jsx
git commit -m "style: Payments page — gray→zinc, emerald→white-outline"
```

---

## Task 7: AuditLogs page

**Files:**
- Modify: `dashboard/src/pages/AuditLogs.jsx`

- [ ] **Step 1: Rewrite AuditLogs.jsx**

Replace the entire file content:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import { formatDateTime, getDayRange } from '../utils/formatters'
import { ACTION_ENUM, LEVEL_COLORS } from '../constants'

const LEVEL_OPTIONS = Object.keys(LEVEL_COLORS)
const FILTER_CLS = 'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-400'

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
      <h1 className="text-xl font-semibold text-zinc-100">Audit Logs</h1>

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
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        {error && <p className="p-4 text-rose-400 text-sm">{error}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-left">
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
                  <tr key={i} className="border-b border-zinc-800">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : logs.map((log, i) => (
                  <tr key={log._id ?? i} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3"><StatusBadge level={log.level} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {log.paymentId
                        ? <button
                            onClick={() => navigate(`/payments/${log.paymentId}`)}
                            className="text-zinc-300 hover:text-zinc-100 font-mono text-xs transition-colors"
                          >
                            {log.paymentId}
                          </button>
                        : <span className="text-zinc-600">&mdash;</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs hidden xl:table-cell">{log.ip ?? '—'}</td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {!loading && logs.length === 0 && !error && (
          <p className="p-6 text-center text-zinc-500 text-sm">No logs found.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{total} total logs</p>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/pages/AuditLogs.jsx
git commit -m "style: AuditLogs page — gray→zinc, emerald→zinc"
```

---

## Task 8: PaymentDetail page and CreatePaymentModal

**Files:**
- Modify: `dashboard/src/pages/PaymentDetail.jsx`
- Modify: `dashboard/src/components/CreatePaymentModal.jsx`

- [ ] **Step 1: Update PaymentDetail.jsx**

Apply the following replacements in `dashboard/src/pages/PaymentDetail.jsx`:

```
// Toast component (lines 11-16) — success variant only:
'bg-emerald-900 text-emerald-100 border border-emerald-700'
→
'bg-zinc-800 text-zinc-100 border border-zinc-700'

// All gray-* → zinc-* (mechanical, same shade number):
bg-gray-800  → bg-zinc-800
bg-gray-900  → bg-zinc-900
bg-gray-950  → bg-zinc-950
border-gray-800 → border-zinc-800
text-gray-100 → text-zinc-100
text-gray-200 → text-zinc-200
text-gray-300 → text-zinc-300
text-gray-400 → text-zinc-400
text-gray-500 → text-zinc-500
hover:text-gray-100 → hover:text-zinc-100
hover:bg-gray-800 → hover:bg-zinc-800
```

The Retry Sweep button (`bg-rose-800 hover:bg-rose-700 text-rose-100`) is **not changed**.

- [ ] **Step 2: Update CreatePaymentModal.jsx**

Apply the following replacements in `dashboard/src/components/CreatePaymentModal.jsx`:

```
// Submit button (line 103):
'flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
→
'flex-1 px-4 py-2 text-sm font-medium border border-zinc-100 text-zinc-100 rounded-lg hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

// All gray-* → zinc-* (mechanical):
bg-gray-900  → bg-zinc-900
bg-gray-800  → bg-zinc-800
bg-gray-700  → bg-zinc-700
border-gray-800 → border-zinc-800
border-gray-700 → border-zinc-700
text-gray-100 → text-zinc-100
text-gray-300 → text-zinc-300
text-gray-400 → text-zinc-400
text-gray-500 → text-zinc-500
placeholder-gray-600 → placeholder:text-zinc-600
focus:border-emerald-600 → focus:border-zinc-400
```

- [ ] **Step 3: Verify build**

```bash
cd /home/mitch/crypto-api/dashboard && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run 2>&1 | tail -20
```
Expected: all tests pass (CreatePaymentModal tests mock the API and test behaviour, not styling).

- [ ] **Step 5: Commit**

```bash
cd /home/mitch/crypto-api
git add dashboard/src/pages/PaymentDetail.jsx \
        dashboard/src/components/CreatePaymentModal.jsx
git commit -m "style: PaymentDetail and CreatePaymentModal — gray→zinc, emerald→zinc/white-outline"
```

---

## Final verification

- [ ] **Start dev server and visually check all pages**

```bash
cd /home/mitch/crypto-api/dashboard && npm run dev
```

Open http://localhost:5173 and check:
- Login page: zinc-950 background, zinc-900 card, white-outline Sign In button
- Dashboard: zinc sidebar with white active nav border, zinc stat cards, grey bar chart, zinc progress bars
- Payments: white-outline New Payment button, zinc table
- Payment detail: zinc cards, grey audit timeline
- Audit logs: zinc table, zinc filter inputs

- [ ] **Run full test suite one final time**

```bash
cd /home/mitch/crypto-api/dashboard && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass.
