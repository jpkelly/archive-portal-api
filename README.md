# Archive Portal API (v1 scaffold)

This service is the backend API for browsing archived email data stored in the `mail_archive` database.

## What is implemented

- JWT login endpoint (`POST /auth/login`)
- current user endpoint (`GET /auth/me`)
- domain list endpoint (`GET /domains`)
- accounts by domain (`GET /domains/:domainId/accounts`)
- folders by account (`GET /domains/:domainId/accounts/:accountId/folders`)
- messages by folder (`GET /messages/folders/:folderId/messages`)
- message detail (`GET /messages/:messageId`)
- health check (`GET /health`)

## Setup

1. Copy `.env.example` to `.env`.
2. Set DB credentials and JWT secret.
3. Install dependencies:

   npm install

4. Start the API:

   npm start

The API listens on `PORT` (default `8080`).

## First admin user

Create a password hash (run in this folder):

```bash
node -e "console.log(require('bcryptjs').hashSync('change-me', 12))"
```

Insert the user in MariaDB (replace values):

```sql
INSERT INTO users (id, email, password_hash, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@smallgod.net', '$2a$12$replace_this_hash', 'admin');
```

## Notes

- This scaffold is read-only for archive browsing.
- Ingestion worker is not implemented yet.
- New records should include UUID strings in `id` columns from the app/worker.

## Operations

- Server access, deployment, PM2 restart, and resume workflow are documented in `SERVER_ACCESS_AND_DEPLOY_RUNBOOK.md`.
