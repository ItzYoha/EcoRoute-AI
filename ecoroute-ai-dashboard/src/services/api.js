
import {
  overview,
  predictionData,
  instances,
  telemetry,
} from "../data/mockData";

const API_URL = "http://localhost:8000/api";

export async function getLiveMetrics() {
  const response = await fetch(`${API_URL}/metrics`);

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

    traffic: [...metrics.rpsHistory]
      .reverse()
      .map((item) => ({
        time: formatTime(item.timestamp),
        rps: item.rps,
      })),

    response: [...metrics.responseHistory]
      .reverse()
      .map((item) => ({
        time: formatTime(item.timestamp),
        latency: item.responseTime,
      })),
  };
}

export const dashboardApi = {
  getLiveMetrics,

  // Keep these mock sections for now.
  getOverview: () => Promise.resolve(overview),
  getPrediction: () => Promise.resolve(predictionData),
  getInstances: () => Promise.resolve(instances),
  getTelemetry: () => Promise.resolve(telemetry),
};