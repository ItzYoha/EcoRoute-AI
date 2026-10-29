
const SERVER_WEIGHTS = {
  "http://localhost:5001": 5,
  "http://localhost:5002": 3,
  "http://localhost:5003": 2,
  "http://localhost:5004": 4,
  "http://localhost:5005": 1
};

const activeConnections = {};

function weightedLeastConnections(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("No active backend servers available");
  }

  let selectedServer = servers[0];
  let minimumLoad = Infinity;

  servers.forEach((server) => {
    const connections = activeConnections[server] || 0;
    const weight = SERVER_WEIGHTS[server] || 1;
    const load = connections / weight;

    if (load < minimumLoad) {
      minimumLoad = load;
      selectedServer = server;
    }
  });

  return selectedServer;
}

function incrementConnections(server) {
  activeConnections[server] = (activeConnections[server] || 0) + 1;
}

function decrementConnections(server) {
  if (activeConnections[server] > 0) {
    activeConnections[server]--;
  }
}

weightedLeastConnections.incrementConnections = incrementConnections;
weightedLeastConnections.decrementConnections = decrementConnections;

module.exports = weightedLeastConnections;
