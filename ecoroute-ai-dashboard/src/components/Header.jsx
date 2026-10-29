import { Menu, RefreshCw } from 'lucide-react'

export default function Header({ onMenu, lastUpdated }) {
  return (
    <header className="header">
      <div className="header-title-group">
        <button className="mobile-menu" onClick={onMenu} aria-label="Open navigation menu">
          <Menu size={20} />
        </button>
        <div>
          <h1>System Overview</h1>
          <p>Predictive load balancing & cloud auto-scaling</p>
        </div>
      </div>
      <div className="header-actions">
        <span className="updated">
          <RefreshCw size={14} /> Updated {lastUpdated}
        </span>
      </div>
    </header>
  )
}
