require("dotenv").config();

const express = require("express");
const pool = require("./db");
const booksRouter = require("./routes/books");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));
app.use("/api/books", booksRouter);

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.status(200).json({
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);

        res.status(500).json({
            status: "error",
            database: "disconnected"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});