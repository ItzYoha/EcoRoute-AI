const express = require("express");

const app = express();

const PORT = 5002;

app.get("/", (req, res) => {
    res.send("Hello from Server 2");
});

app.listen(PORT, () => {
    console.log(`Server 2 running on port ${PORT}`);
});