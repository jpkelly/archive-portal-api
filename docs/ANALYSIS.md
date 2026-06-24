
# Archive Portal — Analysis & Observations

> **Status: several items resolved as of 2026-06-23.** See resolution notes under each
> item below. Line references are approximate and may drift as the code evolves; use the
> function names as the durable anchor. See [`PLAN.md`](./PLAN.md) for the current roadmap.

This is a read-only assessment of the codebase as of commit `1af9235`. The system is
deployed and working; these are items to consider when next editing the relevant areas,
ranked roughly by impact.

## Overall assessment

A mature, working Plesk → S3 email archiver with a coherent lifecycle
(archive → verify → delete → ingest/browse). Notable strengths:

- **Deletion is gated on S3 verification** (`deletion_status` stays `blocked` until an
  `aws s3 ls` confirms the object). This is the right safety discipline for a tool that
  deletes mail.
- **Input validation** in the shell script (regex on domain/user/dates) closes the obvious
  shell-injection holes.
- **`job_id` guards** prevent a stale async job from overwriting newer state.
- Bounded concurrency on bulk archiving; per-archive checksums + manifests; idempotent
  DB upserts; S3 orphan detection/prune.

## Observations / potential issues (ranked)

### 1. Delete re-derives the file set instead of using the verified manifest
**Where:** `scripts/archive_account_maintenance.sh` — the selection `find` (~L54–58) is run
independently by both the `archive` and `delete` branches; delete branch ~L121–141.
`delete-messages` route: `src/routes/domains.js` (~L1253).

**Issue:** `archive` selects files by **mtime** at time T1, tars them, and uploads.
`delete` later re-runs the same `find` at time T2 and removes whatever matches *then* — it
does not delete the exact paths recorded in the manifest that was verified in S3. If any
file in that mtime window changed between archive and delete (new mail, moves, re-delivery),
the deleted set can differ from the archived/verified set.

**Why it matters:** The whole safety premise is "safe to delete because it's backed up."
Deleting a set that may not match the verified archive undercuts that premise.

**Direction:** Delete exactly the paths in the verified manifest (download/keep the
`.manifest.txt` path list and delete from it), rather than a fresh `find`.

**✅ Resolved:** The `delete` command now reads paths from the verified manifest file
(`manifest_source`), not from a fresh `find`. See the `delete` branch in
`scripts/archive_account_maintenance.sh`.

### 2. BSD/macOS-only commands in a script that runs on Linux (CentOS)
**Where:** `scripts/archive_account_maintenance.sh:90` `stat -f '%z'`, and `:91` `sha256 -q`.

**Issue:** On GNU/Linux these are `stat -c '%s'` and `sha256sum`. `stat -f` reports
filesystem info (not file size) on coreutils, and `sha256` does not exist. Because the
script uses `set -u` but **not** `set -e` (L2–3), these failures are silent: `ARCHIVE_BYTES`
ends up wrong/empty and the `.sha256` file is empty — while the tarball still uploads and the
job reports success.

**Why it matters:** Checksums (integrity verification) and reported archive sizes are likely
not what they claim. Worth inspecting a real run's `.sha256` and manifest `archive_bytes`.

**Direction:** Use GNU equivalents; consider `set -e` (or explicit error checks) so a failed
checksum aborts rather than silently producing an empty file.

**✅ Resolved:** The script now uses `stat -c '%s'` and `sha256sum` (GNU/Linux).
Explicit error checks were added: the script verifies the checksum regex and file
size before proceeding, failing fast if either is invalid.

### 3. Discover only scans the single latest archive run
**Where:** `getLatestArchiveTimestamp()` in `src/routes/domains.js` (~L257–273), used by
`findAccountArchivePath` (~L329), `discover` (~L1340), and `discover-all` (~L496).

**Issue:** It takes only the most recent `archive/<timestamp>/` prefix. Archives created in
earlier runs (different timestamps) are invisible to discover/ingest.

**Why it matters:** If archiving happened across multiple days/runs, older archives won't be
found or re-registered.

**Direction:** Scan all timestamp prefixes (or the newest *per account*), not just the
single latest run.

**✅ Resolved:** `listArchiveTimestamps()` returns all archive run timestamps sorted
newest-first. `findAccountArchivePath`, `discover`, and `discover-all` now iterate
timestamps (capped at the 20 newest runs to bound S3 API calls).
`getLatestArchiveTimestamp()` is preserved as a wrapper returning `timestamps[0]`.

### 4. Logout resets usage stats globally for admins
**Where:** `resetUsageStatsForUser` in `src/routes/auth.js` (L17–42); called by `logout`
(~L130) and `reset-usage` (~L150).

**Issue:** For an `admin`, this runs `UPDATE folders ... SET message_count=0` and
`UPDATE mail_accounts ... SET message_count=0, folder_count=0, last_indexed_at=NULL` across
**all** rows. So an admin logging out (or any reset-usage call) zeroes everyone's indexed
counts.

**Why it matters:** Looks unintended; wipes browse/usage stats on a routine action.

**Direction:** Confirm intent. If the goal is per-session cache cleanup, scope it to temp
artifacts rather than the persistent stats columns.

**✅ Resolved:** The logout handler no longer calls `resetUsageStatsForUser`; it only
purges the temp archive cache (`removeDirRecursive`). The explicit `reset-usage`
routes are unchanged and still available as a deliberate admin action.

### 5. Smaller hardening items
- **Open CORS:** `src/app.js:16` `app.use(cors())` allows any origin.
  **✅ Resolved:** CORS is now restricted to origins in the `CORS_ORIGINS` env var
  (default: `https://archive.smallgod.net`).
- **No login rate limiting:** `POST /auth/login` (`src/routes/auth.js:59`).
  **✅ Resolved:** In-memory fixed-window rate limiter added: 10 attempts per 15 min
  per ip+email pair; returns 429 when exceeded; counter cleared on success.
- **String-built SQL in ingest:** `scripts/ingest_worker.py` `build_sql` (~L194–267) uses
  hand-rolled escaping (`esc`, L45) piped to `plesk db`. Prefer parameterized queries where
  feasible. *(Still open — deferred; requires runtime/credentials changes best validated on
  the production server.)*
- **Node 12 is EOL:** runtime is years past end-of-life; a managed Node upgrade path is worth
  planning. *(Still open.)*

## Enhancement opportunities

- **Disk-usage reporting** — ✅ **Shipped.** The `report` command in
  `scripts/archive_account_maintenance.sh` does a single `find -printf '%s\t%T@'` pass
  with one `awk` for all aggregates (totals, age buckets, reclaimable). A `mail_usage`
  table (`migrations/003_mail_usage.sql`) persists results. The frontend shows a sortable
  usage table with per-mailbox size, age breakdown, and reclaimable-before-date projections.
- **Restore flow** — the catalog (`mail_account_archives`) + S3 tarballs make a one-click
  restore (pull tarball, re-deliver to maildir) feasible; not currently exposed. *(Still open.)*
