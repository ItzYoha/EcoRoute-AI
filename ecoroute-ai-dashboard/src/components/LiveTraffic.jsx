import { ArrowUpRight, Circle } from 'lucide-react'
import { TrafficChart, ResponseChart } from './ChartCard'

export default function LiveTraffic({ traffic, response }) {
  return <section id="live-traffic" className="traffic-section">
    <div className="section-title"><div><h2>Live Traffic</h2><p>Real-time view of traffic flowing through the Node.js load balancer</p></div><span className="live-pill"><Circle size={8} fill="currentColor"/> LIVE</span></div>
    <div className="chart-grid">
      <ChartBox title="Requests per second" value="184 RPS" change="+8.2%"><TrafficChart data={traffic}/></ChartBox>
      <ChartBox title="Average response time" value="142 ms" change="+4.1%"><ResponseChart data={response}/></ChartBox>
    </div>
  </section>
}
function ChartBox({ title, value, change, children }) { return <div className="panel chart-card"><div className="chart-head"><div><span>{title}</span><strong>{value}</strong></div><span className="chart-change"><ArrowUpRight size={13}/>{change}</span></div><div className="chart-area">{children}</div></div> }
