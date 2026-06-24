# Handoff Instructions — Operator Guide

How to hand the tasks in [`HANDOFF_TASKS.md`](./HANDOFF_TASKS.md) off to another
(less capable) model, and how to supervise and review its work.

Baseline commit at time of handoff: `6cb28a1` (main, in sync with origin).

---

## 1. Kickoff prompt (copy-paste to the implementing model)

```
You are working in the repo at /Users/jp/Documents/GitHub/smallgod.net_server_maintainence/archive_portal_api.

Read these files completely before doing anything:
1. docs/HANDOFF_TASKS.md  — your task list. The "Global rules" section is mandatory.
2. CLAUDE.md              — architecture, conventions, and gotchas.

Then execute the tasks in docs/HANDOFF_TASKS.md strictly in order (Task 1 → 5).
Task 6 is deferred — do not attempt it.

Hard constraints (repeated for emphasis):
- Runtime is Node 12: no optional chaining (?.), no nullish coalescing (??).
- No new npm dependencies. Do not modify package.json.
- NEVER run `git push`. Pushing deploys to production.
- Commit one task at a time, adding files by explicit path only (never git add -A).
- There are pre-existing uncommitted changes (docs/ANALYSIS.md, docs/PROMPTS.md).
  Do not revert, delete, or commit them except where Task 5 says otherwise.
- Run `node --check <file>` on every JS file you touch before committing.

After each task: state which acceptance criteria you verified and how.
If any acceptance criterion cannot be met, STOP, leave the task uncommitted,
and report the blocker instead of improvising.

When all tasks are done, output: the commit list (hash + message), files touched
per commit, and the line "Changes are local only — not deployed yet."
```

---

## 2. Operator procedure

### Before starting

Snapshot the current state so review is easy later:

```
git -C archive_portal_api rev-parse HEAD
```

(Should be `6cb28a1`.) No stash needed — the plan protects the uncommitted
`docs/ANALYSIS.md` / `docs/PROMPTS.md`, but know they are there.

### While running

Run the model **one task at a time** if it supports it — paste the kickoff prompt,
then if it tries to batch everything, tell it "Task 1 only, then stop for review."
Per-task checkpoints catch drift early on weaker models.

### Review checklist (after each task, or at the end)

```
git -C archive_portal_api log --oneline 6cb28a1..HEAD
git -C archive_portal_api diff 6cb28a1..HEAD
git -C archive_portal_api status --short
```

Verify:

- [ ] One commit per task, messages name the task.
- [ ] No `package.json` / `package-lock.json` changes.
- [ ] `docs/ANALYSIS.md` / `docs/PROMPTS.md` still uncommitted
      (except Task 5's deliberate ANALYSIS.md edits, committed as part of Task 5).
- [ ] No Node-12-incompatible syntax in the diff:
      `git -C archive_portal_api diff 6cb28a1..HEAD | grep -E '\?\.|\?\?'` is empty.
- [ ] Delete-safety code untouched: no diff hunks in the verify/delete gating or
      `job_id` guard sections of `src/routes/domains.js`.
- [ ] Each task's acceptance criteria in `HANDOFF_TASKS.md` actually hold.

### If a task went wrong

Revert just that commit (`git revert <hash>`) or reset to the prior task's commit —
the one-commit-per-task rule exists exactly for this.

### Deploy when satisfied

Push yourself:

```
git -C archive_portal_api push origin main
```

This triggers the Plesk auto-deploy + PM2 restart. Then verify per
[`../SERVER_ACCESS_AND_DEPLOY_RUNBOOK.md`](../SERVER_ACCESS_AND_DEPLOY_RUNBOOK.md):
deployed commit SHA matches, PM2 process online, hard-refresh the UI.

**Post-deploy smoke test:** Tasks 2–3 touch auth/CORS — do one manual login from the
browser to confirm nothing is locked out, and confirm the usage table still loads.
