import { Database, Radio } from 'lucide-react'

export default function TelemetryTable({ rows }) {
  return <section className="panel" id="telemetry">
    <div className="panel-heading"><div><h2>Recent Telemetry</h2><p>Latest events currently simulated from Redis telemetry</p></div><span className="redis-pill"><Radio size={13}/> Redis connected</span></div>
    <div className="table-scroll"><table><thead><tr><th>Timestamp</th><th>Server</th><th>Response time</th><th>RPS</th><th>Source</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td>{row.timestamp}</td><td><span className="server-tag">{row.server}</span></td><td>{row.responseTime} ms</td><td>{row.rps}</td><td><span className="source"><Database size={13}/> telemetry</span></td></tr>)}</tbody></table></div>
  </section>
}
