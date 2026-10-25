
const ALGORITHMS = [
  "round_robin",
  "weighted_round_robin",
  "least_connections",
  "weighted_least_connections",
  "least_response_time",
  "power_of_two"
];

let selectedAlgorithm = "round_robin";

function getSelectedAlgorithm() {
  return selectedAlgorithm;
}

function setSelectedAlgorithm(algorithm) {
  if (!ALGORITHMS.includes(algorithm)) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  selectedAlgorithm = algorithm;
  return selectedAlgorithm;
}

module.exports = {
  ALGORITHMS,
  getSelectedAlgorithm,
  setSelectedAlgorithm
};
