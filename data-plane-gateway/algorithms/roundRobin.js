// TODO: Implement the Round Robin load-balancing algorithm.
//
// Requirements:
// 1. Select active backend instances in sequential order.
// 2. Move to the next backend after each request.
// 3. Wrap around to the first backend after reaching the end.
// 4. Handle an empty backend list safely.
// 5. Skip unavailable backends if backend health information is available.
// 6. Preserve the round-robin position when possible if the backend list changes.
// 7. Export the algorithm using the common interface agreed upon
//    for all load-balancing algorithms.
//
// Note: Round Robin is the default algorithm in EcoRoute AI.


let currentIndex = 0;

function roundRobin(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("No active backend servers available");
  }

  const server = servers[currentIndex % servers.length];
  currentIndex = (currentIndex + 1) % servers.length;

  return server;
}

module.exports = roundRobin;
