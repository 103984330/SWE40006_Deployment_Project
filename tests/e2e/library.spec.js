// End-to-end tests: drive the real UI in Chromium against the real app and PostgreSQL test database.
// Start the test DB first:  docker compose -f docker-compose.test.yml up -d --wait
// Playwright starts the app itself (webServer in playwright.config.js).
const { test, expect } = require("@playwright/test");
const { pool, resetDb, seedBooks, getBook, countBooks } = require("../helpers/db");

// Seeded rows, refreshed before every test:
// pragmatic 3/3, cleanCode 0/2 (none available), refactoring 1/1 (single copy), patterns 2/4
let pragmatic, cleanCode, refactoring, patterns;

const cards = (page) => page.locator("#booksList > div");
const card = (page, book) => cards(page).filter({ hasText: `ISBN: ${book.isbn}` });
const availability = (available, total) => new RegExp(`Available:\\s*${available} / ${total}`);

// Clicks something that triggers alert()/confirm(), returns the dialog message and answers it.
// The handler is registered before the click: confirm() opens synchronously inside the click,
// and click() does not resolve until the dialog is answered.
async function clickExpectingDialog(page, locator, { accept = true } = {}) {
    const handled = new Promise((resolve) => {
        page.once("dialog", async (dialog) => {
            const message = dialog.message();
            await (accept ? dialog.accept() : dialog.dismiss());
            resolve(message);
        });
    });
    await locator.click();
    return handled;
}

async function switchRole(page, role) {
    await page.selectOption("#roleSelect", role);
}

test.beforeEach(async ({ page }) => {
    await resetDb();
    [pragmatic, cleanCode, refactoring, patterns] = await seedBooks();

    await page.goto("/");
    await expect(cards(page)).toHaveCount(4);
});

test.afterAll(async () => {
    await pool.end();
});

test.describe("Search", () => {
    test("[Search][positive] page lists all books in id order", async ({ page }) => {
        await expect(cards(page).locator("h3")).toHaveText([
            pragmatic.title,
            cleanCode.title,
            refactoring.title,
            patterns.title,
        ]);
    });

    test("[Search][positive] case-insensitive partial author search shows only matching books", async ({ page }) => {
        await page.fill("#searchInput", "fOwLeR");
        await page.click("#searchButton");

        await expect(cards(page)).toHaveCount(1);
        await expect(card(page, refactoring)).toBeVisible();
    });

    test("[Search][positive] partial ISBN search shows the matching book", async ({ page }) => {
        await page.fill("#searchInput", "2350884");
        await page.click("#searchButton");

        await expect(cards(page)).toHaveCount(1);
        await expect(card(page, cleanCode)).toBeVisible();
    });

    test("[Search][negative] no match shows 'No books found.'", async ({ page }) => {
        await page.fill("#searchInput", "zzz-no-such-book");
        await page.click("#searchButton");

        await expect(cards(page)).toHaveCount(0);
        await expect(page.locator("#booksList")).toHaveText("No books found.");
    });

    test("[Search][positive] clearing the search shows every book again", async ({ page }) => {
        await page.fill("#searchInput", "clean");
        await page.click("#searchButton");
        await expect(cards(page)).toHaveCount(1);

        await page.fill("#searchInput", "");
        await page.click("#searchButton");
        await expect(cards(page)).toHaveCount(4);
    });
});

test.describe("View availability", () => {
    test("[View availability][positive] each book shows available / total copies", async ({ page }) => {
        await expect(card(page, pragmatic)).toContainText(availability(3, 3));
        await expect(card(page, cleanCode)).toContainText(availability(0, 2));
        await expect(card(page, refactoring)).toContainText(availability(1, 1));
        await expect(card(page, patterns)).toContainText(availability(2, 4));
    });

    test("[View availability][positive] Borrow is disabled only for a book with 0 copies", async ({ page }) => {
        await expect(card(page, cleanCode).getByRole("button", { name: "Borrow" })).toBeDisabled();
        await expect(card(page, pragmatic).getByRole("button", { name: "Borrow" })).toBeEnabled();
    });
});

test.describe("Borrow", () => {
    test("[Borrow][positive] borrowing updates the displayed count and the database", async ({ page }) => {
        await card(page, pragmatic).getByRole("button", { name: "Borrow" }).click();

        await expect(card(page, pragmatic)).toContainText(availability(2, 3));
        expect((await getBook(pragmatic.id)).available_copies).toBe(2);
    });

    test("[Borrow][positive] borrowing the last copy disables the Borrow button", async ({ page }) => {
        const borrow = card(page, refactoring).getByRole("button", { name: "Borrow" });
        await borrow.click();

        await expect(card(page, refactoring)).toContainText(availability(0, 1));
        await expect(borrow).toBeDisabled();
        expect((await getBook(refactoring.id)).available_copies).toBe(0);
    });

    test("[Borrow][negative] borrowing from a stale page after the last copy is gone shows an alert", async ({ page }) => {
        // Someone else takes the last copy after this page loaded
        await pool.query("UPDATE books SET available_copies = 0 WHERE id = $1", [refactoring.id]);

        const message = await clickExpectingDialog(
            page,
            card(page, refactoring).getByRole("button", { name: "Borrow" })
        );

        expect(message).toBe("Book not available or book not found");
        expect((await getBook(refactoring.id)).available_copies).toBe(0);
    });
});

test.describe("Return", () => {
    test("[Return][positive] returning updates the displayed count and the database", async ({ page }) => {
        await card(page, patterns).getByRole("button", { name: "Return" }).click();

        await expect(card(page, patterns)).toContainText(availability(3, 4));
        expect((await getBook(patterns.id)).available_copies).toBe(3);
    });

    test("[Return][negative] returning a book with all copies in shows an alert and changes nothing", async ({ page }) => {
        const message = await clickExpectingDialog(
            page,
            card(page, pragmatic).getByRole("button", { name: "Return" })
        );

        expect(message).toBe("Book cannot be returned or book not found");
        await expect(card(page, pragmatic)).toContainText(availability(3, 3));
        expect((await getBook(pragmatic.id)).available_copies).toBe(3);
    });

    test("[Return][positive] borrow then return restores the original count", async ({ page }) => {
        await card(page, pragmatic).getByRole("button", { name: "Borrow" }).click();
        await expect(card(page, pragmatic)).toContainText(availability(2, 3));

        await card(page, pragmatic).getByRole("button", { name: "Return" }).click();
        await expect(card(page, pragmatic)).toContainText(availability(3, 3));

        expect(await getBook(pragmatic.id)).toEqual(pragmatic);
    });
});

test.describe("Add book", () => {
    const NEW_BOOK = { title: "Continuous Delivery", author: "Jez Humble", isbn: "9780321601919" };

    async function fillAddForm(page, book, copies) {
        await page.fill("#titleInput", book.title);
        await page.fill("#authorInput", book.author);
        await page.fill("#isbnInput", book.isbn);
        await page.fill("#copiesInput", String(copies));
    }

    test("[Add book][positive] admin adds a book; it appears in the list and the database", async ({ page }) => {
        await switchRole(page, "admin");
        await fillAddForm(page, NEW_BOOK, 5);
        await page.getByRole("button", { name: "Add Book" }).click();

        await expect(cards(page)).toHaveCount(5);
        await expect(card(page, NEW_BOOK)).toContainText(NEW_BOOK.title);
        await expect(card(page, NEW_BOOK)).toContainText(availability(5, 5));

        // The form resets, with copies back to 1
        await expect(page.locator("#titleInput")).toHaveValue("");
        await expect(page.locator("#copiesInput")).toHaveValue("1");

        expect(await countBooks(NEW_BOOK.isbn)).toBe(1);
    });

    test("[Add book][security] HTML in book fields is shown as text, not executed (no stored XSS)", async ({ page }) => {
        const payload = `<img src=x onerror="window.__xss = true">`;

        await switchRole(page, "admin");
        await fillAddForm(page, { title: payload, author: `<b>bold</b>`, isbn: "XSS-0001" }, 1);
        await page.getByRole("button", { name: "Add Book" }).click();

        const xssCard = cards(page).filter({ hasText: "ISBN: XSS-0001" });
        await expect(xssCard.locator("h3")).toHaveText(payload);
        await expect(xssCard).toContainText("Author: <b>bold</b>");
        await expect(page.locator("#booksList img, #booksList b")).toHaveCount(0);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();

        // Reload, as another visitor would see it
        await page.reload();
        await expect(cards(page)).toHaveCount(5);
        await expect(page.locator("#booksList img, #booksList b")).toHaveCount(0);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });

    test("[Add book][negative] duplicate ISBN shows an alert and adds nothing", async ({ page }) => {
        await switchRole(page, "admin");
        await fillAddForm(page, { title: "Another Title", author: "Someone", isbn: pragmatic.isbn }, 1);

        const message = await clickExpectingDialog(page, page.getByRole("button", { name: "Add Book" }));

        expect(message).toBe("A book with this ISBN already exists");
        await expect(cards(page)).toHaveCount(4);
        expect(await countBooks(pragmatic.isbn)).toBe(1);
    });
});

test.describe("Delete book", () => {
    test("[Delete book][positive] admin confirms delete; the book disappears from the list and the database", async ({ page }) => {
        await switchRole(page, "admin");

        const message = await clickExpectingDialog(
            page,
            card(page, patterns).getByRole("button", { name: "Delete" })
        );

        expect(message).toBe("Are you sure you want to delete this book?");
        await expect(cards(page)).toHaveCount(3);
        await expect(card(page, patterns)).toHaveCount(0);
        expect(await getBook(patterns.id)).toBeUndefined();
    });

    test("[Delete book][negative] cancelling the confirm keeps the book", async ({ page }) => {
        await switchRole(page, "admin");

        await clickExpectingDialog(
            page,
            card(page, patterns).getByRole("button", { name: "Delete" }),
            { accept: false }
        );

        await expect(cards(page)).toHaveCount(4);
        expect(await getBook(patterns.id)).toEqual(patterns);
    });
});

test.describe("Access control", () => {
    test("[Access control][positive] customer sees no Add form and no Delete buttons", async ({ page }) => {
        await expect(page.locator("#roleSelect")).toHaveValue("customer");
        await expect(page.locator("#adminSection")).toBeHidden();
        await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    });

    test("[Access control][positive] switching to admin and back toggles the admin controls", async ({ page }) => {
        await switchRole(page, "admin");
        await expect(page.locator("#adminSection")).toBeVisible();
        await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(4);

        await switchRole(page, "customer");
        await expect(page.locator("#adminSection")).toBeHidden();
        await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    });
});
