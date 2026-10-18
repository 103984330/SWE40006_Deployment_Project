const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { search } = req.query;

        let result;

        if (search) {
            result = await pool.query(
                `SELECT *
                 FROM books
                 WHERE title ILIKE $1
                    OR author ILIKE $1
                    OR isbn ILIKE $1
                 ORDER BY id`,
                [`%${search}%`]
            );
        } else {
            result = await pool.query(
                "SELECT * FROM books ORDER BY id"
            );
        }

        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Failed to retrieve books:", error.message);

        res.status(500).json({
            error: "Failed to retrieve books"
        });
    }
});

router.post("/", async (req, res) => {
    try {
        const {
            title,
            author,
            isbn,
            total_copies = 1
        } = req.body;

        if (!title || !author || !isbn) {
            return res.status(400).json({
                error: "title, author and isbn are required"
            });
        }

        if (!Number.isInteger(total_copies) || total_copies < 0) {
            return res.status(400).json({
                error: "total_copies must be a non-negative integer"
            });
        }

        const result = await pool.query(
            `INSERT INTO books
                (title, author, isbn, total_copies, available_copies)
             VALUES ($1, $2, $3, $4, $4)
             RETURNING *`,
            [title, author, isbn, total_copies]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Failed to add book:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "A book with this ISBN already exists"
            });
        }

        res.status(500).json({
            error: "Failed to add book"
        });
    }
});


router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM books WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Book not found"
            });
        }

        res.status(200).json({
            message: "Book deleted successfully",
            book: result.rows[0]
        });

    } catch (error) {
        console.error("Failed to delete book:", error.message);

        res.status(500).json({
            error: "Failed to delete book"
        });
    }
});


router.post("/:id/borrow", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE books
             SET available_copies = available_copies - 1
             WHERE id = $1
               AND available_copies > 0
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: "Book not available or book not found"
            });
        }

        res.status(200).json({
            message: "Book borrowed successfully",
            book: result.rows[0]
        });
    } catch (error) {
        console.error("Failed to borrow book:", error.message);

        res.status(500).json({
            error: "Failed to borrow book"
        });
    }
});

router.post("/:id/return", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE books
             SET available_copies = available_copies + 1
             WHERE id = $1
               AND available_copies < total_copies
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: "Book cannot be returned or book not found"
            });
        }

        res.status(200).json({
            message: "Book returned successfully",
            book: result.rows[0]
        });
    } catch (error) {
        console.error("Failed to return book:", error.message);

        res.status(500).json({
            error: "Failed to return book"
        });
    }
});

module.exports = router;