import { Activity, CheckCircle2, Clock3, MoreHorizontal, Server } from 'lucide-react'

export default function InstancesPanel({ instances }) {
  return <section className="panel" id="instances">
    <div className="panel-heading"><div><h2>Backend Instances</h2><p>Live status of servers behind the load balancer</p></div><span className="count-pill"><Server size={14}/> {instances.length} active</span></div>
    <div className="instance-grid">{instances.map((server) => <div className="instance-card" key={server.id}>
      <div className="instance-head"><div className="server-icon"><Server size={18}/></div><button className="more"><MoreHorizontal size={18}/></button></div>
      <div className="instance-name"><b>{server.id}</b><span>Port :{server.port}</span></div>
      <div className="status"><CheckCircle2 size={14}/> {server.status}</div>
      <div className="instance-metrics"><Metric icon={<Activity size={14}/>} label="RPS" value={server.rps}/><Metric icon={<Clock3 size={14}/>} label="Response" value={`${server.responseTime} ms`}/><Metric icon={<Server size={14}/>} label="Requests" value={server.requests.toLocaleString()}/></div>
    </div>)}</div>
  </section>
}
function Metric({ icon, label, value }) { return <div><span>{icon}{label}</span><b>{value}</b></div> }
