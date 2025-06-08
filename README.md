# WBS Management Demo

This is a simple WBS management application built with Node.js, PostgreSQL and vanilla HTML/JS/CSS.

## Setup

1. Install dependencies

```bash
npm install
```

2. Start the server

```bash
DATABASE_URL=postgres://user:password@localhost:5432/wbs \
JWT_SECRET=mysecret npm start
```

The `DATABASE_URL` environment variable should point to your PostgreSQL instance. `JWT_SECRET` is used to sign authentication tokens.

The application will run on [http://localhost:3000](http://localhost:3000).

## Authentication

Use the following endpoints to manage users and tokens:

* `POST /auth/register` – create a new user with `username` and `password`.
* `POST /auth/login` – obtain an access token and refresh token.
* `POST /auth/refresh` – exchange a refresh token for a new access token.
* `POST /auth/logout` – revoke a refresh token.

Include the access token as a Bearer token in the `Authorization` header when modifying tasks.
