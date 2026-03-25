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
