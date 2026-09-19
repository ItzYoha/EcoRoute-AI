export const overview = {
  currentRps: 184,
  predictedRps: 327,
  activeInstances: 2,
  requiredInstances: 4,
  avgResponseTime: 142,
  status: 'Healthy',
  predictionConfidence: 91,
}

export const trafficData = [
  { time: '15:20', rps: 118 }, { time: '15:21', rps: 126 }, { time: '15:22', rps: 139 },
  { time: '15:23', rps: 132 }, { time: '15:24', rps: 151 }, { time: '15:25', rps: 145 },
  { time: '15:26', rps: 161 }, { time: '15:27', rps: 158 }, { time: '15:28', rps: 176 },
  { time: '15:29', rps: 169 }, { time: '15:30', rps: 184 },
]

export const responseTimeData = [
  { time: '15:20', latency: 112 }, { time: '15:21', latency: 118 }, { time: '15:22', latency: 121 },
  { time: '15:23', latency: 116 }, { time: '15:24', latency: 128 }, { time: '15:25', latency: 125 },
  { time: '15:26', latency: 132 }, { time: '15:27', latency: 129 }, { time: '15:28', latency: 136 },
  { time: '15:29', latency: 139 }, { time: '15:30', latency: 142 },
]

export const predictionData = [
  { time: '15:20', actual: 118, predicted: 121 }, { time: '15:21', actual: 126, predicted: 124 },
  { time: '15:22', actual: 139, predicted: 135 }, { time: '15:23', actual: 132, predicted: 138 },
  { time: '15:24', actual: 151, predicted: 147 }, { time: '15:25', actual: 145, predicted: 150 },
  { time: '15:26', actual: 161, predicted: 158 }, { time: '15:27', actual: 158, predicted: 165 },
  { time: '15:28', actual: 176, predicted: 173 }, { time: '15:29', actual: 169, predicted: 181 },
  { time: '15:30', actual: 184, predicted: 190 }, { time: '15:35', actual: null, predicted: 224 },
  { time: '15:40', actual: null, predicted: 259 }, { time: '15:45', actual: null, predicted: 291 },
  { time: '15:50', actual: null, predicted: 327 },
]

export const instances = [
  { id: 'instance-01', port: 5001, status: 'Healthy', requests: 4821, responseTime: 138, rps: 91 },
  { id: 'instance-02', port: 5002, status: 'Healthy', requests: 4764, responseTime: 146, rps: 93 },
]

export const telemetry = [
  { timestamp: '15:30:12', server: 'instance-01', responseTime: 134, rps: 92 },
  { timestamp: '15:30:11', server: 'instance-02', responseTime: 149, rps: 92 },
  { timestamp: '15:30:10', server: 'instance-01', responseTime: 141, rps: 90 },
  { timestamp: '15:30:09', server: 'instance-02', responseTime: 143, rps: 94 },
]
