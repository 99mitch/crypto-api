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
