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