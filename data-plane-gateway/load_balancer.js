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