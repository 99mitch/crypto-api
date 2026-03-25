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
