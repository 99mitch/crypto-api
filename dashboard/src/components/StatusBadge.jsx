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
