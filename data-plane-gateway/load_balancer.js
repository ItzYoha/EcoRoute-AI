const express = require("express");
const { createClient } = require("redis");

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

let currentServer = 0;

// Five-minute RPS history for analytics and forecasting
const RPS_WINDOW = 5 * 60 * 1000;
let requestCount = 0;
let windowStart = Date.now();
const recentRequestTimestamps = [];



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
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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
    currentServer = currentServer % servers.length;

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

        // Calculate live RPS over the most recent 10 seconds
        const now = Date.now();
        const cutoff = now - 10_000;

        while (
            recentRequestTimestamps.length > 0 &&
            recentRequestTimestamps[0] <= cutoff
        ) {
            recentRequestTimestamps.shift();
        }

        const latestRps = Number(
            (recentRequestTimestamps.length / 10).toFixed(2)
        );
        
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

//Default Round Robin:
//Modify this function to call algorithms and select the appropriate algorithms 
app.use(async (req, res) => {
    requestCount++;

    // Track requests for the live RPS calculation
    recentRequestTimestamps.push(Date.now());

    console.log("Request count:", requestCount);

    const startTime = Date.now();

    const server = servers[currentServer];

    currentServer = (currentServer + 1) % servers.length;

    console.log("Forwarding request to:", server);

    try {
        const response = await fetch(server + req.originalUrl);

        const body = await response.text();

        const responseTime = Date.now() - startTime;

        console.log("Response time:", responseTime, "ms");

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
        res.status(500).send("Server unavailable");
    }
});

app.listen(PORT, () => {
    console.log(`Load Balancer running on port ${PORT}`);
});