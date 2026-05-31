# Archive Portal — Plan & Roadmap

> Companion to [`ANALYSIS.md`](./ANALYSIS.md). This is a proposed plan, not a record of
> completed work. Nothing here has been implemented yet.

## Prioritized roadmap

Ordered by a mix of data-safety impact and value. Each item links to the relevant
observation in `ANALYSIS.md`.

| Priority | Item | Type | Why now |
|----------|------|------|---------|
| **P0** | Delete from the verified manifest, not a fresh `find` (Analysis #1) | Safety fix | Core safety premise; risk of deleting un-archived mail |
| **P0** | Fix BSD-isms `stat -f` / `sha256` → GNU; add error checks (Analysis #2) | Correctness fix | Checksums/sizes are likely wrong today |
| **P1** | Disk-usage reporting (feature below) | Feature | The original "server is full" need; high value, low risk |
| **P1** | Discover across all archive runs, not just latest (Analysis #3) | Bug fix | Older archives currently invisible |
| **P2** | Scope logout/reset-usage so it doesn't wipe global stats (Analysis #4) | Bug fix | Unintended data loss on routine action |
| **P2** | Hardening: CORS, login throttling, parameterized ingest SQL (Analysis #5) | Hardening | Defense-in-depth |
| **P3** | One-click restore from S3 | Feature | Rounds out the lifecycle |
| **P3** | Plan a Node 12 → supported runtime upgrade | Maintenance | Runtime is EOL |
| **P1** | Version-control the surrounding ops artifacts (esp. `migrations/`) | Maintenance | App-critical schema is currently untracked (see below) |

Suggested first move: the two **P0** items are small, contained, and reduce real risk —
good candidates before building new features. The disk-usage feature (P1) is the most
visible win and is described in detail below.

---

## Feature plan: Disk-usage reporting

### Goal
Let an admin see **which mailboxes/domains consume the most space** and **how much would be
reclaimed** by archiving everything older than a chosen date — turning "the server is filling
up" into "these N mailboxes hold most of it, and X GB is older than Y."

### Key insight (low risk)
`scripts/archive_account_maintenance.sh` already computes `SOURCE_BYTES` and `FILE_COUNT` for
a date range using `find ... -printf '%s\t%p'` (~L54–58, L60, L72). A reporting mode reuses
that exact selection logic in **read-only** form — so the projected reclaim matches what a
real archive of the same range would actually move. No tar, no upload, no delete.

### Proposed steps

1. **Add a `report` command to `archive_account_maintenance.sh`.**
   - Signature: `archive_account_maintenance.sh report <domain> <user> <from_date> <to_date> [mode]`.
   - Reuse the existing `find` to sum bytes/counts; optionally emit age buckets via a second
     pass (`find -printf '%T@ %s\n'` aggregated into e.g. `>3y`, `1–3y`, `<1y`).
   - Emit the established `KEY=VALUE` contract, e.g. `TOTAL_BYTES`, `TOTAL_FILES`,
     `BUCKET_GT3Y_BYTES`, `RECLAIMABLE_BEFORE_<date>_BYTES`. **No** tar/upload/delete paths run.

2. **Add read-only API endpoints** (admin-gated, mirroring existing route patterns in
   `src/routes/domains.js`):
   - `GET /domains/:domainId/usage` — per-account size, message count, age-bucket breakdown.
   - `GET /usage` — all domains, with per-domain rollups, sorted by size.
   - For responsiveness, run the scan **asynchronously** (like the existing archive jobs,
     `setImmediate` + child process) and persist results so the UI reads cached numbers.

3. **Persist usage results.** Either add nullable columns to `mail_accounts`
   (`disk_bytes`, `disk_scanned_at`, plus bucket columns) or a new `mail_usage` table keyed by
   `account_id`. Add the migration alongside `migrations/` (note: migrations currently live in
   the parent maintenance folder, not this repo — decide where the canonical home is).

4. **Frontend (`public/app.js` + `index.html`).**
   - A "Disk usage" view: sortable table of mailboxes/domains ranked by size, with columns for
     total size, message count, and **"reclaimable before [date]"** plus a projected-total.
   - A "Scan usage" action to trigger/refresh the async scan, with progress like the existing
     ingest/archive badges.
   - Clicking a row pre-fills the existing **archive** form for that account + date — closing
     the loop from "find the hog" to "archive it."

### Considerations
- **Performance:** scanning every Maildir is I/O-heavy. Run async, cache results, and show
  `disk_scanned_at` so users know freshness. Consider reading the per-maildir `maildirsize`
  quota file for a fast total, falling back to `find` for the age breakdown.
- **Consistency:** reusing the archive script's `find` means the preview equals reality —
  important so "reclaimable" numbers are trustworthy.
- **Safety:** `report` mode must be strictly read-only; keep it on a separate code path from
  `archive`/`delete` and never call tar/aws/rm.

### Rough sequencing
Script `report` mode → one endpoint + persistence → frontend table → row-to-archive wiring.
Each step is independently testable; the script step can be validated on the server before any
API/UI work.

---

## Version-controlling the surrounding ops artifacts

This repo (`archive_portal_api`) is a git repo, but it lives inside an umbrella working
folder that is **not** under version control:

```
smallgod.net_server_maintainence/        ← NOT a git repo
├── archive_portal_api/                   ← this repo (git → jpkelly/archive-portal-api)
├── migrations/                           ← 001_initial_email_archive_schema.sql, mysql/  ← UNTRACKED
├── run_mail_archive_all_domains.sh       ← UNTRACKED
├── domain_deletion_script_template.sh
├── full_mailnames_backup.sh
├── email_quota_setter_script.sh
├── email_management_plan.md, *_plan.md, *_spec.md
├── email_users_activity_tracking.csv
├── inactive_domains_deletion_list.{csv,txt}
└── exclude-domains.txt
```

The most important risk: **`migrations/` defines the `mail_archive` schema the app depends
on, and it is not versioned anywhere.** If that folder is lost, the DB structure is
unrecoverable from source.

### Recommended approach

1. **Move app-critical DB migrations into this repo.** The schema belongs with the code that
   uses it. Create `archive_portal_api/migrations/` (or `db/migrations/`) and move
   `001_initial_email_archive_schema.sql` (and the `mysql/` contents) there. Going forward,
   new migrations are committed alongside the code that needs them. Update `CLAUDE.md` to
   point at the new location.

2. **Put the remaining ops artifacts in a separate private repo** (e.g.
   `smallgod-server-maintenance`). These are operational scripts, plans, and lists — useful
   to version, but separate from the deployable app. Initialize it in the umbrella folder:
   - `git init` in `smallgod.net_server_maintainence/`.
   - Add a `.gitignore` that **excludes the nested `archive_portal_api/`** so the two repos
     don't entangle (git would otherwise treat it as an embedded repo). If you want them
     linked, use a git **submodule** instead of nesting — but two independent repos is simpler.
   - Make the repo **private** (see sensitivity note below).

3. **Decide the canonical home for each file and avoid duplication.** Anything that already
   lives in `archive_portal_api/scripts/` should not be re-tracked in the ops repo.

### Sensitivity — review before committing

Several untracked files contain potentially sensitive data and must **not** go into a public
repo:

- `email_users_activity_tracking.csv` and `inactive_domains_deletion_list.{csv,txt}` contain
  real email addresses / domain lists (PII). Keep these in a **private** repo, or `.gitignore`
  the data files and commit only templates/headers.
- Operational scripts may embed server paths, hostnames, or assumptions about credentials
  (e.g. `sync_primary_emails.py` reads a WHMCS config path). **Never commit credentials,
  `.env`, `.aws/` contents, or DB passwords.** Scrub before the first commit and add matching
  `.gitignore` rules.

### Suggested `.gitignore` for the ops repo

```
archive_portal_api/        # tracked as its own repo (or a submodule)
node_modules/
.env
.DS_Store
*.pyc
__pycache__/
# data exports / PII — uncomment to exclude if not keeping them in a private repo
# *.csv
```

### Sequencing
Move `migrations/` into this repo first (closes the app-critical gap), then stand up the
private ops repo for everything else. Both are low-risk, mechanical changes — but the
sensitivity review should happen before the very first commit of the ops repo.
