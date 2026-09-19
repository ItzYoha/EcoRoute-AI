import { ArrowRight, ServerCog, Zap } from 'lucide-react'

export default function ScalingPanel({ current, required }) {
  return <section className="panel scaling-panel" id="auto-scaling">
    <div className="panel-heading"><div><h2>Auto-Scaling Decision</h2><p>Control Plane recommendation based on predicted workload</p></div><span className="decision-pill"><Zap size={14}/> Action recommended</span></div>
    <div className="scale-content">
      <div className="scale-flow">
        <div className="scale-node"><span>Current</span><strong>{current}</strong><small>instances</small></div>
        <ArrowRight className="scale-arrow" size={24}/>
        <div className="scale-node recommended"><span>Required</span><strong>{required}</strong><small>instances</small></div>
      </div>
      <div className="scale-message"><div className="scale-icon"><ServerCog size={20}/></div><div><b>Scale-up recommended</b><p>Prepare {required - current} additional instance{required - current === 1 ? '' : 's'} before the predicted traffic peak.</p></div></div>
      <div className="capacity-bar"><div className="bar-label"><span>Projected capacity</span><b>82%</b></div><div className="bar"><i style={{ width: '82%' }}/></div><small>Based on current instance capacity and predicted RPS</small></div>
    </div>
  </section>
}
