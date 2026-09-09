const express = require("express");

const app = express();

const PORT = 5001;

app.get("/", (req, res) => {
    res.send("Hello from Server 1");
});

app.listen(PORT, () => {
    console.log(`Server 1 running on port ${PORT}`);
});