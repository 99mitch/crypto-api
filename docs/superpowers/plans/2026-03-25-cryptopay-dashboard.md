# CryptoPay Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React admin dashboard served by the existing Express API, covering Login, Dashboard, Payments, PaymentDetail, and AuditLogs pages.

**Architecture:** Vite SPA with React Router v6 for client-side routing. A single Axios instance (`useApi.js`) injects `X-Admin-Key` from localStorage and handles 401 redirects globally. Each page manages its own data with `useState` + `useEffect`. No external state management library.

**Tech Stack:** Vite, React 18, React Router v6, Tailwind CSS v3, Recharts, Axios, Lucide React, Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-25-cryptopay-dashboard-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `dashboard/index.html` | Vite HTML entry point |
| `dashboard/vite.config.js` | Dev proxy `/api` → `localhost:3000`, output dir `build` |
| `dashboard/tailwind.config.js` | Dark mode config, content paths |
| `dashboard/src/main.jsx` | React root mount |
| `dashboard/src/App.jsx` | Router, ProtectedRoute, layout wrapper |
| `dashboard/src/constants/index.js` | Status colors, level colors, action enum, icon map |
| `dashboard/src/utils/formatters.js` | USDT formatting, relative time, date display |
| `dashboard/src/hooks/useApi.js` | Axios instance with X-Admin-Key interceptor |
| `dashboard/src/components/Sidebar.jsx` | Navigation links, logo, mobile toggle |
| `dashboard/src/components/StatCard.jsx` | Metric display card |
| `dashboard/src/components/StatusBadge.jsx` | Colored pill by payment status or audit level |
| `dashboard/src/components/Pagination.jsx` | Prev/next + page count |
| `dashboard/src/components/AuditTimeline.jsx` | Vertical timeline for audit history |
| `dashboard/src/pages/Login.jsx` | Key input, localStorage store, ?error=1 feedback |
| `dashboard/src/pages/Dashboard.jsx` | Stats, 7-day chart, status chart, activity feed |
| `dashboard/src/pages/Payments.jsx` | Paginated table with status+date filters |
| `dashboard/src/pages/PaymentDetail.jsx` | Payment info, QR code, retry sweep, audit timeline |
| `dashboard/src/pages/AuditLogs.jsx` | Paginated audit log table with filters |

---

## Task 1: Scaffold Vite project with Tailwind

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/index.html`
- Create: `dashboard/vite.config.js`
- Create: `dashboard/tailwind.config.js`
- Create: `dashboard/postcss.config.js`
- Create: `dashboard/src/index.css`
- Create: `dashboard/src/main.jsx`
- Create: `dashboard/src/App.jsx` (stub)

- [ ] **Step 1: Create `dashboard/package.json`**

```json
{
  "name": "cryptopay-dashboard",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "lucide-react": "^0.400.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.9",
    "vite": "^5.3.5",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `dashboard/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
})
```

- [ ] **Step 3: Create `dashboard/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 4: Create `dashboard/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create `dashboard/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CryptoPay Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `dashboard/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `dashboard/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 8: Create `dashboard/src/App.jsx` (stub — will be expanded later)**

```jsx
export default function App() {
  return <div className="bg-gray-950 min-h-screen text-gray-100">CryptoPay</div>
}
```

- [ ] **Step 9: Create `dashboard/src/test-setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 10: Install dependencies**

```bash
cd dashboard && npm install
```

Expected: installs without errors, `node_modules` created.

- [ ] **Step 11: Verify dev server starts**

```bash
cd dashboard && npm run dev
```

Expected: Vite starts on `http://localhost:5173`, page shows "CryptoPay" text on dark background.

- [ ] **Step 12: Commit**

```bash
git add dashboard/
git commit -m "feat: scaffold Vite + React + Tailwind dashboard"
```

---

## Task 2: Constants and utility functions (TDD)

**Files:**
- Create: `dashboard/src/constants/index.js`
- Create: `dashboard/src/utils/formatters.js`
- Create: `dashboard/src/utils/formatters.test.js`

- [ ] **Step 1: Create `dashboard/src/constants/index.js`**

```js
export const STATUS_COLORS = {
  pending:    { bg: 'bg-gray-700',   text: 'text-gray-300',   dot: 'bg-gray-400'   },
  confirming: { bg: 'bg-yellow-900', text: 'text-yellow-300', dot: 'bg-yellow-400' },
  confirmed:  { bg: 'bg-blue-900',   text: 'text-blue-300',   dot: 'bg-blue-400'   },
  expired:    { bg: 'bg-red-900',    text: 'text-red-300',    dot: 'bg-red-400'    },
  swept:      { bg: 'bg-emerald-900',text: 'text-emerald-300',dot: 'bg-emerald-400'},
  failed:     { bg: 'bg-rose-900',   text: 'text-rose-300',   dot: 'bg-rose-400'   },
}

export const LEVEL_COLORS = {
  info:  { bg: 'bg-blue-900',  text: 'text-blue-300'  },
  warn:  { bg: 'bg-yellow-900',text: 'text-yellow-300'},
  error: { bg: 'bg-red-900',   text: 'text-red-300'   },
  debug: { bg: 'bg-gray-700',  text: 'text-gray-300'  },
}

export const ACTION_ENUM = [
  'payment_created', 'payment_expired', 'payment_confirmed',
  'payment_cancelled', 'payment_partial_received',
  'sweep_initiated', 'sweep_gas_sent', 'sweep_completed',
  'sweep_failed', 'sweep_retry_success', 'sweep_retry_failed',
  'sweep_retries_exhausted', 'sweep_manual_retry',
  'webhook_sent', 'webhook_failed', 'webhook_retry_success',
  'webhook_retry_failed', 'webhook_retries_exhausted',
  'admin_login', 'admin_login_failed', 'admin_cancel_payment',
  'admin_retry_sweep', 'admin_view_payment',
  'monitor_cycle_start', 'monitor_cycle_end', 'monitor_error',
  'api_error', 'rate_limit_hit',
]

// Maps action prefix to Lucide icon name
export const ACTION_ICON = {
  payment:  'CreditCard',
  sweep:    'ArrowRightLeft',
  webhook:  'Webhook',
  admin:    'ShieldCheck',
  monitor:  'Settings',
  api:      'Settings',
  rate:     'Settings',
}

export function getActionIcon(action) {
  const prefix = action.split('_')[0]
  return ACTION_ICON[prefix] ?? 'Settings'
}
```

- [ ] **Step 2: Write failing tests for `formatters.js`**

Create `dashboard/src/utils/formatters.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatUSDT, formatRelativeTime, formatDateTime, getDayRange } from './formatters'

describe('formatUSDT', () => {
  it('formats integer amount', () => {
    expect(formatUSDT(100)).toBe('100.00 USDT')
  })
  it('formats decimal amount', () => {
    expect(formatUSDT(12.5)).toBe('12.50 USDT')
  })
  it('formats zero', () => {
    expect(formatUSDT(0)).toBe('0.00 USDT')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows "just now" for < 60s', () => {
    const date = new Date('2024-01-01T11:59:30Z')
    expect(formatRelativeTime(date)).toBe('just now')
  })
  it('shows minutes', () => {
    const date = new Date('2024-01-01T11:55:00Z')
    expect(formatRelativeTime(date)).toBe('5m ago')
  })
  it('shows hours', () => {
    const date = new Date('2024-01-01T10:00:00Z')
    expect(formatRelativeTime(date)).toBe('2h ago')
  })
  it('shows days', () => {
    const date = new Date('2023-12-30T12:00:00Z')
    expect(formatRelativeTime(date)).toBe('2d ago')
  })
})

describe('formatDateTime', () => {
  it('formats ISO date string to readable format', () => {
    const result = formatDateTime('2024-01-15T10:30:00Z')
    // Should contain date and time parts
    expect(result).toMatch(/2024/)
    expect(result).toMatch(/Jan/)
  })
})

describe('getDayRange', () => {
  it('returns start and end of a given date', () => {
    const { from, to } = getDayRange(new Date('2024-01-15T14:30:00Z'))
    expect(from).toBe('2024-01-15T00:00:00.000Z')
    expect(to).toBe('2024-01-15T23:59:59.999Z')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd dashboard && npm test
```

Expected: 4 test suites fail with "formatUSDT is not a function" (or similar import errors).

- [ ] **Step 4: Create `dashboard/src/utils/formatters.js`**

```js
export function formatUSDT(amount) {
  return `${Number(amount).toFixed(2)} USDT`
}

export function formatRelativeTime(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function getDayRange(date) {
  const d = new Date(date)
  const from = new Date(d)
  from.setUTCHours(0, 0, 0, 0)
  const to = new Date(d)
  to.setUTCHours(23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd dashboard && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/constants/ dashboard/src/utils/
git commit -m "feat: add constants and formatter utilities"
```

---

## Task 3: API layer

**Files:**
- Create: `dashboard/src/hooks/useApi.js`

- [ ] **Step 1: Create `dashboard/src/hooks/useApi.js`**

```js
import axios from 'axios'

const api = axios.create({
  baseURL: '/api/admin',
})

api.interceptors.request.use((config) => {
  const key = localStorage.getItem('adminKey')
  if (key) {
    config.headers['X-Admin-Key'] = key
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminKey')
      window.location.href = '/login?error=1'
    }
    return Promise.reject(error)
  }
)

export default api
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/hooks/useApi.js
git commit -m "feat: add Axios API layer with X-Admin-Key interceptor"
```

---

## Task 4: App shell — routing, layout, ProtectedRoute

**Files:**
- Modify: `dashboard/src/App.jsx`

- [ ] **Step 1: Replace `dashboard/src/App.jsx` with full routing**

```jsx
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Payments from './pages/Payments'
import PaymentDetail from './pages/PaymentDetail'
import AuditLogs from './pages/AuditLogs'

function ProtectedRoute() {
  const key = localStorage.getItem('adminKey')
  const location = useLocation()
  if (!key) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/:id" element={<PaymentDetail />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Create stub pages so App.jsx compiles**

Create each file with a minimal stub:

`dashboard/src/pages/Login.jsx`:
```jsx
export default function Login() { return <div>Login</div> }
```

`dashboard/src/pages/Dashboard.jsx`:
```jsx
export default function Dashboard() { return <div>Dashboard</div> }
```

`dashboard/src/pages/Payments.jsx`:
```jsx
export default function Payments() { return <div>Payments</div> }
```

`dashboard/src/pages/PaymentDetail.jsx`:
```jsx
export default function PaymentDetail() { return <div>PaymentDetail</div> }
```

`dashboard/src/pages/AuditLogs.jsx`:
```jsx
export default function AuditLogs() { return <div>AuditLogs</div> }
```

Create `dashboard/src/components/Sidebar.jsx` stub:
```jsx
export default function Sidebar() { return <aside className="w-60 bg-gray-900" /> }
```

- [ ] **Step 3: Verify dev server still runs**

```bash
cd dashboard && npm run dev
```

Navigate to `http://localhost:5173` — should redirect to `/login`. Navigate to `/dashboard` — should redirect to `/login` (no key in localStorage). No console errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/App.jsx dashboard/src/pages/ dashboard/src/components/Sidebar.jsx
git commit -m "feat: add routing and ProtectedRoute shell"
```

---

## Task 5: Shared components — StatusBadge, StatCard, Pagination

**Files:**
- Modify: `dashboard/src/components/StatusBadge.jsx` (replace stub if any)
- Create: `dashboard/src/components/StatCard.jsx`
- Create: `dashboard/src/components/Pagination.jsx`

- [ ] **Step 1: Create `dashboard/src/components/StatusBadge.jsx`**

```jsx
import { STATUS_COLORS, LEVEL_COLORS } from '../constants'

export default function StatusBadge({ status, level, className = '' }) {
  const colors = status
    ? STATUS_COLORS[status] ?? STATUS_COLORS.pending
    : LEVEL_COLORS[level] ?? LEVEL_COLORS.info

  const label = status ?? level

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${className}`}>
      {status && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Create `dashboard/src/components/StatCard.jsx`**

```jsx
export default function StatCard({ title, value, subtitle, icon: Icon, accent = false }) {
  return (
    <div className={`bg-gray-900 rounded-xl p-5 border ${accent ? 'border-emerald-800' : 'border-gray-800'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className={`text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-gray-100'}`}>
            {value}
          </p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-2 bg-gray-800 rounded-lg">
            <Icon size={20} className="text-gray-400" />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `dashboard/src/components/Pagination.jsx`**

```jsx
export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-gray-400">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/
git commit -m "feat: add StatusBadge, StatCard, Pagination components"
```

---

## Task 6: Sidebar component

**Files:**
- Modify: `dashboard/src/components/Sidebar.jsx`
- Modify: `dashboard/src/App.jsx` (pass mobile open state to Sidebar)

- [ ] **Step 1: Update `dashboard/src/App.jsx` to add mobile sidebar state**

Replace the `ProtectedRoute` function with:

```jsx
function ProtectedRoute() {
  const key = localStorage.getItem('adminKey')
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!key) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-gray-400 hover:text-gray-100 rounded-lg"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-gray-100">CryptoPay</span>
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

Add `useState` to the React import and `Menu` to the Lucide import:
```jsx
import { useState } from 'react'
import { Menu } from 'lucide-react'
```

- [ ] **Step 2: Replace Sidebar stub**

```jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CreditCard, FileText, LogOut, Zap, X } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/payments',    icon: CreditCard,       label: 'Payments'    },
  { to: '/audit-logs',  icon: FileText,         label: 'Audit Logs'  },
]

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('adminKey')
    navigate('/login')
  }

  return (
    <aside className={`
      fixed md:static inset-y-0 left-0 z-30
      w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0
      transform transition-transform duration-200
      ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between gap-2.5 px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <Zap size={22} className="text-emerald-400" />
          <span className="text-base font-semibold text-gray-100">CryptoPay</span>
        </div>
        <button onClick={onClose} className="md:hidden p-1 text-gray-500 hover:text-gray-300">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-emerald-900/40 text-emerald-400 font-medium'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-rose-400 hover:bg-gray-800 transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Verify in browser**

Start dev server. Set `localStorage.setItem('adminKey', 'test')` in DevTools, navigate to `/dashboard`. On desktop (>768px): sidebar visible, fixed left. On mobile (resize window <768px): sidebar hidden, hamburger button in top bar. Click hamburger — sidebar slides in. Click overlay — closes.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/Sidebar.jsx dashboard/src/App.jsx
git commit -m "feat: implement Sidebar with navigation, logout, and mobile responsive"
```

---

## Task 7: AuditTimeline component

**Files:**
- Modify: `dashboard/src/components/AuditTimeline.jsx`

- [ ] **Step 1: Replace AuditTimeline stub**

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
    return <p className="text-gray-500 text-sm">No history available.</p>
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-800" />

      <ul className="space-y-4">
        {history.map((entry, i) => {
          const iconName = getActionIcon(entry.action)
          const Icon = ICON_MAP[iconName] ?? Settings
          const hasDetails = entry.details && Object.keys(entry.details).length > 0
          const isExpanded = expanded[entry._id ?? i]

          return (
            <li key={entry._id ?? i} className="relative flex gap-4 pl-10">
              {/* Icon bubble */}
              <div className="absolute left-0 flex items-center justify-center w-8 h-8 rounded-full bg-gray-800 border border-gray-700 shrink-0">
                <Icon size={14} className="text-gray-400" />
              </div>

              <div className="flex-1 bg-gray-900 rounded-lg p-3 border border-gray-800">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-200">{entry.action}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge level={entry.level} />
                    <span className="text-xs text-gray-500">{formatDateTime(entry.createdAt)}</span>
                  </div>
                </div>

                {entry.ip && (
                  <p className="text-xs text-gray-500 mt-1">IP: {entry.ip}</p>
                )}

                {hasDetails && (
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [entry._id ?? i]: !isExpanded }))}
                    className="text-xs text-emerald-400 hover:text-emerald-300 mt-2 transition-colors"
                  >
                    {isExpanded ? 'Hide details' : 'Show details'}
                  </button>
                )}

                {isExpanded && (
                  <pre className="mt-2 text-xs bg-gray-950 rounded p-2 text-gray-300 overflow-x-auto">
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

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/AuditTimeline.jsx
git commit -m "feat: implement AuditTimeline with collapsible details"
```

---

## Task 8: Login page

**Files:**
- Modify: `dashboard/src/pages/Login.jsx`

- [ ] **Step 1: Replace Login stub**

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2.5 bg-emerald-900/40 rounded-xl">
            <Zap size={28} className="text-emerald-400" />
          </div>
          <span className="text-2xl font-bold text-gray-100">CryptoPay</span>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          <h1 className="text-lg font-semibold text-gray-100 mb-1">Admin Access</h1>
          <p className="text-sm text-gray-400 mb-6">Enter your admin key to continue</p>

          {hasError && (
            <div className="mb-4 px-3 py-2.5 bg-rose-900/40 border border-rose-800 rounded-lg text-sm text-rose-300">
              Invalid admin key. Please try again.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Admin Key</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter admin key"
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
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

- [ ] **Step 2: Verify in browser**

Clear localStorage. Navigate to `http://localhost:5173`. Should show login card. Enter any key and submit — should redirect to `/dashboard`. Navigate back to `/login` — should redirect to `/dashboard` (key exists). Log out via sidebar — should return to `/login`. Navigate to `/login?error=1` — should show error banner.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/Login.jsx
git commit -m "feat: implement Login page with error state handling"
```

---

## Task 9: Dashboard page

**Files:**
- Modify: `dashboard/src/pages/Dashboard.jsx`

- [ ] **Step 1: Replace Dashboard stub**

```jsx
import { useState, useEffect, useCallback } from 'react'
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

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        api.get('/stats'),
        api.get('/recent-activity?limit=10'),
      ])
      setStats(statsRes.data.stats)
      setActivity(activityRes.data.activities)
      setError(null)
    } catch (err) {
      if (err.response?.status !== 401) setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchChartData = useCallback(async () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d
    })

    try {
      const results = await Promise.all(
        days.map(day => {
          const { from, to } = getDayRange(day)
          return api.get(`/payments?from=${from}&to=${to}&status=swept&limit=1000`)
            .then(r => ({
              day: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
              revenue: r.data.payments.reduce((sum, p) => sum + (p.receivedAmount || 0), 0),
            }))
        })
      )
      setChartData(results)
    } catch {
      // chart is non-critical
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchChartData()
    const interval = setInterval(fetchStats, 15000)
    return () => clearInterval(interval)
  }, [fetchStats, fetchChartData])

  return { stats, activity, chartData, loading, error }
}

export default function Dashboard() {
  const { stats, activity, chartData, loading, error } = useDashboard()

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl p-5 border border-gray-800 h-28 animate-pulse" />
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
        <h1 className="text-xl font-semibold text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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

        {/* Status distribution */}
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
      </div>

      {/* Recent Activity */}
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
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser (with real API)**

Start Express API (`npm run dev` from project root), then start dashboard (`cd dashboard && npm run dev`). Log in, navigate to Dashboard. Stat cards, charts, and activity feed should load.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/Dashboard.jsx
git commit -m "feat: implement Dashboard page with stats, charts, and activity feed"
```

---

## Task 10: Payments page

**Files:**
- Modify: `dashboard/src/pages/Payments.jsx`

- [ ] **Step 1: Replace Payments stub**

```jsx
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
```

- [ ] **Step 2: Verify in browser**

Navigate to `/payments`. Table loads with pagination. Change status filter — list updates. Click a row — navigates to `/payments/:id` (stub page for now).

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/Payments.jsx
git commit -m "feat: implement Payments page with filters and pagination"
```

---

## Task 11: PaymentDetail page

**Files:**
- Modify: `dashboard/src/pages/PaymentDetail.jsx`

- [ ] **Step 1: Replace PaymentDetail stub**

```jsx
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
            {retrying ? 'Retrying…' : 'Retry Sweep'}
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
```

- [ ] **Step 2: Verify in browser**

Navigate to a payment via the Payments table. Details, QR code, and audit timeline should render. If payment has `sweepStatus: 'failed'`, "Retry Sweep" button appears.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/PaymentDetail.jsx
git commit -m "feat: implement PaymentDetail with QR code, audit trail, and retry sweep"
```

---

## Task 12: AuditLogs page

**Files:**
- Modify: `dashboard/src/pages/AuditLogs.jsx`

- [ ] **Step 1: Replace AuditLogs stub**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import { formatDateTime } from '../utils/formatters'
import { ACTION_ENUM } from '../constants'

const LEVEL_OPTIONS = ['', 'info', 'warn', 'error', 'debug']

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
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 50 })
    if (filters.action) params.set('action', filters.action)
    if (filters.level) params.set('level', filters.level)
    // Convert YYYY-MM-DD (date input) to ISO strings the API expects
    if (filters.from) params.set('from', new Date(filters.from + 'T00:00:00').toISOString())
    if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59').toISOString())

    api.get(`/audit-logs?${params}`)
      .then(r => {
        setLogs(r.data.logs)
        setTotal(r.data.total)
        setTotalPages(r.data.totalPages)
        setError(null)
      })
      .catch(() => setError('Failed to load audit logs'))
      .finally(() => setLoading(false))
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
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-600 max-w-xs"
        >
          <option value="">All actions</option>
          {ACTION_ENUM.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={filters.level}
          onChange={e => handleFilterChange('level', e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-emerald-600"
        >
          <option value="">All levels</option>
          {LEVEL_OPTIONS.filter(Boolean).map(l => (
            <option key={l} value={l}>{l}</option>
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
                        : <span className="text-gray-600">—</span>
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
```

- [ ] **Step 2: Verify in browser**

Navigate to `/audit-logs`. Table loads. Filter by level `error` — list updates. Click a Payment ID link — navigates to payment detail.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/pages/AuditLogs.jsx
git commit -m "feat: implement AuditLogs page with filters and pagination"
```

---

## Task 13: Production build verification

**Files:**
- No new files — verify existing build configuration

- [ ] **Step 1: Run full test suite**

```bash
cd dashboard && npm test
```

Expected: all tests pass (formatters + constants).

- [ ] **Step 2: Run production build**

```bash
cd dashboard && npm run build
```

Expected: `dashboard/build/` directory created with `index.html`, assets. No build errors.

- [ ] **Step 3: Verify Express serves the build**

Start Express in production mode:
```bash
NODE_ENV=production npm start
```

Navigate to `http://localhost:3000`. Should serve the React dashboard. Login should work against the real API. All routes (`/dashboard`, `/payments`, `/audit-logs`) should work on page refresh (Express wildcard route handles SPA routing at `server.js` lines 44-50).

- [ ] **Step 4: Final commit**

```bash
git add dashboard/
git commit -m "feat: complete CryptoPay admin dashboard"
```
