import { ArrowDown, ArrowUp, Activity, Clock3, Server, TrendingUp } from 'lucide-react'

const icons = { rps: Activity, predicted: TrendingUp, instances: Server, latency: Clock3 }

export default function MetricCard({ type, label, value, unit, trend, tone = 'default', subtext }) {
  const Icon = icons[type] || Activity
  const up = trend > 0
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={17} /></div></div>
      <div className="metric-value">{value}<small>{unit}</small></div>
      <div className="metric-bottom">
        {trend !== undefined && <span className={up ? 'trend up' : 'trend down'}>{up ? <ArrowUp size={13}/> : <ArrowDown size={13}/>} {Math.abs(trend)}%</span>}
        <span>{subtext}</span>
      </div>
    </div>
  )
}
