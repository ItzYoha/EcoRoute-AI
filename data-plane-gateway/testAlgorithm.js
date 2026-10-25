const powerOfTwoChoices =
  require("./algorithms/powerOfTwoChoices");

const powerServers = [
  "http://localhost:5001",
  "http://localhost:5002"
];

for (let i = 0; i < 3; i++) {
  powerOfTwoChoices.incrementConnections(powerServers[0]);
}

powerOfTwoChoices.incrementConnections(powerServers[1]);

const originalRandom = Math.random;

try {
  // Force the candidate pair to be Server 1 and Server 2.
  Math.random = () => 0;

  const powerSelected = powerOfTwoChoices(powerServers);

  console.log("Power of Two selection:", powerSelected);
  assert.strictEqual(powerSelected, powerServers[1]);

  console.log("PASS: Power of Two Choices");
} finally {
  Math.random = originalRandom;
}