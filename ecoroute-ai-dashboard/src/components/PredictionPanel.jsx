import { AlertTriangle, BrainCircuit, CheckCircle2 } from 'lucide-react'
import { PredictionChart } from './ChartCard'

export default function PredictionPanel({ data, confidence }) {
  return <section className="panel prediction-panel" id="prediction">
    <div className="panel-heading"><div><h2>Workload Prediction</h2><p>Random Forest forecast · 15-minute horizon</p></div><span className="model-pill"><BrainCircuit size={15}/> Random Forest</span></div>
    <div className="prediction-layout">
      <div className="prediction-stats">
        <div className="forecast-card"><span>Current workload</span><strong>184 <small>RPS</small></strong><em>Live telemetry</em></div>
        <div className="forecast-card highlight"><span>15-min forecast</span><strong>327 <small>RPS</small></strong><em><Trending confidence={confidence}/></em></div>
        <div className="spike-alert"><AlertTriangle size={18}/><div><b>Workload spike predicted</b><p>Traffic is expected to increase by ~78% over the next 15 minutes.</p></div></div>
      </div>
      <div className="chart-wrap"><PredictionChart data={data}/></div>
    </div>
  </section>
}

function Trending({ confidence }) {
  return <span className="confidence"><CheckCircle2 size={14}/> {confidence}% confidence</span>
}
