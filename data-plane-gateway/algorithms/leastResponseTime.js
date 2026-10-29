
const responseTimes = {};
const requestCounts = {};

function leastResponseTime(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("No active backend servers available");
  }

  const unprobedServer = servers.find((server) => !(requestCounts[server] > 0));
  if (unprobedServer) {
    return unprobedServer;
  }

  let selectedServer = servers[0];
  let minimumTime = Infinity;

  servers.forEach((server) => {
    const totalTime = responseTimes[server] || 0;
    const count = requestCounts[server] || 0;

    const averageTime = count > 0
      ? totalTime / count
      : Infinity;

    if (averageTime < minimumTime) {
      minimumTime = averageTime;
      selectedServer = server;
    }
  });

  return selectedServer;
}

function recordResponseTime(server, duration) {
  if (!Number.isFinite(duration) || duration < 0) {
    return;
  }

  responseTimes[server] =
    (responseTimes[server] || 0) + duration;

  requestCounts[server] =
    (requestCounts[server] || 0) + 1;
}

function reset() {
  Object.keys(responseTimes).forEach((key) => delete responseTimes[key]);
  Object.keys(requestCounts).forEach((key) => delete requestCounts[key]);
}

leastResponseTime.recordResponseTime = recordResponseTime;
leastResponseTime.reset = reset;

module.exports = leastResponseTime;
