import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import MetricCard from './components/MetricCard'
import LiveTraffic from './components/LiveTraffic'
import PredictionPanel from './components/PredictionPanel'
import ScalingPanel from './components/ScalingPanel'
import InstancesPanel from './components/InstancesPanel'
import TelemetryTable from './components/TelemetryTable'
import { dashboardApi } from './services/api'
import { Activity, CheckCircle2, Circle } from 'lucide-react'

export default function App() {
  const [active, setActive] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [data, setData] = useState(null)
  const [updated, setUpdated] = useState('just now')

  const scrollTo = (label) => {
    setActive(label)
    setSidebarOpen(false)
    const id = label === 'Overview' ? 'overview' : label.toLowerCase().replaceAll(' ', '-')
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [
          overview,
          live,
          prediction,
          instances,
          telemetry,
        ] = await Promise.all([
          dashboardApi.getOverview(),
          dashboardApi.getLiveMetrics(),
          dashboardApi.getPrediction(),
          dashboardApi.getInstances(),
          dashboardApi.getTelemetry(),
        ]);

        if (!active) return;

        setData({
          overview: {
            ...overview,
            currentRps: live.currentRps,
            avgResponseTime: live.avgResponseTime,
          },
          traffic: live.traffic,
          response: live.response,
          prediction,
          instances,
          telemetry,
        });

        setUpdated("just now");
      } catch (error) {
        console.error("Dashboard loading failed:", error);
      }
    }

    loadDashboard();

    const timer = setInterval(loadDashboard, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!data) return <div className="loading"><div className="loader" /><span>Loading EcoRoute telemetry…</span></div>

  const { overview, traffic, response, prediction, instances, telemetry } = data
  return <div className="app-shell">
    <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
    <div className={`sidebar-wrap ${sidebarOpen ? 'open' : ''}`}><Sidebar active={active} onSelect={scrollTo} /></div>
    <main className="main">
      <Header onMenu={() => setSidebarOpen(true)} lastUpdated={updated} />
      <div className="content">
        <section id="overview" className="overview-section">
          <div className="system-status"><span><CheckCircle2 size={16} /> System status: <b>Healthy</b></span><span className="status-sub"><Circle size={7} fill="currentColor" /> Node.js · FastAPI · Redis</span></div>
          <div className="metrics-grid">
            <MetricCard type="rps" label="Current RPS" value={overview.currentRps} unit="" trend={8.2} subtext="vs previous 5 min" tone="blue" />
            <MetricCard type="predicted" label="Predicted RPS" value={overview.predictedRps} unit="" trend={77.7} subtext="in 15 minutes" tone="amber" />
            <MetricCard type="instances" label="Active instances" value={overview.activeInstances} unit="" subtext={`${overview.requiredInstances} required`} tone="green" />
            <MetricCard type="latency" label="Avg response time" value={overview.avgResponseTime} unit="ms" trend={4.1} subtext="vs previous 5 min" tone="purple" />
          </div>
        </section>
        <LiveTraffic
          traffic={traffic}
          response={response}
          currentRps={overview.currentRps}
          avgResponseTime={overview.avgResponseTime}
        />
        <PredictionPanel data={prediction} confidence={overview.predictionConfidence} />
        <ScalingPanel current={overview.activeInstances} required={overview.requiredInstances} />
        <InstancesPanel instances={instances} />
        <TelemetryTable rows={telemetry} />
        <footer><span>EcoRoute AI</span><span>Live telemetry · API connected</span></footer>
      </div>
    </main>
  </div>
}
