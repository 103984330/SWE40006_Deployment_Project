# SWE40006 Deployment Project

Library Catalogue web application developed for SWE40006 Software Deployment and Evolution.

## Features

- Search books by title, author or ISBN
- View book availability
- Borrow and return books
- Administrator can add and delete books
- Basic Customer / Administrator role-based access control

## Tech Stack

- Node.js
- Express
- PostgreSQL
- HTML / JavaScript

## Local Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file based on `.env.example` before starting the application.

Start the application:

```bash
npm run dev
```

Open:

[http://localhost:3000](http://localhost:3000)

Database schema:

`db/schema.sql`