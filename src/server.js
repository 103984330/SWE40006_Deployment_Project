require("dotenv").config();

const path = require("path");
const express = require("express");
const pool = require("./db");
const booksRouter = require("./routes/books");

const app = express();
const PORT = process.env.PORT || 3000;


// Structured HTTP request logging for CloudWatch
app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - startTime;

        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: duration
        };

        console.log(JSON.stringify(logEntry));
    });

    next();
});


app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/books", booksRouter);


app.get("/health", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        await pool.query("SELECT 1");

        res.status(200).json({
            status: "ok",
            database: "connected"
        });

    } catch (error) {
        console.error(
            "Database connection failed:",
            error.message
        );

        res.status(500).json({
            status: "error",
            database: "disconnected"
        });
    }
});


// Only listen when run directly (npm start / Docker), so tests can import the app
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(
            `Server running on http://localhost:${PORT}`
        );
    });
}


module.exports = app;