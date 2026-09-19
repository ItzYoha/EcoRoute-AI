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

const servers = [
    "http://localhost:5001",
    "http://localhost:5002"
];

let currentServer = 0;
let requestCount = 0;

const RPS_WINDOW = 5 * 60 * 1000;
let windowStart = Date.now();


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

    const currentTime = Date.now();

    if (currentTime - windowStart >= RPS_WINDOW) {

        const elapsedSeconds = (currentTime - windowStart) / 1000;

        const rps = requestCount / elapsedSeconds;

        console.log("RPS:", rps.toFixed(2));

        await redisClient.lPush(
            "rps_metrics",
            JSON.stringify({
                rps: Number(rps.toFixed(2)),
                timestamp: new Date().toISOString()
            })
        );

        requestCount = 0;
        windowStart = currentTime;
    }

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