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
      w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0
      transform transition-transform duration-200
      ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between gap-2.5 px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <Zap size={22} className="text-zinc-100" />
          <span className="text-base font-semibold text-zinc-100">CryptoPay</span>
        </div>
        <button onClick={onClose} className="md:hidden p-1 text-zinc-500 hover:text-zinc-300">
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
              isActive
                ? 'flex items-center gap-3 pl-[10px] pr-3 py-2.5 rounded-lg text-sm transition-colors border-l-2 border-zinc-100 text-zinc-100 font-medium bg-zinc-800/50'
                : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-zinc-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  )
}
