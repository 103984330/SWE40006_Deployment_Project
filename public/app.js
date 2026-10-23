const booksList = document.getElementById("booksList");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");

const roleSelect = document.getElementById("roleSelect");
const adminSection = document.getElementById("adminSection");

const addBookForm = document.getElementById("addBookForm");
const titleInput = document.getElementById("titleInput");
const authorInput = document.getElementById("authorInput");
const isbnInput = document.getElementById("isbnInput");
const copiesInput = document.getElementById("copiesInput");


function updateRoleUI() {
    const role = roleSelect.value;

    if (role === "admin") {
        adminSection.style.display = "block";
    } else {
        adminSection.style.display = "none";
    }

    loadBooks(searchInput.value.trim());
}


async function loadBooks(search = "") {
    try {
        let url = "/api/books";

        if (search) {
            url += `?search=${encodeURIComponent(search)}`;
        }

        const response = await fetch(url);
        const books = await response.json();

        displayBooks(books);

    } catch (error) {
        console.error("Failed to load books:", error);

        booksList.innerHTML = "<p>Failed to load books.</p>";
    }
}


// Escape user-supplied text before it goes into innerHTML (prevents stored XSS)
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


function displayBooks(books) {
    booksList.innerHTML = "";

    if (books.length === 0) {
        booksList.innerHTML = "<p>No books found.</p>";
        return;
    }

    books.forEach(book => {
        const bookElement = document.createElement("div");

        let deleteButton = "";

        if (roleSelect.value === "admin") {
            deleteButton = `
                <button onclick="deleteBook(${book.id})">
                    Delete
                </button>
            `;
        }

        bookElement.innerHTML = `
            <h3>${escapeHtml(book.title)}</h3>

            <p>Author: ${escapeHtml(book.author)}</p>

            <p>ISBN: ${escapeHtml(book.isbn)}</p>

            <p>
                Available:
                ${book.available_copies} / ${book.total_copies}
            </p>

            <button
                onclick="borrowBook(${book.id})"
                ${book.available_copies === 0 ? "disabled" : ""}
            >
                Borrow
            </button>

            <button onclick="returnBook(${book.id})">
                Return
            </button>

            ${deleteButton}

            <hr>
        `;

        booksList.appendChild(bookElement);
    });
}


async function borrowBook(id) {
    try {
        const response = await fetch(
            `/api/books/${id}/borrow`,
            {
                method: "POST" // ahhh, that was the error :)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.error);
            return;
        }

        loadBooks(searchInput.value.trim());

    } catch (error) {
        console.error(
            "Failed to borrow book:",
            error
        );
    }
}


async function returnBook(id) {
    try {
        const response = await fetch(
            `/api/books/${id}/return`,
            {
                method: "POST"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.error);
            return;
        }

        loadBooks(searchInput.value.trim());

    } catch (error) {
        console.error(
            "Failed to return book:",
            error
        );
    }
}


async function deleteBook(id) {
    const confirmed = confirm(
        "Are you sure you want to delete this book?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `/api/books/${id}`,
            {
                method: "DELETE",

                headers: {
                    "x-user-role": roleSelect.value
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            alert(result.error);
            return;
        }

        loadBooks(searchInput.value.trim());

    } catch (error) {
        console.error(
            "Failed to delete book:",
            error
        );
    }
}


addBookForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const book = {
            title: titleInput.value.trim(),
            author: authorInput.value.trim(),
            isbn: isbnInput.value.trim(),
            total_copies: Number(
                copiesInput.value
            )
        };

        try {
            const response = await fetch(
                "/api/books",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "x-user-role":
                            roleSelect.value
                    },

                    body: JSON.stringify(book)
                }
            );

            const result =
                await response.json();

            if (!response.ok) {
                alert(result.error);
                return;
            }

            addBookForm.reset();
            copiesInput.value = 1;

            loadBooks();

        } catch (error) {
            console.error(
                "Failed to add book:",
                error
            );
        }
    }
);


searchButton.addEventListener(
    "click",
    () => {

        loadBooks(
            searchInput.value.trim()
        );
    }
);


roleSelect.addEventListener(
    "change",
    updateRoleUI
);


updateRoleUI();