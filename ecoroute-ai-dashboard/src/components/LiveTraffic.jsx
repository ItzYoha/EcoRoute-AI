import { ArrowUpRight, Circle } from 'lucide-react'
import { TrafficChart, ResponseChart } from './ChartCard'

export default function LiveTraffic({
  traffic,
  response,
  currentRps,
  avgResponseTime,
}) {
  return <section id="live-traffic" className="traffic-section">
    <div className="section-title"><div><h2>Live Traffic</h2><p>Real-time view of traffic flowing through the Node.js load balancer</p></div><span className="live-pill"><Circle size={8} fill="currentColor" /> LIVE</span></div>
    <div className="chart-grid">
        <ChartBox
          title="Requests per second"
          value={`${currentRps} RPS`}
          change="Live"
        >
          <TrafficChart data={traffic} />
        </ChartBox>

        <ChartBox
          title="Average response time"
          value={`${avgResponseTime} ms`}
          change="Live"
        >
          <ResponseChart data={response} />
        </ChartBox>
      </div>
  </section>
}
function ChartBox({ title, value, change, children }) { return <div className="panel chart-card"><div className="chart-head"><div><span>{title}</span><strong>{value}</strong></div><span className="chart-change"><ArrowUpRight size={13} />{change}</span></div><div className="chart-area">{children}</div></div> }
