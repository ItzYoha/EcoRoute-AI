import { Bell, Menu, RefreshCw } from 'lucide-react'

export default function Header({ onMenu, lastUpdated }) {
  return (
    <header className="header">
      <button className="mobile-menu" onClick={onMenu}><Menu size={20} /></button>
      <div><h1>System Overview</h1><p>Predictive load balancing & cloud auto-scaling</p></div>
      <div className="header-actions">
        <span className="updated"><RefreshCw size={14} /> Updated {lastUpdated}</span>
        <button className="icon-btn"><Bell size={18} /></button>
        <div className="avatar">EA</div>
      </div>
    </header>
  )
}
