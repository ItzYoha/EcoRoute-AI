// TODO: Implement the Weighted Round Robin load-balancing algorithm.
//
// Requirements:
// 1. Assign a configurable weight to each backend instance.
// 2. Distribute requests according to the configured backend weights.
// 3. Give higher-weight backends a proportionally larger share of requests.
// 4. Define default weights for backends without an explicit weight.
// 5. Handle an empty backend list safely.
// 6. Handle backend additions and removals.
// 7. Skip unavailable backends if backend health information is available.
// 8. Export the algorithm using the common interface agreed upon
//    for all load-balancing algorithms.
//
// Note: A backend with weight 3 should receive approximately three times
// as many requests as a backend with weight 1 over a sufficiently
// large number of requests.


const SERVER_WEIGHTS = {
  "http://localhost:5001": 5,
  "http://localhost:5002": 3,
  "http://localhost:5003": 2,
  "http://localhost:5004": 4,
  "http://localhost:5005": 1
};

let currentWeights = {};
let previousServersKey = "";

function weightedRoundRobin(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("No active backend servers available");
  }

  const weights = servers.map((server) => {
    const weight = SERVER_WEIGHTS[server];
    return Number.isSafeInteger(weight) && weight > 0 ? weight : 1;
  });

  const serversKey = JSON.stringify(servers);

  if (serversKey !== previousServersKey) {
    currentWeights = {};
    servers.forEach((server) => {
      currentWeights[server] = 0;
    });
    previousServersKey = serversKey;
  }

  const totalWeight = weights.reduce(
    (sum, weight) => sum + weight,
    0
  );

  let selectedIndex = 0;

  servers.forEach((server, index) => {
    currentWeights[server] += weights[index];

    if (
      currentWeights[server] >
      currentWeights[servers[selectedIndex]]
    ) {
      selectedIndex = index;
    }
  });

  const selectedServer = servers[selectedIndex];

  currentWeights[selectedServer] -= totalWeight;

  return selectedServer;
}

module.exports = weightedRoundRobin;
