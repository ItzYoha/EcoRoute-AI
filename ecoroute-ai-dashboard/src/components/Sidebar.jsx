import { Activity, BarChart3, Gauge, Server, Settings2, Waves, Zap } from 'lucide-react'

const items = [
  ['Overview', Gauge], ['Live Traffic', Activity], ['Prediction', BarChart3],
  ['Auto-Scaling', Zap], ['Instances', Server], ['Telemetry', Waves],
]

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Zap size={18} fill="currentColor" /></div>
        <div><strong>EcoRoute AI</strong><span>Infrastructure Control</span></div>
      </div>
      <nav>
        <p className="nav-label">MONITORING</p>
        {items.map(([label, Icon]) => (
          <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onSelect(label)}>
            <Icon size={18} /> <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-mini"><span className="status-dot healthy" /> <div><b>System online</b><small>All services operational</small></div></div>
        <button className="nav-item"><Settings2 size={18} /> <span>Settings</span></button>
      </div>
    </aside>
  )
}
