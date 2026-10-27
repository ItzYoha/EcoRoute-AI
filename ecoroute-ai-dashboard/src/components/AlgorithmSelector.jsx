import { useState, useEffect } from "react";
import "./AlgorithmSelector.css";

const algorithms = [
  {
    id: "round_robin",
    name: "Round Robin",
    description: "Distributes requests sequentially across active servers."
  },
  {
    id: "weighted_round_robin",
    name: "Weighted Round Robin",
    description: "Sends more requests to servers with higher weights."
  },
  {
    id: "least_connections",
    name: "Least Connections",
    description: "Chooses the server handling the fewest active requests."
  },
  {
    id: "weighted_least_connections",
    name: "Weighted Least Connections",
    description: "Considers both server load and assigned weights."
  },
  {
    id: "least_response_time",
    name: "Least Response Time",
    description: "Prefers servers with lower recent response times."
  },
  {
    id: "power_of_two",
    name: "Power of Two Choices",
    description: "Selects two servers at random and chooses the less busy one."
  }
];

export default function AlgorithmSelector() {
  const [selected, setSelected] = useState("round_robin");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadSelectedAlgorithm() {
      try {
        const response = await fetch(
          "http://localhost:8000/api/algorithm"
        );

        if (!response.ok) {
          throw new Error("Could not fetch algorithm");
        }

        const data = await response.json();
        setSelected(data.algorithm);
      } catch (error) {
        console.error("Could not load selected algorithm:", error);
      }
    }

    loadSelectedAlgorithm();
  }, []);

  async function handleChange(event) {
    const algorithm = event.target.value;
    setSelected(algorithm);
    setStatus("Applying algorithm...");

    try {
      const response = await fetch(
        "http://localhost:8000/api/algorithm",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ algorithm })
        }
      );

      if (!response.ok) {
        throw new Error("Could not update algorithm");
      }

      setStatus("Algorithm applied successfully.");
    } catch (error) {
      setStatus("Failed to apply algorithm. Check the load balancer.");
    }
  }

  return (
    <section id="load-balancing-algorithm" className="algorithm-card">
      <div className="algorithm-heading">
        <div>
          <h2>Load Balancing Algorithm</h2>
          <p>Select how incoming API requests are distributed.</p>
        </div>
        <span className="algorithm-badge">Routing</span>
      </div>

      <div className="algorithm-options">
        {algorithms.map((algorithm) => (
          <label
            key={algorithm.id}
            className={`algorithm-option ${selected === algorithm.id ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="load-balancing-algorithm"
              value={algorithm.id}
              checked={selected === algorithm.id}
              onChange={handleChange}
            />

            <div>
              <strong>{algorithm.name}</strong>
              <p>{algorithm.description}</p>
            </div>
          </label>
        ))}
      </div>

      {status && (
        <p className="algorithm-status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  );
}
