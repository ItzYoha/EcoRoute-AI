// Keep data access isolated from the UI. Replace these mock functions with
// fetch()/axios calls to FastAPI/Node/Redis-backed endpoints later.
import { overview, trafficData, responseTimeData, predictionData, instances, telemetry } from '../data/mockData'

const wait = (value, ms = 180) => new Promise((resolve) => setTimeout(() => resolve(value), ms))

export const dashboardApi = {
  getOverview: () => wait(overview),
  getTraffic: () => wait(trafficData),
  getResponseTime: () => wait(responseTimeData),
  getPrediction: () => wait(predictionData),
  getInstances: () => wait(instances),
  getTelemetry: () => wait(telemetry),
}
