// Database helpers for the integration tests.
// Uses the app's own pool (src/db.js), so the tests and the API share one connection pool
// and a single pool.end() in afterAll lets Jest exit cleanly.
const pool = require("../../src/db");

// Known rows, inserted in this order, so ids are 1..4 after RESTART IDENTITY
const SEED_BOOKS = [
    { title: "The Pragmatic Programmer", author: "Andrew Hunt", isbn: "9780135957059", total_copies: 3, available_copies: 3 },
    { title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", total_copies: 2, available_copies: 0 },
    { title: "Refactoring", author: "Martin Fowler", isbn: "9780134757599", total_copies: 1, available_copies: 1 },
    { title: "Design Patterns", author: "Erich Gamma", isbn: "9780201633610", total_copies: 4, available_copies: 2 },
];

async function resetDb() {
    await pool.query("TRUNCATE books RESTART IDENTITY");
}

// Returns the inserted rows, in insertion (id) order
async function seedBooks() {
    const rows = [];

    for (const book of SEED_BOOKS) {
        const result = await pool.query(
            `INSERT INTO books (title, author, isbn, total_copies, available_copies)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [book.title, book.author, book.isbn, book.total_copies, book.available_copies]
        );
        rows.push(result.rows[0]);
    }

    return rows;
}

async function getBook(id) {
    const result = await pool.query("SELECT * FROM books WHERE id = $1", [id]);
    return result.rows[0];
}

async function countBooks(isbn) {
    const result = isbn === undefined
        ? await pool.query("SELECT COUNT(*)::int AS n FROM books")
        : await pool.query("SELECT COUNT(*)::int AS n FROM books WHERE isbn = $1", [isbn]);
    return result.rows[0].n;
}

module.exports = { pool, SEED_BOOKS, resetDb, seedBooks, getBook, countBooks };
