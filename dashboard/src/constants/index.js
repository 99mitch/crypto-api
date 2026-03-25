export const STATUS_COLORS = {
  swept:      { bg: 'bg-zinc-100',                          text: 'text-zinc-900', dot: 'bg-zinc-900', bar: 'bg-zinc-100' },
  confirmed:  { bg: 'bg-zinc-800 border border-zinc-700',   text: 'text-zinc-200', dot: 'bg-zinc-200', bar: 'bg-zinc-200' },
  confirming: { bg: 'bg-zinc-800 border border-zinc-700',   text: 'text-zinc-300', dot: 'bg-zinc-400', bar: 'bg-zinc-400' },
  pending:    { bg: 'bg-zinc-900 border border-zinc-700',   text: 'text-zinc-400', dot: 'bg-zinc-500', bar: 'bg-zinc-500' },
  expired:    { bg: 'bg-zinc-900 border border-zinc-800',   text: 'text-zinc-500', dot: 'bg-zinc-600', bar: 'bg-zinc-600' },
  cancelled:  { bg: 'bg-zinc-900 border border-zinc-800',   text: 'text-zinc-500', dot: 'bg-zinc-600', bar: 'bg-zinc-600' },
  failed:     { bg: 'bg-rose-950 border border-rose-900',   text: 'text-rose-400', dot: 'bg-rose-500', bar: 'bg-rose-500' },
}

export const LEVEL_COLORS = {
  error: { bg: 'bg-rose-950 border border-rose-900', text: 'text-rose-400' },
  warn:  { bg: 'bg-zinc-800 border border-zinc-700', text: 'text-zinc-300' },
  info:  { bg: 'bg-zinc-900 border border-zinc-800', text: 'text-zinc-400' },
  debug: { bg: 'bg-zinc-900 border border-zinc-800', text: 'text-zinc-600' },
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
  'admin_retry_sweep',
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
