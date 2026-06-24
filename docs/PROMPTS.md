# Implementation Prompts

LLM-ready prompts for the first 3 items in `PLAN.md`. Use alongside `CLAUDE.md`, `ANALYSIS.md`, 
and `PLAN.md` when submitting to models like Kimi or DeepSeek.

---

## Prompt 1: Delete from verified manifest, not fresh find

```
You are implementing a bug fix for an email archival system (Archive Portal).

**Current behavior:** When deleting archived emails, the delete operation re-runs the same 
`find` command that was used during the archive operation, but at a later time. If any files 
in that mtime window changed between archive and delete (new mail, moves, re-delivery), the 
deleted set may differ from the archived/verified set.

**Why it matters:** The safety premise is "safe to delete because it's backed up in S3." 
Deleting a different set than what was verified in S3 undermines this guarantee.

**Required change:** Instead of re-deriving the file set, delete exactly the paths recorded 
in the verified manifest (`.manifest.txt`) that was uploaded to S3 during archiving.

**Technical context:**
- The manifest is currently generated and uploaded to S3 but not parsed during deletion
- Current selection happens in `scripts/archive_account_maintenance.sh` (lines ~54–58 for archive, 
  ~121–141 for delete)
- Delete is triggered via `POST /domains/:d/accounts/:a/archive/delete-messages` route 
  (`src/routes/domains.js` ~L1253)
- The script emits a `KEY=VALUE` stdout contract that the API parses
- The `mail_account_archives` table tracks the S3 URI and deletion status

**Implementation approach:**
1. During deletion, download the `.manifest.txt` file from S3 (the verified path list)
2. Modify the delete branch to read and delete only those paths instead of a fresh `find`
3. Preserve the existing output contract and safety gates (S3 verification still blocks deletion)
4. Add error handling if the manifest cannot be downloaded
5. Update `src/routes/domains.js` parser if the script output changes

**Acceptance criteria:**
- Delete removes only the exact paths from the verified manifest
- If manifest cannot be retrieved, deletion fails safely (error message emitted)
- Existing safety gates (verification must pass before deletion) remain intact
- Script output contract is updated in both script and parser if needed
```

---

## Prompt 2: Fix BSD-isms and add error checks

```
You are fixing a compatibility and robustness issue in the email archival system's core script.

**Current problem:** The script `scripts/archive_account_maintenance.sh` uses macOS-only commands 
that don't work on Linux/CentOS (the actual production server):
- Line ~90: `stat -f '%z'` (macOS) should be `stat -c '%s'` (GNU/Linux) for file size
- Line ~91: `sha256 -q` (macOS) should be `sha256sum` (GNU/Linux)

**Why it matters:** On Linux, these commands either fail silently or produce wrong output. The 
script uses `set -u` but not `set -e`, so failures don't abort. This means:
- `ARCHIVE_BYTES` ends up empty or wrong
- `.sha256` checksums are empty or invalid
- The job reports "success" even though checksums/sizes are corrupted

**Required changes:**
1. Replace BSD commands with GNU equivalents (stat and sha256sum)
2. Add error handling so the script fails fast if these operations fail
3. Ensure all output values (`ARCHIVE_BYTES`, checksum, etc.) are validated before the script succeeds

**Technical context:**
- The script runs on CentOS (Linux with GNU coreutils)
- It uses `set -u` (error on undefined vars) but currently lacks `set -e` (error on command failure)
- Output is a `KEY=VALUE` stdout contract parsed by `src/routes/domains.js`
- Checksums and byte counts are stored in `.sha256` files and the manifest uploaded to S3

**Implementation approach:**
1. Update line ~90 from `stat -f '%z'` to `stat -c '%s'`
2. Update line ~91 from `sha256 -q` to `sha256sum`
3. Consider adding `set -e` OR explicit error checks after each command
4. Validate that `ARCHIVE_BYTES` and checksum output are non-empty before finishing
5. Update any comments that reference BSD behavior

**Acceptance criteria:**
- Script runs successfully on GNU/Linux with correct file sizes and checksums
- If a stat or sha256 command fails, the script aborts with an error message
- `.sha256` file contains a valid SHA256 checksum (not empty)
- `ARCHIVE_BYTES` in output is a valid number (not empty)
- Existing validation (domain/user/date regex) and functionality (tar/upload/delete) unchanged
```

---

## Prompt 3: Disk-usage reporting

```
You are implementing a disk-usage reporting feature for an email archival system.

**Goal:** Let admins see which mailboxes/domains consume the most space and how much would be 
reclaimed by archiving everything older than a chosen date. This turns "the server is full" 
into "these N mailboxes hold most of it, and X GB is older than Y."

**Key insight (low risk):** The archive script already computes `SOURCE_BYTES` and `FILE_COUNT` 
for a date range using `find ... -printf '%s\t%p'`. A read-only reporting mode reuses that exact 
selection logic without tar/upload/delete, so projected reclaim matches what a real archive would move.

**Complete implementation plan:**

### Step 1: Add a `report` command to `scripts/archive_account_maintenance.sh`
- Signature: `archive_account_maintenance.sh report <domain> <user> <from_date> <to_date> [mode]`
- Reuse the existing `find` to sum bytes/counts (no tar, no upload, no delete)
- Optionally emit age buckets via a second `find -printf '%T@ %s\n'` aggregated into buckets like 
  `>3y`, `1–3y`, `<1y`
- Emit the established `KEY=VALUE` contract, e.g. `TOTAL_BYTES`, `TOTAL_FILES`, 
  `BUCKET_GT3Y_BYTES`, `RECLAIMABLE_BEFORE_<date>_BYTES`
- Must be strictly read-only; never tar/upload/delete

### Step 2: Add read-only API endpoints
In `src/routes/domains.js`, add admin-gated endpoints mirroring existing patterns:
- `GET /domains/:domainId/usage` — per-account size, message count, age-bucket breakdown
- `GET /usage` — all domains with per-domain rollups, sorted by size (largest first)
- Run the scan **asynchronously** (like existing archive jobs using `setImmediate` + child process)
  and persist results so the UI reads cached numbers

### Step 3: Persist usage results
Choose one approach:
- **Option A:** Add nullable columns to `mail_accounts` table: `disk_bytes`, `disk_scanned_at`, 
  plus bucket columns (e.g., `disk_bytes_gt3y`, `disk_bytes_1y_to_3y`, `disk_bytes_lt1y`)
- **Option B:** Create a new `mail_usage` table keyed by `account_id` with the same columns

Add a migration file to `migrations/` (or `archive_portal_api/migrations/` if you've moved migrations 
into this repo per PLAN.md).

### Step 4: Frontend
In `public/app.js` and `index.html`, add:
- A **"Disk usage" view:** sortable table of mailboxes/domains ranked by size
  - Columns: domain, account, total size, message count, age buckets, "reclaimable before [date]"
  - Sort by size (descending) by default
- A **"Scan usage" action:** trigger/refresh the async scan with progress badge (like existing 
  ingest/archive badges)
- **Row interaction:** clicking a row pre-fills the existing archive form with that account + date, 
  closing the loop from "find the hog" to "archive it"

**Technical context:**
- Database: MySQL/MariaDB, schema `mail_archive`, accessed via `mysql2` pool (`src/db.js`)
- Async pattern: existing archive jobs use `setImmediate` + child process; reuse this for scanning
- Frontend: vanilla JS SPA in `public/`, no build step
- Script output: existing `KEY=VALUE` contract (`parseKeyValueStdout` in `src/routes/domains.js`)

**Performance considerations:**
- Scanning every maildir is I/O-heavy; run async and cache results
- Show `disk_scanned_at` timestamp so users know freshness
- Consider reading per-maildir `maildirsize` quota file for fast total, fall back to `find` for 
  age breakdown

**Consistency & safety:**
- Reuse the archive script's exact `find` selection so projected numbers match reality
- `report` mode must be strictly read-only; keep on separate code path from `archive`/`delete`
- Never call tar/aws/rm in report mode

**Rough sequencing (each step independently testable):**
1. Script `report` mode → test on server with manual invocation
2. One endpoint + persistence → verify data saves and reads correctly
3. Frontend table → display cached usage data
4. Row-to-archive wiring → close the loop

**Acceptance criteria:**
- `report` command runs read-only, outputs `KEY=VALUE` contract with totals and age buckets
- API endpoints return cached usage data for one account and all accounts (sorted by size)
- Usage results persist in DB with a `scanned_at` timestamp
- Frontend displays sortable table of mailboxes ranked by disk usage
- Clicking a mailbox row pre-fills the archive form with that account + date
- "Scan usage" action triggers async scan and updates the table when done
- Projected reclaim numbers from report match the actual archive operation for the same date range
```
