// Unit tests for POST /api/books (add) and DELETE /api/books/:id.
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

const ADMIN = { "x-user-role": "admin" };

const NEW_BOOK = {
    title: "Refactoring",
    author: "Martin Fowler",
    isbn: "9780134757599",
    total_copies: 2,
};

const SAVED_BOOK = { id: 7, ...NEW_BOOK, available_copies: 2 };

beforeEach(() => {
    pool.query.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("POST /api/books (admin)", () => {
    test("returns 201 with the inserted row", async () => {
        pool.query.mockResolvedValue({ rows: [SAVED_BOOK] });

        const res = await request(app).post("/api/books").set(ADMIN).send(NEW_BOOK);

        expect(res.status).toBe(201);
        expect(res.body).toEqual(SAVED_BOOK);
        expect(pool.query).toHaveBeenCalledTimes(1);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO books/);
        expect(sql).toMatch(/RETURNING \*/);
        expect(params).toEqual(["Refactoring", "Martin Fowler", "9780134757599", 2]);
    });

    test("total_copies defaults to 1 when omitted", async () => {
        const { total_copies, ...withoutCopies } = NEW_BOOK;
        pool.query.mockResolvedValue({ rows: [{ ...SAVED_BOOK, total_copies: 1, available_copies: 1 }] });

        const res = await request(app).post("/api/books").set(ADMIN).send(withoutCopies);

        expect(res.status).toBe(201);
        const [, params] = pool.query.mock.calls[0];
        expect(params[3]).toBe(1);
    });

    test("total_copies of 0 is accepted", async () => {
        pool.query.mockResolvedValue({ rows: [{ ...SAVED_BOOK, total_copies: 0, available_copies: 0 }] });

        const res = await request(app)
            .post("/api/books")
            .set(ADMIN)
            .send({ ...NEW_BOOK, total_copies: 0 });

        expect(res.status).toBe(201);
        const [, params] = pool.query.mock.calls[0];
        expect(params[3]).toBe(0);
    });

    test("the same value is used for total and available copies", async () => {
        pool.query.mockResolvedValue({ rows: [SAVED_BOOK] });

        await request(app).post("/api/books").set(ADMIN).send({ ...NEW_BOOK, total_copies: 5 });

        const [sql, params] = pool.query.mock.calls[0];
        // total_copies and available_copies both bind to $4
        expect(sql).toMatch(/total_copies,\s*available_copies/);
        expect(sql).toMatch(/VALUES\s*\(\$1, \$2, \$3, \$4, \$4\)/);
        expect(params).toHaveLength(4);
        expect(params[3]).toBe(5);
    });
});

describe("POST /api/books validation and errors", () => {
    test.each(["title", "author", "isbn"])("missing %s returns 400", async (field) => {
        const body = { ...NEW_BOOK };
        delete body[field];

        const res = await request(app).post("/api/books").set(ADMIN).send(body);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "title, author and isbn are required" });
        expect(pool.query).not.toHaveBeenCalled();
    });

    test.each([
        ["negative", -1],
        ["decimal", 2.5],
        ["string", "3"],
    ])("total_copies %s (%p) returns 400", async (_label, value) => {
        const res = await request(app)
            .post("/api/books")
            .set(ADMIN)
            .send({ ...NEW_BOOK, total_copies: value });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "total_copies must be a non-negative integer" });
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("duplicate ISBN (23505) returns 409", async () => {
        const duplicate = Object.assign(new Error("duplicate key value"), { code: "23505" });
        pool.query.mockRejectedValue(duplicate);

        const res = await request(app).post("/api/books").set(ADMIN).send(NEW_BOOK);

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: "A book with this ISBN already exists" });
    });

    test("any other DB error returns 500", async () => {
        pool.query.mockRejectedValue(new Error("connection refused"));

        const res = await request(app).post("/api/books").set(ADMIN).send(NEW_BOOK);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to add book" });
    });
});

describe("POST /api/books authorisation", () => {
    test.each([
        ["no x-user-role header", {}],
        ["x-user-role: customer", { "x-user-role": "customer" }],
        ["x-user-role: Admin (wrong case)", { "x-user-role": "Admin" }],
    ])("%s returns 403", async (_label, headers) => {
        const res = await request(app).post("/api/books").set(headers).send(NEW_BOOK);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: "Administrator access required" });
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe("DELETE /api/books/:id", () => {
    test("admin gets 200 with message and the deleted book", async () => {
        pool.query.mockResolvedValue({ rows: [SAVED_BOOK] });

        const res = await request(app).delete("/api/books/7").set(ADMIN);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message: "Book deleted successfully",
            book: SAVED_BOOK,
        });

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/DELETE FROM books/);
        expect(sql).toMatch(/WHERE id = \$1/);
        // Route params are strings; the router passes the id through unconverted
        expect(params).toEqual(["7"]);
    });

    test("unknown id returns 404", async () => {
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app).delete("/api/books/999").set(ADMIN);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Book not found" });
    });

    test.each([
        ["x-user-role: customer", { "x-user-role": "customer" }],
        ["no x-user-role header", {}],
    ])("%s returns 403 without querying", async (_label, headers) => {
        const res = await request(app).delete("/api/books/7").set(headers);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: "Administrator access required" });
        expect(pool.query).not.toHaveBeenCalled();
    });

    test("DB error returns 500", async () => {
        pool.query.mockRejectedValue(new Error("connection refused"));

        const res = await request(app).delete("/api/books/7").set(ADMIN);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to delete book" });
    });
});
