
const activeConnections = {};

function powerOfTwoChoices(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("No active backend servers available");
  }

  if (servers.length === 1) {
    return servers[0];
  }

  const firstIndex = Math.floor(Math.random() * servers.length);
  let secondIndex = Math.floor(Math.random() * (servers.length - 1));

  if (secondIndex >= firstIndex) {
    secondIndex++;
  }

  const firstServer = servers[firstIndex];
  const secondServer = servers[secondIndex];

  const firstLoad = activeConnections[firstServer] || 0;
  const secondLoad = activeConnections[secondServer] || 0;

  return firstLoad <= secondLoad ? firstServer : secondServer;
}

function incrementConnections(server) {
  activeConnections[server] = (activeConnections[server] || 0) + 1;
}

function decrementConnections(server) {
  if (activeConnections[server] > 0) {
    activeConnections[server]--;
  }
}

powerOfTwoChoices.incrementConnections = incrementConnections;
powerOfTwoChoices.decrementConnections = decrementConnections;

module.exports = powerOfTwoChoices;
