import { motion } from 'framer-motion'

export function MetricCard({ label, value, detail, icon: Icon, accent = 'blue' }) {
  const colors = {
    blue: 'from-blue-500/18 text-blue-200',
    green: 'from-emerald-500/18 text-emerald-200',
    amber: 'from-amber-500/18 text-amber-200',
    red: 'from-red-500/18 text-red-200',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel rounded-lg p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-white/45">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-white">{value}</p>
          <p className="mt-1 text-sm text-white/55">{detail}</p>
        </div>
        <div className={`rounded-lg bg-gradient-to-br ${colors[accent]} to-transparent p-2.5`}>
          <Icon size={20} />
        </div>
      </div>
    </motion.div>
  )
}

