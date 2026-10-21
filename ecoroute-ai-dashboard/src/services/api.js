
const GATEWAY_URL = "http://localhost:8000/api";
const CONTROL_PLANE_URL = "http://localhost:5000";

// Fetch live RPS and response-time metrics from Redis via the gateway.
export async function getLiveMetrics() {
  const response = await fetch(`${GATEWAY_URL}/metrics`);

  if (!response.ok) {
    throw new Error(`Metrics API failed: ${response.status}`);
  }

  const metrics = await response.json();

  const formatTime = (timestamp) =>
    new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return {
    currentRps: metrics.currentRps ?? 0,
    avgResponseTime: metrics.avgResponseTime ?? 0,

    traffic: (metrics.rpsHistory ?? [])
      .slice()
      .reverse()
      .map((item) => ({
        time: formatTime(item.timestamp),
        rps: item.rps,
      })),

    response: (metrics.responseHistory ?? []).map((item) => ({
                time: formatTime(item.timestamp),
                timestamp: item.timestamp,
                server: item.server,
                responseTime: Number(item.responseTime ?? 0),
                latency: Number(item.responseTime ?? 0),
              })),
  };
}

// Fetch the latest ML prediction.
export async function getPrediction() {
  const response = await fetch(`${CONTROL_PLANE_URL}/predict`);

  if (!response.ok) {
    throw new Error(`Prediction API failed: ${response.status}`);
  }

  return response.json();
}

// Fetch the actual running Docker instances and autoscaling status.
export async function getInstances() {
  const response = await fetch(`${CONTROL_PLANE_URL}/instances`);

  if (!response.ok) {
    throw new Error(`Instances API failed: ${response.status}`);
  }

  return response.json();
}

// Start a bounded traffic simulation.
export async function startTrafficSimulation({ targetRps, durationSeconds }) {
  const response = await fetch(`${CONTROL_PLANE_URL}/demo/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_rps: targetRps, duration_seconds: durationSeconds }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.detail ?? `Could not start simulation: ${response.status}`)
  }

  return result
}

// Read actual simulation progress.
export async function getTrafficSimulationStatus() {
  const response = await fetch(`${CONTROL_PLANE_URL}/demo/status`)

  if (!response.ok) {
    throw new Error(`Simulation status failed: ${response.status}`)
  }

  return response.json()
}

// Stop the current simulation.
export async function stopTrafficSimulation() {
  const response = await fetch(`${CONTROL_PLANE_URL}/demo/stop`, {
    method: 'POST',
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.detail ?? `Could not stop simulation: ${response.status}`)
  }

  return result
}

// Keep these mock-backed sections until their live APIs are implemented.
export const dashboardApi = {
  getLiveMetrics,
  getPrediction,
  getInstances,
  startTrafficSimulation,
  getTrafficSimulationStatus,
  stopTrafficSimulation,
}

