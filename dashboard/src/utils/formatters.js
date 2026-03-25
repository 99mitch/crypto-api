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
