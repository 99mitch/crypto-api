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
