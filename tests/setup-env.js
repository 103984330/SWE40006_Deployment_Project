// Runs before every Jest test file (see "setupFiles" in package.json).
// Loads test-specific environment variables so tests never touch the dev database.
const path = require("path");
const dotenv = require("dotenv");

process.env.NODE_ENV = "test";

// Load .env.test if it exists; falls back to the defaults below.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), quiet: true });

// Defaults matching docker-compose.test.yml, used when .env.test is absent (e.g. in CI)
process.env.PORT ??= "3001";
process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "5433";
process.env.DB_NAME ??= "library_db_test";
process.env.DB_USER ??= "postgres";
process.env.DB_PASSWORD ??= "postgres";
