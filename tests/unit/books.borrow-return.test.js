// Unit tests for POST /api/books/:id/borrow and POST /api/books/:id/return.
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

const BOOK = {
    id: 3,
    title: "Design Patterns",
    author: "Erich Gamma",
    isbn: "9780201633610",
    total_copies: 3,
    available_copies: 2,
};

beforeEach(() => {
    pool.query.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("POST /api/books/:id/borrow", () => {
    test("success returns 200 with message and the updated book", async () => {
        const updated = { ...BOOK, available_copies: 1 };
        pool.query.mockResolvedValue({ rows: [updated] });

        const res = await request(app).post("/api/books/3/borrow");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message: "Book borrowed successfully",
            book: updated,
        });

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/available_copies\s*>\s*0/);
        expect(params).toEqual(["3"]);
    });

    test("zero rows (no copies left or unknown id) returns 400", async () => {
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app).post("/api/books/3/borrow");

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book not available or book not found" });
    });

    test.each([
        ["no x-user-role header", {}],
        ["x-user-role: customer", { "x-user-role": "customer" }],
    ])("works with %s", async (_label, headers) => {
        pool.query.mockResolvedValue({ rows: [{ ...BOOK, available_copies: 1 }] });

        const res = await request(app).post("/api/books/3/borrow").set(headers);

        expect(res.status).toBe(200);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test("DB error returns 500", async () => {
        pool.query.mockRejectedValue(new Error("connection refused"));

        const res = await request(app).post("/api/books/3/borrow");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to borrow book" });
    });
});

describe("POST /api/books/:id/return", () => {
    test("success returns 200 with message and the updated book", async () => {
        const updated = { ...BOOK, available_copies: 3 };
        pool.query.mockResolvedValue({ rows: [updated] });

        const res = await request(app).post("/api/books/3/return");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message: "Book returned successfully",
            book: updated,
        });
    });

    test("query guards against returning more than total_copies", async () => {
        pool.query.mockResolvedValue({ rows: [BOOK] });

        await request(app).post("/api/books/3/return");

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/available_copies\s*<\s*total_copies/);
        expect(params).toEqual(["3"]);
    });

    test("zero rows (already full or unknown id) returns 400", async () => {
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app).post("/api/books/3/return");

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book cannot be returned or book not found" });
    });

    test("DB error returns 500", async () => {
        pool.query.mockRejectedValue(new Error("connection refused"));

        const res = await request(app).post("/api/books/3/return");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to return book" });
    });
});

describe("Invalid ids on borrow and return", () => {
    test.each([
        ["borrow", "abc"],
        ["borrow", "-1"],
        ["borrow", "2147483648"],
        ["return", "abc"],
        ["return", "1abc"],
        ["return", "99999999999"],
    ])("%s with id %p returns 400 without querying", async (action, id) => {
        const res = await request(app).post(`/api/books/${id}/${action}`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Invalid book id" });
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("the largest INTEGER id (2147483647) is accepted and reaches the database", async () => {
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app).post("/api/books/2147483647/borrow");

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book not available or book not found" });
        expect(pool.query).toHaveBeenCalledTimes(1);
    });
});
