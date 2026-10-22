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