const express = require("express");

const app = express();

const PORT = 8000;

const servers = [
    "http://localhost:5001",
    "http://localhost:5002"
];

let currentServer = 0;

app.use(async (req, res) => {

    const startTime = Date.now();

    const server = servers[currentServer];

    currentServer = (currentServer + 1) % servers.length;

    console.log("Forwarding request to:", server);

    try {
        const response = await fetch(server + req.originalUrl);

        const body = await response.text();

        const responseTime = Date.now() - startTime;

        console.log("Response time:", responseTime, "ms");

        res.status(response.status).send(body);

    } catch (error) {
        console.log("Server unavailable:", server);
        res.status(500).send("Server unavailable");
    }
});

app.listen(PORT, () => {
    console.log(`Load Balancer running on port ${PORT}`);
});