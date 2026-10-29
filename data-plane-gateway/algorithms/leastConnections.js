// TODO: Implement the Least Connections load-balancing algorithm.
//
// Requirements:
// 1. Select the backend with the fewest active requests.
// 2. Track active requests when they begin and complete.
// 3. Decrease the active-request count when a request finishes or fails.
// 4. Ensure request counts do not become negative.
// 5. Handle an empty backend list safely.
// 6. Define a consistent tie-breaking strategy.
// 7. Handle backend additions and removals.
// 8. Export the algorithm using the common interface agreed upon
//    for all load-balancing algorithms.
//
// Note: Active-request counts must reflect requests currently in progress,
// not total requests received over time.


const activeConnections = {};

function leastConnections(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("No active backend servers available");
  }

  let selectedServer = servers[0];
  let minimumConnections = activeConnections[selectedServer] || 0;

  servers.forEach((server) => {
    const connections = activeConnections[server] || 0;

    if (connections < minimumConnections) {
      minimumConnections = connections;
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

leastConnections.incrementConnections = incrementConnections;
leastConnections.decrementConnections = decrementConnections;

module.exports = leastConnections;
