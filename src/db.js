const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000   // fail fast instead of hanging /health
});

// Without this, a dropped idle connection crashes the whole process
pool.on("error", (error) => {
    console.error("Idle database client error:", error.message);
});

module.exports = pool;