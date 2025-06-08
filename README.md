# WBS Management Demo

This is a simple WBS management application built with Node.js, PostgreSQL and vanilla HTML/JS/CSS.

## Setup

1. Install dependencies

```bash
npm install
```

2. Make sure PostgreSQL is running and the `wbs` database exists. You can create it with:

```bash
createdb wbs
```

3. Start the server

```bash
DATABASE_URL=postgres://user:password@localhost:5432/wbs \
JWT_SECRET=mysecret npm start
```

The `DATABASE_URL` environment variable must include the username and password matching your local database credentials and point to the `wbs` database. `JWT_SECRET` is used to sign authentication tokens.

The application will run on [http://localhost:3000](http://localhost:3000).

## Authentication

Use the following endpoints to manage users and tokens:

* `POST /auth/register` – create a new user with `username` and `password`.
* `POST /auth/login` – obtain an access token and refresh token.
* `POST /auth/refresh` – exchange a refresh token for a new access token.
* `POST /auth/logout` – revoke a refresh token.

Include the access token as a Bearer token in the `Authorization` header when modifying tasks.

After registering or logging in, store the returned `accessToken` in the browser using:

```javascript
localStorage.setItem('accessToken', '<token>');
```

Once saved, load the UI (open `index.html`) and the application will automatically send the token in the `Authorization` header for task operations.
