# Handoff Task Plan

Step-by-step task instructions for an implementing agent. Each task is independent,
small, and has explicit acceptance criteria. Do the tasks **in order** — they are
sorted easiest/safest first. Complete and verify one task fully before starting the next.

## Global rules (read first, apply to every task)

1. **Runtime is Node 12 (EOL).** Do NOT use syntax newer than Node 12:
   - ❌ optional chaining (`a?.b`), nullish coalescing (`a ?? b`), `Array.prototype.at`,
     top-level await, `fs.promises.rm` assumptions (the codebase already guards this).
   - ✅ `const`, arrow functions, async/await, template literals, destructuring are fine.
2. **No new npm dependencies** unless a task explicitly says so. Prefer hand-rolled
   helpers over packages (old runtime + deploy friction).
3. **Never weaken deletion safety.** Do not touch the verify-before-delete gating, the
   manifest-driven delete path, or `job_id` guards in `src/routes/domains.js`.
4. **Script output contract:** if you change stdout keys in
   `scripts/archive_account_maintenance.sh`, you must update `parseKeyValueStdout`
   callers in `src/routes/domains.js` in the same change. (None of the tasks below
   require this — if you find yourself doing it, stop and re-read the task.)
5. **Commit per task** with a one-line message naming the task. **Do NOT `git push`**
   — the repo auto-deploys to production on push. Leave pushing to the human.
6. There are pre-existing uncommitted changes (`docs/ANALYSIS.md` modified,
   `docs/PROMPTS.md` untracked). **Do not commit, revert, or delete them.** Commit only
   the files you change, by explicit path (`git add <file>`), never `git add -A`/`git add .`.
7. The archive/delete/ingest paths only run on the production Plesk server. You cannot
   integration-test them locally. Verification = code review + `node --check <file>`
   syntax check + the per-task acceptance criteria.
8. Shell scripts target **GNU/Linux (CentOS)**: `date -d`, `stat -c '%s'`, `sha256sum`.
   Never introduce BSD/macOS variants.

---

## Task 1 — Stop admin logout from wiping global usage stats

**Problem:** `resetUsageStatsForUser` in `src/routes/auth.js` (~L17) runs
`UPDATE folders SET message_count = 0` and zeroes all `mail_accounts` rows for **every**
admin logout and every `/auth/reset-usage` call. Logout should only clean up the temp
archive cache; it should not destroy persistent indexed stats.

**Change — exactly this, nothing more:**

1. In `src/routes/auth.js`, find the `POST /logout` handler (~L122). Remove the line
   `await resetUsageStatsForUser(userId, role);` and its comment. Keep the
   `removeDirRecursive(tempArchiveRootDir())` call — temp-cache purge on logout stays.
   Remove the now-unused `userId`/`role` consts if nothing else uses them.
2. Keep `resetUsageStatsForUser` and the `GET|POST /auth/reset-usage` routes unchanged.
   Reset-usage is an explicit user action; only the implicit logout side effect goes away.

**Acceptance criteria:**
- `grep -n resetUsageStatsForUser src/routes/auth.js` shows the function definition and
  the `handleResetUsage` call sites only — no call inside the logout handler.
- `node --check src/routes/auth.js` passes.
- Logout still purges the temp dir and still returns `{ ok: true }`.

---

## Task 2 — Restrict CORS to the portal origin

**Problem:** `src/app.js` (~L49) has `app.use(cors())` — any origin allowed.

**Change:**

1. In `src/config.js`, add an exported config value `corsOrigins`: read
   `process.env.CORS_ORIGINS` (comma-separated list), split on `,`, trim entries, drop
   empties. Default when unset: `['https://archive.smallgod.net']`.
2. In `src/app.js`, replace `app.use(cors())` with:
   ```js
   app.use(cors({ origin: corsOrigins }));
   ```
   importing `corsOrigins` from `./config` alongside the existing config imports.
3. Add `CORS_ORIGINS` to `.env.example` with a comment, e.g.
   `# Comma-separated allowed origins (default: https://archive.smallgod.net)`.

**Notes:** Same-origin SPA requests (the normal use) don't send a cross-origin
`Origin`, so this is low-risk. Do not add credentials/headers options — defaults are fine.

**Acceptance criteria:**
- `node --check src/app.js && node --check src/config.js` pass.
- With no env var set, the cors `origin` array equals `['https://archive.smallgod.net']`.
- `.env.example` documents the new variable.

---

## Task 3 — Add login rate limiting (no new dependencies)

**Problem:** `POST /auth/login` (`src/routes/auth.js` ~L59) has no throttling.

**Change — hand-rolled in-memory limiter (do NOT add express-rate-limit; it may not
support Node 12 and adds deploy risk):**

1. In `src/routes/auth.js`, above the login route, add a small fixed-window limiter:
   - A `Map` keyed by `req.ip + '|' + (email or '')`, storing `{ count, windowStart }`.
   - Window: 15 minutes. Max attempts per window: 10.
   - On each login attempt: prune the entry if its window expired; increment; if
     `count > 10`, respond `429` with
     `{ error: 'Too many login attempts, try again later' }` and **do not** hit the DB.
   - On **successful** login, delete the entry for that key.
   - To bound memory, when the Map exceeds 1000 entries, delete expired entries; this
     is sufficient — do not build anything fancier.
2. Behavior on failed credentials stays exactly as-is (401, same body).

**Acceptance criteria:**
- `node --check src/routes/auth.js` passes.
- Logic review: 11th failed attempt within 15 min for the same ip+email returns 429
  without a DB query; a success clears the counter; different ip or email is unaffected.
- No changes to `package.json`.

---

## Task 4 — Make discover/ingest see ALL archive runs, not just the latest

**Problem:** `getLatestArchiveTimestamp()` in `src/routes/domains.js` (~L593) returns
only the newest `archive/<timestamp>/` prefix. Its three consumers —
`findAccountArchivePath` (~L665), `POST /discover-all` (~L876), and
`POST /:domainId/archive/discover` (~L2001) — therefore can't find archives created in
older runs. (`findOrphanedArchives` already lists recursively and is NOT affected —
leave it alone.)

**Change:**

1. Add a new function `listArchiveTimestamps()` next to `getLatestArchiveTimestamp()`:
   identical `aws s3 ls s3://smallgod-mail-archive/archive/` call and parsing, but
   return the **full array** of `YYYYMMDD_HHMMSS` strings **sorted descending**
   (newest first). Keep `getLatestArchiveTimestamp()` as a one-line wrapper returning
   `timestamps[0] || ''` so nothing else breaks.
2. `findAccountArchivePath(domain, username)`: loop over `listArchiveTimestamps()` in
   order (newest first); for each timestamp run the existing per-prefix `aws s3 ls`
   logic; return the first `.tar.gz` URI found; return `null` if none. Preserve the
   existing "non-zero exit with empty stderr means no archive" handling per attempt.
3. `discover-all` (~L876) and `discover` (~L2001): replace the single
   `latestTimestamp` with the array from `listArchiveTimestamps()`. For each account
   that has no existing archive state, check timestamps **newest first** and register
   the first tarball found (so an account archived in run A and re-archived in run B
   registers run B). Keep `job_id: 'discovered_' + <the timestamp that matched>`.
   Keep the early-return `message: 'No archive runs found in S3'` when the array is empty.
4. Performance guard: this multiplies `aws s3 ls` calls by the number of runs. Cap it —
   check at most the **20 newest** timestamps per account (`timestamps.slice(0, 20)`),
   and add a code comment saying so.

**Do not** change `setArchiveState` fields, `inferRangeFromS3Uri`, or any
verify/delete logic.

**Acceptance criteria:**
- `node --check src/routes/domains.js` passes.
- `getLatestArchiveTimestamp()` still exists and returns the newest timestamp string.
- Both discover routes and `findAccountArchivePath` iterate multiple timestamps,
  newest first, with the 20-run cap.
- Accounts with existing archive state are still skipped (the `existing` check is
  unchanged and happens before any S3 calls for that account).

---

## Task 5 — Documentation status pass (mechanical)

**Problem:** `docs/PLAN.md` claims "Nothing here has been implemented yet", but several
items have shipped. `docs/ANALYSIS.md` items #1 and #2 are fixed in code.

**Change (edit text only — no code):**

1. `docs/PLAN.md`:
   - Replace the "Nothing here has been implemented yet" header note with a dated note:
     plan partially implemented, see status column.
   - Add a **Status** column to the roadmap table:
     - P0 manifest-delete → **Done** (delete now uses the verified manifest).
     - P0 BSD-isms fix → **Done** (`stat -c`, `sha256sum`, explicit error checks).
     - P1 disk-usage reporting → **Done** (report mode, `mail_usage` table
       `migrations/003_mail_usage.sql`, usage UI shipped).
     - P1 discover-all-runs → **Done** if Task 4 above is complete, else **Open**.
     - P2 logout/reset scope → **Done** if Task 1 is complete, else **Open**.
     - P2 hardening → mark CORS/rate-limit per Tasks 2–3; ingest SQL stays **Open**.
     - P3 restore, P3 Node upgrade, P1 ops-repo versioning → **Open**.
2. `docs/ANALYSIS.md` is **already locally modified — read the current version first**
   and only append/adjust status notes consistent with what you actually shipped
   (e.g. "Resolved as of <commit>" lines under items #3/#4/#5 sub-items you fixed).
   Do not rewrite or reorder the document.

**Acceptance criteria:** docs accurately reflect code state; no stale "not implemented"
claims; pre-existing local edits to ANALYSIS.md preserved.

---

## Task 6 — DEFERRED: parameterized ingest SQL (do not attempt)

`scripts/ingest_worker.py` builds SQL by string interpolation (`esc()`/`build_sql()`)
piped to `plesk db`. Fixing this properly means switching to a real MySQL client with
parameterized queries — a runtime/credentials change that can only be validated on the
production server. **Out of scope for this handoff.** Leave the file untouched; note it
as Open in the Task 5 docs pass.

Likewise out of scope: Node 12 upgrade, S3 restore feature, and creating the umbrella
ops repo (requires a human PII/sensitivity review before first commit).

---

## Final checklist (after all tasks)

- [ ] One commit per completed task, each adding only its own files by explicit path.
- [ ] Pre-existing `docs/ANALYSIS.md` modifications and `docs/PROMPTS.md` still present
      and uncommitted unless Task 5 deliberately included ANALYSIS.md edits (then commit
      it as part of Task 5 and say so).
- [ ] `node --check` clean on every touched JS file.
- [ ] **Nothing pushed.** Report: list of commits made, files touched per commit, and
      explicitly state "Changes are local only — not deployed yet. Push when ready."
