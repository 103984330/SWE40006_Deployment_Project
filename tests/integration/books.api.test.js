// Integration tests for /api/books against a real PostgreSQL database (no mocks).
// Start the test DB first:  docker compose -f docker-compose.test.yml up -d --wait
const request = require("supertest");
const app = require("../../src/server");
const { pool, SEED_BOOKS, resetDb, seedBooks, getBook, countBooks } = require("../helpers/db");

const ADMIN = { "x-user-role": "admin" };
const CUSTOMER = { "x-user-role": "customer" };
const UNKNOWN_ID = 999999;

// Seeded rows, refreshed before every test:
// pragmatic 3/3, cleanCode 0/2 (none available), refactoring 1/1 (single copy), patterns 2/4
let pragmatic, cleanCode, refactoring, patterns;

beforeAll(() => {
    // Silence the request logger and the route error logs
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(async () => {
    await resetDb();
    [pragmatic, cleanCode, refactoring, patterns] = await seedBooks();
});

afterAll(async () => {
    await pool.end();
    jest.restoreAllMocks();
});

const isbnsOf = (rows) => rows.map((row) => row.isbn);

describe("GET /api/books", () => {
    test("[Search][positive] list returns all seeded rows ordered by id", async () => {
        const res = await request(app).get("/api/books");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([pragmatic, cleanCode, refactoring, patterns]);
        expect(res.body.map((row) => row.id)).toEqual([1, 2, 3, 4]);
    });

    test("[Search][positive] by exact title returns the matching row", async () => {
        const res = await request(app).get("/api/books").query({ search: "Refactoring" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([refactoring]);
    });

    test("[Search][positive] by author returns the matching row", async () => {
        const res = await request(app).get("/api/books").query({ search: "Andrew Hunt" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([pragmatic]);
    });

    test("[Search][positive] by ISBN returns the matching row", async () => {
        const res = await request(app).get("/api/books").query({ search: "9780132350884" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([cleanCode]);
    });

    test.each([
        ["lowercase partial title", "clean", ["9780132350884"]],
        ["uppercase partial title", "PRAGMATIC", ["9780135957059"]],
        ["mixed-case partial author", "fOwLeR", ["9780134757599"]],
        ["partial ISBN", "2350884", ["9780132350884"]],
        ["term in two authors (ordered by id)", "martin", ["9780132350884", "9780134757599"]],
    ])("[Search][positive] case-insensitive partial match: %s", async (_label, search, expected) => {
        const res = await request(app).get("/api/books").query({ search });

        expect(res.status).toBe(200);
        expect(isbnsOf(res.body)).toEqual(expected);
    });

    test("[Search][negative] no match returns an empty array", async () => {
        const res = await request(app).get("/api/books").query({ search: "zzz-no-such-book" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe("POST /api/books", () => {
    const NEW_BOOK = { title: "Continuous Delivery", author: "Jez Humble", isbn: "9780321601919" };

    test("[Add book][positive] admin add persists the row with available_copies = total_copies", async () => {
        const res = await request(app).post("/api/books").set(ADMIN).send({ ...NEW_BOOK, total_copies: 5 });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ id: 5, ...NEW_BOOK, total_copies: 5, available_copies: 5 });

        // Visible through the API
        const list = await request(app).get("/api/books").query({ search: NEW_BOOK.isbn });
        expect(list.body).toEqual([res.body]);

        // And really in the database
        expect(await getBook(res.body.id)).toEqual(res.body);
        expect(await countBooks()).toBe(SEED_BOOKS.length + 1);
    });

    test("[Add book][positive] total_copies defaults to 1", async () => {
        const res = await request(app).post("/api/books").set(ADMIN).send(NEW_BOOK);

        expect(res.status).toBe(201);
        expect(res.body.total_copies).toBe(1);
        expect(res.body.available_copies).toBe(1);

        const row = await getBook(res.body.id);
        expect(row.total_copies).toBe(1);
        expect(row.available_copies).toBe(1);
    });

    test("[Add book][negative] duplicate ISBN returns 409 and leaves exactly one row", async () => {
        const res = await request(app)
            .post("/api/books")
            .set(ADMIN)
            .send({ title: "Another Title", author: "Someone", isbn: pragmatic.isbn });

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: "A book with this ISBN already exists" });
        expect(await countBooks(pragmatic.isbn)).toBe(1);
        expect(await getBook(pragmatic.id)).toEqual(pragmatic);
    });

    test.each([
        ["missing title", { author: "A", isbn: "111" }],
        ["missing author", { title: "T", isbn: "111" }],
        ["missing isbn", { title: "T", author: "A" }],
        ["blank title", { title: "   ", author: "A", isbn: "111" }],
        ["non-string author", { title: "T", author: 42, isbn: "111" }],
        ["empty body", {}],
    ])("[Add book][negative] %s returns 400 and persists nothing", async (_label, body) => {
        const res = await request(app).post("/api/books").set(ADMIN).send(body);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "title, author and isbn are required" });
        expect(await countBooks()).toBe(SEED_BOOKS.length);
    });

    test.each([
        ["negative", -1],
        ["decimal", 1.5],
        ["numeric string", "3"],
        ["null", null],
    ])("[Add book][negative] %s total_copies returns 400 and persists nothing", async (_label, total_copies) => {
        const res = await request(app).post("/api/books").set(ADMIN).send({ ...NEW_BOOK, total_copies });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "total_copies must be a non-negative integer" });
        expect(await countBooks()).toBe(SEED_BOOKS.length);
    });

    test("[Add book][negative] ISBN longer than 20 characters returns 400 and persists nothing", async () => {
        const res = await request(app).post("/api/books").set(ADMIN).send({ ...NEW_BOOK, isbn: "1".repeat(21) });

        expect(res.status).toBe(400);
        expect(await countBooks()).toBe(SEED_BOOKS.length);
    });

    test.each([
        ["customer role", CUSTOMER],
        ["missing role", {}],
    ])("[Access control][negative] add with %s returns 403 and persists nothing", async (_label, headers) => {
        const res = await request(app).post("/api/books").set(headers).send(NEW_BOOK);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: "Administrator access required" });
        expect(await countBooks()).toBe(SEED_BOOKS.length);
        expect(await countBooks(NEW_BOOK.isbn)).toBe(0);
    });
});

describe("DELETE /api/books/:id", () => {
    test("[Delete book][positive] admin delete removes the row", async () => {
        const res = await request(app).delete(`/api/books/${patterns.id}`).set(ADMIN);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: "Book deleted successfully", book: patterns });

        expect(await getBook(patterns.id)).toBeUndefined();
        const list = await request(app).get("/api/books");
        expect(list.body.map((row) => row.id)).not.toContain(patterns.id);
        expect(await countBooks()).toBe(SEED_BOOKS.length - 1);
    });

    test("[Delete book][negative] unknown id returns 404", async () => {
        const res = await request(app).delete(`/api/books/${UNKNOWN_ID}`).set(ADMIN);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Book not found" });
        expect(await countBooks()).toBe(SEED_BOOKS.length);
    });

    test.each([
        ["customer role", CUSTOMER],
        ["missing role", {}],
    ])("[Access control][negative] delete with %s returns 403 and the row remains", async (_label, headers) => {
        const res = await request(app).delete(`/api/books/${patterns.id}`).set(headers);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: "Administrator access required" });
        expect(await getBook(patterns.id)).toEqual(patterns);
    });
});

describe("POST /api/books/:id/borrow", () => {
    test("[Borrow][positive] decrements available_copies by exactly 1 in the database", async () => {
        const res = await request(app).post(`/api/books/${pragmatic.id}/borrow`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message: "Book borrowed successfully",
            book: { ...pragmatic, available_copies: 2 },
        });
        expect((await getBook(pragmatic.id)).available_copies).toBe(2);
        expect((await getBook(pragmatic.id)).total_copies).toBe(3);
    });

    test("[Borrow][negative] borrowing until 0 then once more returns 400 and never goes negative", async () => {
        for (const expected of [2, 1, 0]) {
            const res = await request(app).post(`/api/books/${pragmatic.id}/borrow`);
            expect(res.status).toBe(200);
            expect((await getBook(pragmatic.id)).available_copies).toBe(expected);
        }

        const res = await request(app).post(`/api/books/${pragmatic.id}/borrow`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book not available or book not found" });
        expect((await getBook(pragmatic.id)).available_copies).toBe(0);
    });

    test("[Borrow][negative] book with 0 available copies returns 400 and stays at 0", async () => {
        const res = await request(app).post(`/api/books/${cleanCode.id}/borrow`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book not available or book not found" });
        expect((await getBook(cleanCode.id)).available_copies).toBe(0);
    });

    test("[Borrow][negative] unknown id returns 400", async () => {
        const res = await request(app).post(`/api/books/${UNKNOWN_ID}/borrow`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book not available or book not found" });
    });

    test("[Borrow][concurrency] two simultaneous borrows of a single copy: one 200, one 400, final count 0", async () => {
        const responses = await Promise.all([
            request(app).post(`/api/books/${refactoring.id}/borrow`),
            request(app).post(`/api/books/${refactoring.id}/borrow`),
        ]);

        expect(responses.map((res) => res.status).sort()).toEqual([200, 400]);
        expect((await getBook(refactoring.id)).available_copies).toBe(0);
    });
});

describe("POST /api/books/:id/return", () => {
    test("[Return][positive] increments available_copies by exactly 1 in the database", async () => {
        const res = await request(app).post(`/api/books/${patterns.id}/return`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message: "Book returned successfully",
            book: { ...patterns, available_copies: 3 },
        });
        expect((await getBook(patterns.id)).available_copies).toBe(3);
    });

    test("[Return][negative] returning when already at total_copies returns 400 and does not exceed total", async () => {
        const res = await request(app).post(`/api/books/${pragmatic.id}/return`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book cannot be returned or book not found" });

        const row = await getBook(pragmatic.id);
        expect(row.available_copies).toBe(3);
        expect(row.available_copies).toBeLessThanOrEqual(row.total_copies);
    });

    test("[Return][negative] unknown id returns 400", async () => {
        const res = await request(app).post(`/api/books/${UNKNOWN_ID}/return`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Book cannot be returned or book not found" });
    });

    test("[Return][positive] borrow then return restores the original count", async () => {
        expect((await request(app).post(`/api/books/${pragmatic.id}/borrow`)).status).toBe(200);
        expect((await request(app).post(`/api/books/${pragmatic.id}/return`)).status).toBe(200);

        expect(await getBook(pragmatic.id)).toEqual(pragmatic);
    });
});

describe("Availability through the API", () => {
    const availableViaApi = async (id) => {
        const res = await request(app).get("/api/books");
        expect(res.status).toBe(200);
        return res.body.find((row) => row.id === id).available_copies;
    };

    test("[View availability][positive] list reflects the count after each borrow and return", async () => {
        expect(await availableViaApi(pragmatic.id)).toBe(3);

        await request(app).post(`/api/books/${pragmatic.id}/borrow`);
        expect(await availableViaApi(pragmatic.id)).toBe(2);

        await request(app).post(`/api/books/${pragmatic.id}/borrow`);
        expect(await availableViaApi(pragmatic.id)).toBe(1);

        await request(app).post(`/api/books/${pragmatic.id}/return`);
        expect(await availableViaApi(pragmatic.id)).toBe(2);

        expect((await getBook(pragmatic.id)).available_copies).toBe(2);
    });

    test("[View availability][positive] search result shows 0 for a book with no copies available", async () => {
        const res = await request(app).get("/api/books").query({ search: cleanCode.isbn });

        expect(res.body).toHaveLength(1);
        expect(res.body[0].available_copies).toBe(0);
        expect(res.body[0].total_copies).toBe(2);
    });
});

describe("Database constraints", () => {
    test.each([
        ["available_copies", 1, -1],
        ["total_copies", -1, 0],
    ])("[Database][negative] negative %s inserted directly is rejected by the CHECK constraint", async (_label, total, available) => {
        await expect(
            pool.query(
                `INSERT INTO books (title, author, isbn, total_copies, available_copies)
                 VALUES ('Bad', 'Row', '0000000000', $1, $2)`,
                [total, available]
            )
        ).rejects.toMatchObject({ code: "23514" });

        expect(await countBooks()).toBe(SEED_BOOKS.length);
    });

    test("[Database][negative] updating available_copies below 0 is rejected by the CHECK constraint", async () => {
        await expect(
            pool.query("UPDATE books SET available_copies = -1 WHERE id = $1", [cleanCode.id])
        ).rejects.toMatchObject({ code: "23514" });

        expect((await getBook(cleanCode.id)).available_copies).toBe(0);
    });
});

describe("Invalid ids", () => {
    test.each([
        ["Borrow", "abc/borrow", "post", {}],
        ["Borrow", "-1/borrow", "post", {}],
        ["Borrow", "1abc/borrow", "post", {}],
        ["Borrow", "99999999999/borrow", "post", {}],
        ["Return", "2147483648/return", "post", {}],
        ["Return", "abc/return", "post", {}],
        ["Delete book", "abc", "delete", ADMIN],
    ])("[%s][edge] /api/books/%s returns 400, not 500, and changes nothing", async (_story, path, method, headers) => {
        const res = await request(app)[method](`/api/books/${path}`).set(headers);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Invalid book id" });

        const list = await request(app).get("/api/books");
        expect(list.body).toEqual([pragmatic, cleanCode, refactoring, patterns]);
    });
});
