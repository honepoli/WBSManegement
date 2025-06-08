# WBS Management Demo

This is a simple WBS management application built with Node.js, SQLite and vanilla HTML/JS/CSS.

## Setup

1. Install dependencies

```bash
npm install
```

2. The application uses a local SQLite database file named `wbs.db`. It will be created automatically on first run, so no additional setup is required.

3. Start the server

```bash
JWT_SECRET=mysecret npm start
```

`JWT_SECRET` is used to sign authentication tokens.

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
