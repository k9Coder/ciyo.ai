# Secrets Rotation & Git History Scrub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all committed secrets from git history, rotate every exposed credential, and add the offending files to `.gitignore` so they can never be committed again.

**Architecture:** Use BFG Repo-Cleaner to scrub the history in a single pass, force-push to all remotes, and immediately rotate all exposed keys in their respective dashboards. Add `.gitignore` entries before anything else so no re-commit is possible.

**Tech Stack:** BFG Repo-Cleaner (Java), git, Clerk dashboard, Groq console, environment variable management.

---

### Task 1: Audit Exactly Which Files Are Tracked

**Files:**
- Read: `backend/.gitignore`
- Read: `.gitignore`

- [ ] Step 1: Verify which secret-bearing files are currently tracked by git.
```bash
git ls-files backend/.env.staging backend/e2e/.env.e2e
```
Expected output:
```
backend/.env.staging
backend/e2e/.env.e2e
```
If output is empty for a file it is already untracked — skip that file in BFG step.

- [ ] Step 2: Confirm the three live secrets that were in `backend/.env.staging`.
The following keys were observed in the committed file and must all be rotated:
- `GROQ_API_KEY=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`
- `CLERK_SECRET_KEY=sk_test_9PvDtVG8frNI9GigfcsRYt7xtW1tXnq3eTIsgi7kQW`
- `CLERK_WEBHOOK_SECRET=whsec_IOz64OjXIIvtW7Zj1PC6GA3u3GH7wrOk`

- [ ] Step 3: Commit to be blocked.
```bash
git log --all --oneline -- backend/.env.staging | head -5
```
Note the earliest commit SHA — BFG will need to rewrite from the root.

---

### Task 2: Update .gitignore Before Any Other Step

**Files:**
- Modify: `backend/.gitignore`
- Modify: `.gitignore`

- [ ] Step 1: Add `backend/.env.staging` and `backend/e2e/.env.e2e` to `backend/.gitignore`.

Current `backend/.gitignore` content:
```
node_modules/
dist/

# Environment files — .env.staging is safe to commit (test keys only)
.env
.env.prod
.env.test

# Test artifacts
.seed-state.json
test-results/
playwright-report/
```

Replace the comment line and add staging:
```
node_modules/
dist/

# Environment files — NEVER commit any .env file
.env
.env.prod
.env.test
.env.staging
.env.staging.local

# E2E credentials — never commit
e2e/.env.e2e

# Test artifacts
.seed-state.json
test-results/
playwright-report/
```

- [ ] Step 2: Update the root `.gitignore` comment to remove the incorrect "safe to commit" note and add a staging glob.

In `.gitignore`, replace:
```
# Prod env files across all packages — contain real secrets
# .env.staging files are safe to commit (test keys only)
**/.env.prod
```
With:
```
# Env files — never commit any .env variant
**/.env.prod
**/.env.staging
**/.env.staging.local
```

- [ ] Step 3: Remove the files from git tracking without deleting them from disk.
```bash
git rm --cached backend/.env.staging
git rm --cached backend/e2e/.env.e2e 2>/dev/null || true
git add backend/.gitignore .gitignore
git commit -m "security: stop tracking .env.staging and e2e/.env.e2e — add to .gitignore"
```

---

### Task 3: Scrub Git History with BFG

**Files:**
- No source changes — history rewrite only.

- [ ] Step 1: Download BFG Repo-Cleaner. Requires Java 8+.
```bash
# Download BFG 1.14.0
curl -Lo /tmp/bfg.jar https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
java -version   # must be >= 1.8
```

- [ ] Step 2: Create a file listing secrets to delete from history.
```bash
cat > /tmp/secrets.txt << 'EOF'
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
sk_test_9PvDtVG8frNI9GigfcsRYt7xtW1tXnq3eTIsgi7kQW
whsec_IOz64OjXIIvtW7Zj1PC6GA3u3GH7wrOk
EOF
```

- [ ] Step 3: Run BFG to delete the tracked files from all history. Do this from the **parent** directory of the repo.
```bash
# From parent dir of prompt-saviour:
java -jar /tmp/bfg.jar --delete-files .env.staging path/to/prompt-saviour
java -jar /tmp/bfg.jar --replace-text /tmp/secrets.txt path/to/prompt-saviour
```

- [ ] Step 4: Complete the cleanup and force-push.
```bash
cd path/to/prompt-saviour
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force --all
git push --force --tags
```
Expected: all remote branches updated. Verify by checking GitHub that the files no longer appear in old commits.

---

### Task 4: Rotate All Exposed Credentials

**Files:**
- Modify: `backend/.env.staging` (new values only, file is now untracked)

- [ ] Step 1: Rotate `GROQ_API_KEY`.
  1. Go to https://console.groq.com/keys
  2. Delete key `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`
  3. Create new key, name it `mykka-staging`
  4. Update `backend/.env.staging`: `GROQ_API_KEY=<new_key>`

- [ ] Step 2: Rotate `CLERK_SECRET_KEY`.
  1. Go to Clerk Dashboard → API Keys
  2. Delete key `sk_test_9PvDtVG8frNI9GigfcsRYt7xtW1tXnq3eTIsgi7kQW`
  3. Create new secret key
  4. Update `backend/.env.staging`: `CLERK_SECRET_KEY=<new_key>`
  5. Update Railway staging environment variable in Railway dashboard

- [ ] Step 3: Rotate `CLERK_WEBHOOK_SECRET`.
  1. Go to Clerk Dashboard → Webhooks → Edit the staging webhook endpoint
  2. Click "Regenerate signing secret"
  3. Copy new `whsec_...` value
  4. Update `backend/.env.staging`: `CLERK_WEBHOOK_SECRET=<new_secret>`
  5. Update Railway staging environment variable

- [ ] Step 4: Verify staging backend still starts with new credentials.
```bash
cd backend && NODE_ENV=staging node -e "require('dotenv').config({path:'.env.staging'}); require('./dist/index.js')" &
sleep 3
curl -s http://localhost:3000/health
# Expected: {"ok":true}
kill %1
```

---

### Task 5: Add Pre-Commit Hook to Prevent Future Accidents

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (root)

- [ ] Step 1: Install `detect-secrets` via pip or add `secretlint` to the repo.
```bash
npm install --save-dev secretlint @secretlint/secretlint-rule-preset-recommend
```

- [ ] Step 2: Create `.secretlintrc.json` in repo root.
```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend"
    }
  ]
}
```

- [ ] Step 3: Add secretlint to root `package.json` scripts.
```json
"scripts": {
  "secretlint": "secretlint \"**/*\" --ignore-path .gitignore"
}
```

- [ ] Step 4: Install husky and add pre-commit hook.
```bash
npm install --save-dev husky
npx husky init
echo 'npx secretlint "**/*" --ignore-path .gitignore' > .husky/pre-commit
```

- [ ] Step 5: Verify hook fires and catches a fake secret.
```bash
# Create temp file with a fake key pattern
echo 'CLERK_SECRET_KEY=sk_test_fakekey' > /tmp/test-secret.txt
cp /tmp/test-secret.txt ./test-secret-DELETE-ME.txt
git add test-secret-DELETE-ME.txt
git commit -m "test: should fail"
# Expected output: secretlint error about Clerk key, commit blocked
git restore --staged test-secret-DELETE-ME.txt
rm test-secret-DELETE-ME.txt
```

- [ ] Step 6: Commit the secretlint config and hook.
```bash
git add .secretlintrc.json .husky/pre-commit package.json package-lock.json
git commit -m "security: add secretlint pre-commit hook to block credential commits"
```
