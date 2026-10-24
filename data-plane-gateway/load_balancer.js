const express = require("express");
const { createClient } = require("redis");
const { getAlgorithm } = require("./algorithms");

const leastConnections = require("./algorithms/leastConnections");
const weightedLeastConnections = require("./algorithms/weightedLeastConnections");
const powerOfTwoChoices = require("./algorithms/powerOfTwoChoices");
const leastResponseTime = require("./algorithms/leastResponseTime");


const connectionTrackers = {
  least_connections: leastConnections,
  weighted_least_connections: weightedLeastConnections,
  power_of_two: powerOfTwoChoices
};

const {
  ALGORITHMS,
  getSelectedAlgorithm,
  setSelectedAlgorithm
} = require("./algorithmRegistry");

const app = express();
const redisClient = createClient({
    url: "redis://localhost:6379"
});
redisClient.connect()
    .then(() => {
        console.log("Connected to Redis");
    })
    .catch((error) => {
        console.error("Redis connection error:", error);
    });

const PORT = 8000;
// Active backend registry
const BACKEND_REGISTRY_KEY = "active_backends";

let servers = [
    "http://localhost:5001",
    "http://localhost:5002"
];

const RPS_WINDOW = 5 * 60 * 1000;
let requestCount = 0;
let windowStart = Date.now();


async function saveRpsMeasurement() {
    const now = Date.now();
    const elapsedSeconds = (now - windowStart) / 1000;

    if (elapsedSeconds <= 0) return;

    const intervalStart = new Date(windowStart).toISOString();
    const intervalEnd = new Date(now).toISOString();

    const rps = requestCount / elapsedSeconds;

    const measurement = {
        rps: Number(rps.toFixed(2)),
        timestamp: intervalEnd,
        interval_start: intervalStart,
        interval_end: intervalEnd,
        duration_seconds: Number(elapsedSeconds.toFixed(2))
    };

    console.log("RPS timer fired:", measurement);

    try {
        await redisClient.lPush(
            "rps_metrics",
            JSON.stringify(measurement)
        );

        console.log("Saved RPS:", measurement);
    } catch (error) {
        console.error("Could not save RPS:", error);
    }

    requestCount = 0;
    windowStart = now;
}

redisClient.on("ready", () => {
    console.log("Starting 5-minute RPS timer");

    setInterval(saveRpsMeasurement, RPS_WINDOW);
});


/* Dashboard API routes */

// Allow requests from the Vite frontend
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "EcoRoute AI Load Balancer"
    });
});

// Update active backends (called by the control plane)
app.use(express.json());

app.get("/api/algorithm", (req, res) => {
  res.json({
    algorithm: getSelectedAlgorithm(),
    availableAlgorithms: ALGORITHMS
  });
});

app.put("/api/algorithm", (req, res) => {
  const { algorithm } = req.body;

  try {
    const selected = setSelectedAlgorithm(algorithm);

    res.json({
      status: "updated",
      algorithm: selected
    });
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

app.put("/api/backends", async (req, res) => {
    const { servers: newServers } = req.body;

    if (
        !Array.isArray(newServers) ||
        newServers.length === 0 ||
        !newServers.every(
            (server) =>
                typeof server === "string" &&
                /^https?:\/\/.+/.test(server)
        )
    ) {
        return res.status(400).json({
            error: "Provide a non-empty array of backend URLs."
        });
    }

    servers = [...newServers];

    try {
        await redisClient.set(
            BACKEND_REGISTRY_KEY,
            JSON.stringify(servers)
        );

        res.json({
            status: "updated",
            activeBackends: servers
        });
    } catch (error) {
        console.error("Backend registry update failed:", error);
        res.status(500).json({
            error: "Could not save backend registry."
        });
    }
});

// Metrics endpoint
app.get("/api/metrics", async (req, res) => {
    try {
        const rpsMetrics = await redisClient.lRange(
            "rps_metrics", 0, 19
        );

        const responseMetrics = await redisClient.lRange(
            "response_times", 0, 19
        );

        const rpsData = rpsMetrics.map(JSON.parse);
        const responseData = responseMetrics.map(JSON.parse);

        const latestRps = rpsData.length
            ? rpsData[0].rps
            : null;

        const averageResponseTime = responseData.length
            ? responseData.reduce(
                (sum, item) => sum + item.responseTime, 0
              ) / responseData.length
            : null;

        res.json({
            currentRps: latestRps,
            avgResponseTime: averageResponseTime === null
                ? null
                : Number(averageResponseTime.toFixed(2)),
            rpsHistory: rpsData,
            responseHistory: responseData
        });

    } catch (error) {
        console.error("Metrics endpoint error:", error);
        res.status(500).json({
            error: "Could not retrieve metrics"
        });
    }
});


app.use(async (req, res) => {
    requestCount++;

    console.log("Request count:", requestCount);

    const startTime = Date.now();

    const algorithmName = getSelectedAlgorithm();
    const selectServer = getAlgorithm(algorithmName);
    const server = selectServer(servers);

    const tracker = connectionTrackers[algorithmName];

    if (tracker) {
        tracker.incrementConnections(server);
    }

    console.log("Forwarding request to:", server);

    try {
        const response = await fetch(server + req.originalUrl);

        const body = await response.text();

        const responseTime = Date.now() - startTime;

        console.log("Response time:", responseTime, "ms");

        // Keep response-time history for the Least Response Time algorithm.
        leastResponseTime.recordResponseTime(server, responseTime);

        await redisClient.lPush(
            "response_times",
            JSON.stringify({
                server: server,
                responseTime: responseTime,
                timestamp: new Date().toISOString()
            })
        );

        res.status(response.status).send(body);

    } catch (error) {
        console.log("Server unavailable:", server);

        if (!res.headersSent) {
            res.status(500).send("Server unavailable");
        }

    } finally {
        // Decrement even if the backend request fails.
        if (tracker) {
            tracker.decrementConnections(server);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Load Balancer running on port ${PORT}`);
});