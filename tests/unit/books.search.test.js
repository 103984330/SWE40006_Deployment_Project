// Unit tests for GET /api/books (list + search).
// The database is mocked, so these run without Postgres.
const express = require("express");
const request = require("supertest");

jest.mock("../../src/db", () => ({ query: jest.fn() }));

const pool = require("../../src/db");
const booksRouter = require("../../src/routes/books");

// Mount the router on a bare app so server.js (which calls listen) is never loaded
const app = express();
app.use(express.json());
app.use("/api/books", booksRouter);

const BOOKS = [
    { id: 1, title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", total_copies: 3, available_copies: 3 },
    { id: 2, title: "The Pragmatic Programmer", author: "Andrew Hunt", isbn: "9780201616224", total_copies: 2, available_copies: 1 },
];

beforeEach(() => {
    pool.query.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("GET /api/books without search", () => {
    test("returns all books ordered by id", async () => {
        pool.query.mockResolvedValue({ rows: BOOKS });

        const res = await request(app).get("/api/books");

        expect(res.status).toBe(200);
        expect(res.body).toEqual(BOOKS);
        expect(pool.query).toHaveBeenCalledTimes(1);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/SELECT \* FROM books ORDER BY id/);
        expect(sql).not.toMatch(/ILIKE/);
        expect(params).toBeUndefined();
    });

    test("empty ?search= falls back to listing all books", async () => {
        pool.query.mockResolvedValue({ rows: BOOKS });

        const res = await request(app).get("/api/books?search=");

        expect(res.status).toBe(200);
        expect(res.body).toEqual(BOOKS);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).not.toMatch(/ILIKE/);
        expect(params).toBeUndefined();
    });
});

describe("GET /api/books?search=", () => {
    test("query matches title, author and isbn with ILIKE", async () => {
        pool.query.mockResolvedValue({ rows: [BOOKS[0]] });

        await request(app).get("/api/books?search=clean");

        const [sql] = pool.query.mock.calls[0];
        expect(sql).toMatch(/title ILIKE \$1/);
        expect(sql).toMatch(/author ILIKE \$1/);
        expect(sql).toMatch(/isbn ILIKE \$1/);
        expect(sql).toMatch(/ORDER BY id/);
    });

    test.each([
        ["title", "Clean Code", BOOKS[0]],
        ["author", "Andrew Hunt", BOOKS[1]],
        ["ISBN", "9780132350884", BOOKS[0]],
    ])("search by %s wraps the term as %%term%%", async (_field, term, book) => {
        pool.query.mockResolvedValue({ rows: [book] });

        const res = await request(app)
            .get("/api/books")
            .query({ search: term });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([book]);

        const [, params] = pool.query.mock.calls[0];
        expect(params).toEqual([`%${term}%`]);
    });

    test("URL-encoded term with spaces is decoded before querying", async () => {
        pool.query.mockResolvedValue({ rows: [BOOKS[1]] });

        const res = await request(app).get("/api/books?search=Pragmatic%20Programmer");

        expect(res.status).toBe(200);
        const [, params] = pool.query.mock.calls[0];
        expect(params).toEqual(["%Pragmatic Programmer%"]);
    });

    test("no match returns an empty array with 200", async () => {
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app).get("/api/books?search=nonexistent");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test("SQL-injection-looking term is passed as a parameter, not in the SQL text", async () => {
        const malicious = "'; DROP TABLE books; --";
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app)
            .get("/api/books")
            .query({ search: malicious });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);

        const [sql, params] = pool.query.mock.calls[0];
        expect(params).toEqual([`%${malicious}%`]);
        expect(sql).not.toContain(malicious);
        expect(sql).not.toMatch(/DROP TABLE/i);
    });
});

describe("GET /api/books database errors", () => {
    test.each([
        ["list", "/api/books"],
        ["search", "/api/books?search=clean"],
    ])("%s returns 500 when the query fails", async (_mode, url) => {
        pool.query.mockRejectedValue(new Error("connection refused"));

        const res = await request(app).get(url);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to retrieve books" });
        expect(console.error).toHaveBeenCalledWith(
            "Failed to retrieve books:",
            "connection refused"
        );
    });
});
