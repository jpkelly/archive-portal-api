# Copilot instructions — Archive Portal

> The fuller reference is [`CLAUDE.md`](../CLAUDE.md) at the repo root, and operational
> procedures are in [`SERVER_ACCESS_AND_DEPLOY_RUNBOOK.md`](../SERVER_ACCESS_AND_DEPLOY_RUNBOOK.md).
> This file is the short version so Copilot has the same project knowledge as Claude Code.

## What this project is

A Plesk → S3 email archiving system with a browsing UI. It reclaims disk space on a Plesk
mail server by moving old mail off the live store into compressed S3 archives — while
keeping that mail verifiable, restorable, and browsable. Deployed at `archive.smallgod.net`;
S3 bucket `s3://smallgod-mail-archive`.

## Architecture

- **API:** Node.js / Express in `src/`. Runs under Plesk's bundled **Node 12** via PM2.
- **DB:** MySQL/MariaDB schema `mail_archive`, via `mysql2` pool (`src/db.js`); some calls
  shell out to `sudo plesk db` for the `psa` (Plesk) database.
- **Auth:** JWT bearer tokens + bcrypt; roles `admin` / `domain_admin` + per-domain membership.
- **Frontend:** static vanilla-JS SPA in `public/` (no build step).
- **Scripts (`scripts/`):** `archive_account_maintenance.sh` (archive/delete engine),
  `ingest_worker.py` (S3 tarball → DB), `sync_primary_emails.py`.

## Archive lifecycle

archive → **verify the S3 object exists** → delete from maildir (only if verified) →
ingest into the DB for browsing. Deletion is intentionally gated on S3 verification.

## Rules & gotchas

- **Don't loosen the verify-before-delete gate.**
- **Target Node 12 syntax/deps** (runtime is EOL).
- **Server is Linux (CentOS):** shell scripts use GNU coreutils (`date -d`, `stat -c '%s'`,
  `sha256sum`) — not BSD/macOS variants.
- The bash script communicates with the API via a `KEY=VALUE` stdout contract; if you change
  script output, update the parser in `src/routes/domains.js` in the same change.
- Async archive jobs guard on `job_id` so a stale job can't overwrite newer state — keep it.
- IDs are UUID strings (`UUID()` / `uuid.uuid4()`), not auto-increment.
- The archive/delete/ingest paths only work **on the Plesk server** (need maildir access,
  `sudo`, `aws` CLI, `plesk db`). Locally you can run auth/DB/browse routes only.
- Prefer parameterized `mysql2` queries (`?`) over string-built SQL.
