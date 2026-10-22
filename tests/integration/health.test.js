// Integration tests for GET /health and an API write/read smoke test, against a real PostgreSQL database.
// Start the test DB first:  docker compose -f docker-compose.test.yml up -d --wait
const request = require("supertest");
const app = require("../../src/server");
const { pool, resetDb, getBook } = require("../helpers/db");

beforeAll(() => {
    // Silence the request logger and the route error logs
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(async () => {
    await resetDb();
});

afterAll(async () => {
    await pool.end();
    jest.restoreAllMocks();
});

describe("GET /health", () => {
    test("[Health][positive] returns 200 with database connected against the real database", async () => {
        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok", database: "connected" });
        expect(res.headers["cache-control"]).toBe("no-store");
    });
});

describe("Smoke test", () => {
    test("[Health][smoke] a book added through the API can be read back through the API", async () => {
        const book = { title: "Site Reliability Engineering", author: "Betsy Beyer", isbn: "9781491929124", total_copies: 2 };

        const created = await request(app).post("/api/books").set({ "x-user-role": "admin" }).send(book);

        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ ...book, available_copies: 2 });

        const fetched = await request(app).get("/api/books").query({ search: book.isbn });

        expect(fetched.status).toBe(200);
        expect(fetched.body).toEqual([created.body]);
        expect(await getBook(created.body.id)).toEqual(created.body);
    });
});
