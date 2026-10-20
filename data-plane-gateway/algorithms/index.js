// TODO: Implement the load-balancing algorithm registry.
//
// Requirements:
// 1. Import the Round Robin, Least Connections and Weighted Round Robin
//    implementations.
// 2. Register the algorithms using these identifiers:
//      - round_robin
//      - least_connections
//      - weighted_round_robin
// 3. Set round_robin as the default algorithm.
// 4. Provide a function to retrieve the currently selected algorithm.
// 5. Provide a function to change the selected algorithm.
// 6. Validate algorithm names and reject unsupported algorithms.
// 7. Keep algorithm selection separate from backend registration.
// 8. Ensure changing algorithms does not interfere with Docker autoscaling.
// 9. Export the registry functions for integration with load_balancer.js.
//
// Note: The GET /api/algo and PUT /api/algo endpoints will use this registry.
// The PUT /api/backends endpoint must continue updating the backend list
// without resetting the selected algorithm.