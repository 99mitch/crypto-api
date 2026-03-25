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
