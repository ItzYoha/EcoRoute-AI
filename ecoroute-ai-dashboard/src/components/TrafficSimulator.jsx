import { useEffect, useState } from 'react'
import { Activity, Play, Square, RefreshCw } from 'lucide-react'
import { dashboardApi } from '../services/api'

const panelStyle = {
  background: 'var(--panel, #fff)',
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 12,
  padding: 20,
}

export default function TrafficSimulator() {
  const [targetRps, setTargetRps] = useState(25)
  const [duration, setDuration] = useState(3600)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refreshStatus() {
    try {
      const result = await dashboardApi.getTrafficSimulationStatus()
      setStatus(result)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    refreshStatus()

    const timer = setInterval(refreshStatus, 1000)
    return () => clearInterval(timer)
  }, [])

  async function startTest() {
    setBusy(true)
    setError('')

    try {
      await dashboardApi.startTrafficSimulation({
        targetRps: Number(targetRps),
        durationSeconds: Number(duration),
      })
      await refreshStatus()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function stopTest() {
    setBusy(true)
    setError('')

    try {
      await dashboardApi.stopTrafficSimulation()
      await refreshStatus()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const running = Boolean(status?.running)

  const statCards = [
    ['Completed requests', status?.total_requests ?? 0],
    ['Successful', status?.successful_requests ?? 0],
    ['Failed', status?.failed_requests ?? 0],
    ['Achieved RPS', status?.actual_rps ?? 0],
  ]

  return (
    <section style={{ display: 'grid', gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 6 }}>Traffic Simulator</h2>
        <p style={{ color: 'var(--muted, #6b7280)', marginTop: 0 }}>
          Generate controlled HTTP traffic through your real EcoRoute load balancer.
        </p>
      </div>

      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={22} />
          <h3 style={{ margin: 0 }}>Load test configuration</h3>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginTop: 20,
          }}
        >
          <label>
            Target requests per second
            <input
              type="number"
              min="1"
              max="100"
              value={targetRps}
              disabled={running || busy}
              onChange={(e) => setTargetRps(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 8, padding: 10 }}
            />
            <small>Allowed: 1–100 RPS</small>
          </label>

          <label>
            Duration in seconds
            <input
                type="number"
                min="5"
                max="3600"
                value={duration}
                disabled={running || busy}
                onChange={(e) => setDuration(e.target.value)}
                style={{
                display: 'block',
                width: '100%',
                marginTop: 8,
                padding: 10,
                }}
            />
            <small>Allowed: 5–3600 seconds (up to 1 hour)</small>
            </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={startTest}
            disabled={running || busy || !Number.isInteger(Number(targetRps)) ||
              Number(targetRps) < 1 || Number(targetRps) > 100 ||
              !Number.isInteger(Number(duration)) ||
              Number(duration) < 5 || Number(duration) > 3600}
          >
            <Play size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {busy && !running ? 'Please wait…' : 'Start simulation'}
          </button>

          <button
            onClick={stopTest}
            disabled={!running || busy}
          >
            <Square size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Stop simulation
          </button>

          <button onClick={refreshStatus} disabled={busy}>
            <RefreshCw size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Refresh status
          </button>
        </div>

        {error && (
          <p role="alert" style={{ color: '#dc2626', marginTop: 16 }}>
            {error}
          </p>
        )}

        {status?.error && (
          <p role="alert" style={{ color: '#dc2626' }}>
            Simulation error: {status.error}
          </p>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
        }}
      >
        {statCards.map(([label, value]) => (
          <div key={label} style={panelStyle}>
            <p style={{ color: 'var(--muted, #6b7280)', marginTop: 0 }}>
              {label}
            </p>
            <h2 style={{ marginBottom: 0 }}>
              {typeof value === 'number'
                ? value.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                : value}
            </h2>
          </div>
        ))}
      </div>

      <div style={panelStyle}>
        <h3>Simulation status</h3>
        <p>
          Status: <strong>{running ? 'Running' : 'Idle'}</strong>
        </p>
        <p>Target: {status?.target_rps ?? 0} RPS</p>
        <p>Configured duration: {status?.duration_seconds ?? 0} seconds</p>
        <p>
          Started at:{' '}
          {status?.started_at
            ? new Date(status.started_at).toLocaleTimeString()
            : '—'}
        </p>
        <p style={{ color: 'var(--muted, #6b7280)' }}>
          Achieved RPS is calculated from completed requests, so it can be
          lower than the selected target. This panel reports the traffic
          generator's measurements; check the main dashboard for gateway
          metrics and Docker instance counts.
        </p>
      </div>
    </section>
  )
}