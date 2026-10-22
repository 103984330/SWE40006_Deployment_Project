// Unit tests for GET /health.
// The database is mocked, so these run without Postgres.
const request = require("supertest");

jest.mock("../../src/db", () => ({ query: jest.fn() }));

const pool = require("../../src/db");

// server.js exports the app and only calls listen() when run directly, so no port is opened
const app = require("../../src/server");

beforeEach(() => {
    pool.query.mockReset();
    // Silence the request logger and the DB failure log
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("GET /health", () => {
    test("returns 200 connected when SELECT 1 succeeds", async () => {
        pool.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });

        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok", database: "connected" });
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    });

    test("returns 500 disconnected when SELECT 1 fails", async () => {
        pool.query.mockRejectedValue(new Error("connection refused"));

        const res = await request(app).get("/health");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ status: "error", database: "disconnected" });
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(console.error).toHaveBeenCalledWith(
            "Database connection failed:",
            "connection refused"
        );
    });
});
