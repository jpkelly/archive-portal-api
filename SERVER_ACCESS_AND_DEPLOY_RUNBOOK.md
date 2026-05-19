# Archive Portal Server Access and Deployment Runbook

Purpose: quick resume guide for accessing and updating archive.smallgod.net without re-discovery.

## 1. Server access methods

### 1.1 SSH access (primary)
Host: aws1.smallgod.net
Port: 5551
User: centos

Command:
  ssh -p 5551 centos@aws1.smallgod.net

### 1.2 Plesk CLI access (from SSH shell)
Most deploy/runtime operations are done through sudo + Plesk CLI.

Examples:
  sudo plesk ext git --info -domain archive.smallgod.net -name archive-portal-api
  sudo plesk ext git --get-last-commit -domain archive.smallgod.net -name archive-portal-api

### 1.3 Runtime process manager access (PM2 under Plesk Node 12)
Important: PM2 must be invoked with Plesk Node and --jitless.

Node binary:
  /opt/plesk/node/12/bin/node

PM2 CLI:
  /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2

Working PM2 command pattern:
  sudo /opt/plesk/node/12/bin/node --jitless /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 list

### 1.4 Deployed app path
  /var/www/vhosts/smallgod.net/archive.smallgod.net

Key files:
  /var/www/vhosts/smallgod.net/archive.smallgod.net/src/routes/domains.js
  /var/www/vhosts/smallgod.net/archive.smallgod.net/public/app.js

## 2. Preferred update workflow (Git push -> auto deploy)

### 2.1 Local push
From local repo:
  git add <files>
  git commit -m "<message>"
  git push origin main

### 2.2 Verify webhook-driven deploy completed
  ssh -p 5551 centos@aws1.smallgod.net 'sudo plesk ext git --get-last-commit -domain archive.smallgod.net -name archive-portal-api 2>&1 | head -3'

Expected: latest pushed commit SHA appears.

### 2.3 Verify repo integration settings
  ssh -p 5551 centos@aws1.smallgod.net 'sudo plesk ext git --info -domain archive.smallgod.net -name archive-portal-api 2>&1'

Important fields to confirm:
- Deployment mode: auto
- Run Post-Deploy Actions: enabled
- Post-Deploy action uses PM2 restart command below

## 3. Runtime restart methods

### 3.1 Restart app (safe standard)
  ssh -p 5551 centos@aws1.smallgod.net '\
    sudo /opt/plesk/node/12/bin/node --jitless \
    /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 restart archive-portal-api\
  '

### 3.2 Check app status
  ssh -p 5551 centos@aws1.smallgod.net '\
    sudo /opt/plesk/node/12/bin/node --jitless \
    /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 list\
  '

### 3.3 Check recent logs
  ssh -p 5551 centos@aws1.smallgod.net '\
    sudo /opt/plesk/node/12/bin/node --jitless \
    /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 logs archive-portal-api --lines 80 --nostream\
  '

## 4. Post-deploy action (must stay configured)

Set or refresh action:
  ssh -p 5551 centos@aws1.smallgod.net '\
    sudo plesk ext git --update \
      -domain archive.smallgod.net \
      -name archive-portal-api \
      -actions "/opt/plesk/node/12/bin/node --jitless /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 restart archive-portal-api"\
  '

## 5. Backup update methods (when auto flow is blocked)

### 5.1 Manual server-side pull check
Use Plesk Git extension info and last commit checks first.

### 5.2 Emergency file copy (temporary only)
SCP/rsync can be used for urgent hotfixes, but follow with a real commit/push so server state matches git history.

## 6. Verification checklist after any update

1) Commit deployed:
  sudo plesk ext git --get-last-commit -domain archive.smallgod.net -name archive-portal-api

2) Process online in PM2:
  sudo /opt/plesk/node/12/bin/node --jitless /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 list

3) Route check with auth token:
- Login to obtain token via /auth/login.
- Call required API endpoint and verify JSON response.

4) UI check:
- Hard refresh browser (Cmd+Shift+R) to avoid stale app.js.

## 7. Known environment gotchas

1) Running PM2 as sudo without explicit node path fails.
Use Node 12 path + --jitless command pattern shown above.

2) If changes are on disk but behavior is old, app was not restarted.
Restart PM2 and re-test.

3) Archive ingest depends on S3 object presence per account.
If response says no archives found, verify object exists for that exact account path in S3.

4) AWS credentials currently exist under centos home (~/.aws).
If runtime context changes, credential visibility can change.

## 8. Fast resume commands

Check everything quickly:
  ssh -p 5551 centos@aws1.smallgod.net '\
    sudo plesk ext git --info -domain archive.smallgod.net -name archive-portal-api 2>&1; \
    echo "---"; \
    sudo plesk ext git --get-last-commit -domain archive.smallgod.net -name archive-portal-api 2>&1 | head -5; \
    echo "---"; \
    sudo /opt/plesk/node/12/bin/node --jitless /opt/plesk/node/12/lib/node_modules/pm2/bin/pm2 list\
  '
