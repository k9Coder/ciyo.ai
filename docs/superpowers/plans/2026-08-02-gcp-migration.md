# GCP Migration Implementation Plan

> **STATUS: DEFERRED (2026-08-03).** Not executing this right now — GCP has no enforceable hard spending cap, which doesn't meet the user's actual requirement (a guaranteed ≤$10/mo ceiling, not a probable one). Staying on Render's flat-rate pricing instead; see `docs/superpowers/specs/2026-08-03-render-hard-cap-hosting-strategy.md` for the active plan and the concrete triggers that would bring this plan back into play. Task 1 was reached and blocked on interactive GCP account setup (gcloud CLI got installed locally in the process) before the pivot — nothing else in this plan was executed.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `backend`, `mykka-web`, and `pretzel-console` off Render/Vercel onto GCP Cloud Run (staging + production), while keeping total GCP spend under $10/month, without touching the Neon-hosted Postgres database.

**Architecture:** Six Cloud Run services (3 apps × 2 envs), one Artifact Registry repo, per-env Secret Manager secrets, a $10 budget backed by the existing `deploy/gcp/budget-guard` Cloud Function, and GitHub Actions (authenticated via Workload Identity Federation) replacing the current Render API calls / Vercel Git integration as the deploy mechanism.

**Tech Stack:** Cloud Run, Artifact Registry, Secret Manager, Cloud Functions (gen2), gcloud CLI, GitHub Actions, `envsubst` for per-env YAML templating.

## Global Constraints

- Total GCP spend must not exceed **$10/month**, enforced by the budget-guard Cloud Function (threshold rules at 80%/100%).
- Single region for everything: **`us-central1`**.
- Reuse the existing Dockerfiles (`backend/Dockerfile`, `mykka-web/Dockerfile`, `pretzel-console/Dockerfile`) and the existing `deploy/gcp/*.yaml` — extend them to two environments, don't replace them.
- `staging` branch deploys to the staging Cloud Run services; `master` branch deploys to production — matching the current GitHub Environments convention (`production`/`staging`) already used for Render secrets.
- Never write a real secret value into a committed file. Every secret goes into Secret Manager via `gcloud secrets create --data-file=-` from an interactive shell, never hardcoded in YAML, workflows, or this plan.
- Postgres (Neon) does not move. No task in this plan touches the database.

---

### Task 1: GCP project, billing, and APIs

**Files:** none (console + gcloud only)

- [ ] **Step 1: Create the project and link billing**

In the GCP Console (console.cloud.google.com), using the Google account already used for Clerk's Google SSO setup:
1. Create a new project named `mykka-ai` (or accept the auto-generated ID if `mykka-ai` is taken — note the actual `PROJECT_ID` for every step below).
2. Billing → link a billing account (requires a card on file — this is the account GCP will actually charge, so this is the moment real spend risk begins).

- [ ] **Step 2: Set the active project locally and enable required APIs**

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbilling.googleapis.com \
  cloudfunctions.googleapis.com \
  pubsub.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com
```

- [ ] **Step 3: Verify**

```bash
gcloud services list --enabled --format="value(config.name)" | grep -E "run|artifactregistry|secretmanager|cloudbilling|cloudfunctions|pubsub"
```
Expected: all 6 service names printed, no errors.

- [ ] **Step 4: Commit** — nothing to commit, this task is infrastructure-only. Note the final `PROJECT_ID` somewhere you'll reuse it (every later task needs it).

---

### Task 2: Artifact Registry repo with cleanup policy

**Files:** none (gcloud only)

**Interfaces:**
- Produces: an Artifact Registry Docker repo at `us-central1-docker.pkg.dev/PROJECT_ID/mykka` that Task 5+ push images to and Task 6+ deploy from.

- [ ] **Step 1: Create the repo**

```bash
gcloud artifacts repositories create mykka \
  --repository-format=docker \
  --location=us-central1 \
  --description="mykka backend/web/console images"
```

- [ ] **Step 2: Add a cleanup policy so storage never grows unbounded**

```bash
gcloud artifacts repositories set-cleanup-policies mykka \
  --location=us-central1 \
  --policy=deploy/gcp/artifact-cleanup-policy.json
```

Create `deploy/gcp/artifact-cleanup-policy.json` first:

```json
[
  {
    "name": "keep-recent",
    "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": 10 }
  },
  {
    "name": "delete-old",
    "action": { "type": "Delete" },
    "condition": { "olderThan": "2592000s" }
  }
]
```

This keeps the 10 most recent versions of every image tag family and deletes anything older than 30 days beyond that — keeps storage well under the 0.5GB free tier at our image sizes and push frequency.

- [ ] **Step 3: Verify**

```bash
gcloud artifacts repositories describe mykka --location=us-central1
```
Expected: repo details printed, `cleanupPolicies` present in the output.

- [ ] **Step 4: Commit**

```bash
git add deploy/gcp/artifact-cleanup-policy.json
git commit -m "chore(deploy): add Artifact Registry cleanup policy"
```

---

### Task 3: Workload Identity Federation for GitHub Actions

**Files:** none (gcloud only) — output of this task is consumed by every workflow edit later (Tasks 8, 11, 14).

**Interfaces:**
- Produces: a service account `github-deployer@PROJECT_ID.iam.gserviceaccount.com` and a Workload Identity Provider resource name, both needed as GitHub secrets in Task 4.

- [ ] **Step 1: Create the deploy service account**

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions deployer"
```

- [ ] **Step 2: Grant it the roles it needs to deploy**

```bash
SA="github-deployer@PROJECT_ID.iam.gserviceaccount.com"
for ROLE in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="$ROLE"
done
```

- [ ] **Step 3: Create the Workload Identity Pool and GitHub provider**

```bash
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='OWNER/REPO'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```
Replace `OWNER/REPO` with the actual GitHub `owner/repo` slug (find it with `git remote get-url origin`).

- [ ] **Step 4: Allow that GitHub repo to impersonate the deploy service account**

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/OWNER/REPO"
```
`PROJECT_NUMBER` (not `PROJECT_ID`) — get it with `gcloud projects describe PROJECT_ID --format="value(projectNumber)"`.

- [ ] **Step 5: Verify**

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global --workload-identity-pool=github-pool
```
Expected: provider details printed with the correct issuer URI and attribute condition.

- [ ] **Step 6: Record the two values every workflow needs**

```bash
echo "workload_identity_provider: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
echo "service_account: github-deployer@PROJECT_ID.iam.gserviceaccount.com"
```
These go into GitHub secrets in Task 4 — no code to commit in this task.

---

### Task 4: GitHub repo/environment secrets and variables for GCP

**Files:** none (GitHub Settings UI or `gh` CLI)

- [ ] **Step 1: Add repo-level (environment-independent) secrets**

Via `gh` CLI or Settings → Secrets and variables → Actions:

```bash
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --body "projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
gh secret set GCP_SERVICE_ACCOUNT --body "github-deployer@PROJECT_ID.iam.gserviceaccount.com"
gh variable set GCP_PROJECT_ID --body "PROJECT_ID"
gh variable set GCP_REGION --body "us-central1"
```

- [ ] **Step 2: Verify**

```bash
gh secret list | grep GCP
gh variable list | grep GCP
```
Expected: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` secrets and `GCP_PROJECT_ID`, `GCP_REGION` variables all present.

- [ ] **Step 3: Commit** — nothing to commit, GitHub-side configuration only.

---

### Task 5: Per-environment Secret Manager secrets for the backend

**Files:** none (gcloud only, run from a shell with the real values on hand — pull them from the Render dashboard's backend service env vars, or from the local `backend/.env.prod` for production values)

**Interfaces:**
- Produces: 8 Secret Manager secrets (`backend-database-url-staging`, `backend-database-url-prod`, `backend-clerk-secret-key-staging`, `backend-clerk-secret-key-prod`, `backend-clerk-webhook-secret-staging`, `backend-clerk-webhook-secret-prod`, `backend-internal-secret-staging`, `backend-internal-secret-prod`) that Task 10's Cloud Run YAML references via `secretKeyRef`.

- [ ] **Step 1: Create staging secrets** (values from `backend/.env.staging` — already committed with non-critical test-tier keys, safe to read directly)

```bash
grep '^DATABASE_URL=' backend/.env.staging | cut -d= -f2- | gcloud secrets create backend-database-url-staging --data-file=-
grep '^CLERK_SECRET_KEY=' backend/.env.staging | cut -d= -f2- | gcloud secrets create backend-clerk-secret-key-staging --data-file=-
grep '^CLERK_WEBHOOK_SECRET=' backend/.env.staging | cut -d= -f2- | gcloud secrets create backend-clerk-webhook-secret-staging --data-file=-
grep '^INTERNAL_SECRET=' backend/.env.staging | cut -d= -f2- | gcloud secrets create backend-internal-secret-staging --data-file=-
```

- [ ] **Step 2: Create production secrets** (values from local `backend/.env.prod` — gitignored, local-only per `docs/ENVIRONMENT_AND_SECRETS.md`)

```bash
grep '^DATABASE_URL=' backend/.env.prod | cut -d= -f2- | gcloud secrets create backend-database-url-prod --data-file=-
grep '^CLERK_SECRET_KEY=' backend/.env.prod | cut -d= -f2- | gcloud secrets create backend-clerk-secret-key-prod --data-file=-
grep '^CLERK_WEBHOOK_SECRET=' backend/.env.prod | cut -d= -f2- | gcloud secrets create backend-clerk-webhook-secret-prod --data-file=-
```
`INTERNAL_SECRET` in `backend/.env.prod` is currently a `FILL_IN_FROM_RENDER_DASHBOARD` placeholder — pull the real value from the Render dashboard's backend production service env vars before running:
```bash
echo -n "PASTE_REAL_VALUE_HERE" | gcloud secrets create backend-internal-secret-prod --data-file=-
```

- [ ] **Step 3: Verify**

```bash
gcloud secrets list --filter="name~backend-" --format="value(name)"
```
Expected: all 8 secret names listed.

- [ ] **Step 4: Commit** — nothing to commit, secret values never touch the working tree beyond the already-existing `.env.*` files.

---

### Task 6: Retarget the budget-guard to $10 across 6 services

**Files:**
- Modify: `deploy/gcp/README.md` (budget amount, service list)
- Modify: `deploy/gcp/budget-guard/index.js` — no code change needed (it already reads `GUARDED_SERVICES` from env), only its deploy env var changes

- [ ] **Step 1: Update the budget amount and guarded-service list in the README**

In `deploy/gcp/README.md`, change every `50` (budget amount) to `10`, and update `GUARDED_SERVICES` references from `mykka-backend,mykka-console,mykka-web` to the 6-service list: `mykka-backend-staging,mykka-backend-prod,mykka-console-staging,mykka-console-prod,mykka-web-staging,mykka-web-prod`.

- [ ] **Step 2: Create the budget**

```bash
BILLING_ACCOUNT_ID=$(gcloud billing projects describe PROJECT_ID --format="value(billingAccountName)" | sed 's#billingAccounts/##')

gcloud pubsub topics create budget-alerts

gcloud billing budgets create \
  --billing-account=$BILLING_ACCOUNT_ID \
  --display-name="mykka-10-cap" \
  --budget-amount=10 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0 \
  --notifications-rule-pubsub-topic=projects/PROJECT_ID/topics/budget-alerts
```

- [ ] **Step 3: Deploy the budget-guard Cloud Function guarding all 6 services**

```bash
gcloud functions deploy budget-guard \
  --gen2 --runtime=nodejs20 --region=us-central1 \
  --source=deploy/gcp/budget-guard \
  --entry-point=budgetGuard \
  --trigger-topic=budget-alerts \
  --set-env-vars=REGION=us-central1,GUARDED_SERVICES=mykka-backend-staging,mykka-backend-prod,mykka-console-staging,mykka-console-prod,mykka-web-staging,mykka-web-prod
```
Run this *after* Tasks 10/13/16 create the 6 Cloud Run services — the function only needs to exist by the time real traffic (and therefore real spend) starts, but deploying it now is fine too since it no-ops until the budget topic fires.

- [ ] **Step 4: Verify**

```bash
gcloud billing budgets list --billing-account=$BILLING_ACCOUNT_ID
gcloud functions describe budget-guard --region=us-central1 --gen2
```
Expected: budget shows `$10` amount with two threshold rules; function shows `ACTIVE` state.

- [ ] **Step 5: Commit**

```bash
git add deploy/gcp/README.md
git commit -m "chore(deploy): retarget budget-guard to \$10 across staging+prod"
```

---

### Task 7: Template the Cloud Run YAMLs for two environments

**Files:**
- Modify: `deploy/gcp/backend-service.yaml`
- Modify: `deploy/gcp/console-service.yaml`
- Modify: `deploy/gcp/web-service.yaml`

**Interfaces:**
- Produces: three `envsubst`-ready YAML templates, each parameterized by `$REGION`, `$PROJECT_ID`, `$ENV_SUFFIX` (`-staging` or `-prod`), `$IMAGE_TAG` (`staging` or `master`), plus backend-specific `$APP_ENV` and `$CONSOLE_URL`. Consumed by Tasks 8, 11, 14 (manual first deploys) and Tasks 9, 12, 15 (CI workflows).

- [ ] **Step 1: Rewrite `deploy/gcp/backend-service.yaml`**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: mykka-backend${ENV_SUFFIX}
  labels:
    app: mykka
    component: backend
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "2"
        run.googleapis.com/cpu-throttling: "true"
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 30
      containers:
        - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/mykka/backend:${IMAGE_TAG}
          ports:
            - containerPort: 3000
          resources:
            limits:
              cpu: "1"
              memory: 512Mi
          env:
            - name: NODE_ENV
              value: production
            - name: APP_ENV
              value: ${APP_ENV}
            - name: PRETZEL_CONSOLE_URL
              value: ${CONSOLE_URL}
            - name: CORS_ORIGIN
              value: ${CONSOLE_URL}
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: backend-database-url${ENV_SUFFIX}
                  key: latest
            - name: CLERK_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: backend-clerk-secret-key${ENV_SUFFIX}
                  key: latest
            - name: CLERK_WEBHOOK_SECRET
              valueFrom:
                secretKeyRef:
                  name: backend-clerk-webhook-secret${ENV_SUFFIX}
                  key: latest
            - name: INTERNAL_SECRET
              valueFrom:
                secretKeyRef:
                  name: backend-internal-secret${ENV_SUFFIX}
                  key: latest
  traffic:
    - percent: 100
      latestRevision: true
```

- [ ] **Step 2: Rewrite `deploy/gcp/console-service.yaml`**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: mykka-console${ENV_SUFFIX}
  labels:
    app: mykka
    component: console
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "2"
        run.googleapis.com/cpu-throttling: "true"
    spec:
      containerConcurrency: 200
      timeoutSeconds: 10
      containers:
        - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/mykka/console:${IMAGE_TAG}
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: "1"
              memory: 256Mi
  traffic:
    - percent: 100
      latestRevision: true
```

- [ ] **Step 3: Rewrite `deploy/gcp/web-service.yaml`**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: mykka-web${ENV_SUFFIX}
  labels:
    app: mykka
    component: mykka-web
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "2"
        run.googleapis.com/cpu-throttling: "true"
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 30
      containers:
        - image: ${REGION}-docker.pkg.dev/${PROJECT_ID}/mykka/web:${IMAGE_TAG}
          ports:
            - containerPort: 3001
          resources:
            limits:
              cpu: "1"
              memory: 512Mi
          env:
            - name: NODE_ENV
              value: production
  traffic:
    - percent: 100
      latestRevision: true
```

- [ ] **Step 4: Verify the templates are valid YAML once substituted**

```bash
REGION=us-central1 PROJECT_ID=test-project ENV_SUFFIX=-staging IMAGE_TAG=staging APP_ENV=staging CONSOLE_URL=https://staging-console.mykka.ai \
  envsubst < deploy/gcp/backend-service.yaml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin); print('OK')"
```
Expected: `OK` printed, no YAML parse error. Repeat for `console-service.yaml` and `web-service.yaml` (drop `APP_ENV`/`CONSOLE_URL` — they're unused in those templates so leaving them set is harmless).

- [ ] **Step 5: Commit**

```bash
git add deploy/gcp/backend-service.yaml deploy/gcp/console-service.yaml deploy/gcp/web-service.yaml
git commit -m "chore(deploy): parameterize Cloud Run YAMLs for staging+prod envsubst"
```

---

### Task 8: First manual deploy of mykka-web to Cloud Run staging

**Files:** none (manual verification before wiring CI)

- [ ] **Step 1: Build and push the staging image**

```bash
cd mykka-web
gcloud auth configure-docker us-central1-docker.pkg.dev
docker build \
  --build-arg NEXT_PUBLIC_API_BASE=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_ENV=staging \
  -t us-central1-docker.pkg.dev/PROJECT_ID/mykka/web:staging .
docker push us-central1-docker.pkg.dev/PROJECT_ID/mykka/web:staging
cd ..
```
(`NEXT_PUBLIC_API_BASE` pointing at `localhost:3000` is a placeholder for this first smoke-test deploy only — Task 13 wires the real staging backend URL once it exists. This task is just proving the Dockerfile runs on Cloud Run.)

- [ ] **Step 2: Deploy it**

```bash
REGION=us-central1 PROJECT_ID=PROJECT_ID ENV_SUFFIX=-staging IMAGE_TAG=staging \
  envsubst < deploy/gcp/web-service.yaml > /tmp/web-service-staging.yaml
gcloud run services replace /tmp/web-service-staging.yaml --region=us-central1
gcloud run services add-iam-policy-binding mykka-web-staging --region=us-central1 \
  --member=allUsers --role=roles/run.invoker
```

- [ ] **Step 3: Verify**

```bash
URL=$(gcloud run services describe mykka-web-staging --region=us-central1 --format="value(status.url)")
curl -sI "$URL" | head -1
```
Expected: `HTTP/2 200`.

- [ ] **Step 4: Commit** — nothing to commit, this was a manual smoke test.

---

### Task 9: Wire mykka-web CI/CD to Cloud Run

**Files:**
- Modify: `.github/workflows/mykka-web-deploy.yml`

**Interfaces:**
- Consumes: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` secrets and `GCP_PROJECT_ID`, `GCP_REGION` variables from Task 4; `deploy/gcp/web-service.yaml` template from Task 7.

- [ ] **Step 1: Replace the `check` job's tail and add a `deploy` job**

Add after the existing `check` job in `.github/workflows/mykka-web-deploy.yml` (keep lint/build as-is — they're a real gate):

```yaml
  deploy:
    needs: check
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: ${{ github.ref_name == 'master' && 'production' || 'staging' }}
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker auth
        run: gcloud auth configure-docker ${{ vars.GCP_REGION }}-docker.pkg.dev

      - name: Set env vars
        run: |
          if [ "${{ github.ref_name }}" = "master" ]; then
            echo "ENV_SUFFIX=-prod" >> "$GITHUB_ENV"
            echo "IMAGE_TAG=master" >> "$GITHUB_ENV"
            echo "NEXT_PUBLIC_API_BASE=https://api.mykka.ai" >> "$GITHUB_ENV"
            echo "NEXT_PUBLIC_ENV=production" >> "$GITHUB_ENV"
          else
            echo "ENV_SUFFIX=-staging" >> "$GITHUB_ENV"
            echo "IMAGE_TAG=staging" >> "$GITHUB_ENV"
            echo "NEXT_PUBLIC_API_BASE=$(gcloud run services describe mykka-backend-staging --region=${{ vars.GCP_REGION }} --format='value(status.url)' 2>/dev/null || echo https://placeholder)" >> "$GITHUB_ENV"
            echo "NEXT_PUBLIC_ENV=staging" >> "$GITHUB_ENV"
          fi

      - name: Build and push
        run: |
          docker build \
            --build-arg NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
            --build-arg NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV \
            -t ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/mykka/web:$IMAGE_TAG \
            mykka-web
          docker push ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/mykka/web:$IMAGE_TAG

      - name: Render and deploy Cloud Run manifest
        run: |
          REGION=${{ vars.GCP_REGION }} PROJECT_ID=${{ vars.GCP_PROJECT_ID }} \
            envsubst < deploy/gcp/web-service.yaml > /tmp/web-service.yaml
          gcloud run services replace /tmp/web-service.yaml --region=${{ vars.GCP_REGION }}
          gcloud run services add-iam-policy-binding mykka-web$ENV_SUFFIX \
            --region=${{ vars.GCP_REGION }} --member=allUsers --role=roles/run.invoker

      - name: Notify Discord
        if: always()
        uses: sarisia/actions-status-discord@eb045afee445dc055c18d3d90bd0f244fd062708 # v1.16.0
        with:
          webhook: ${{ secrets.SHARED_DISCORD_WEBHOOK_URL }}
          status: ${{ job.status }}
          title: "mykka-web → ${{ github.ref_name == 'master' && 'production' || 'staging' }} (Cloud Run)"
          description: "Branch `${{ github.ref_name }}` · commit `${{ github.sha }}`"
```

Also update the existing `check` job's title-notify step text from "(Vercel)" to remove that suffix, since it's no longer accurate.

- [ ] **Step 2: Push to a branch and open a PR against `staging` to trigger the `check` job**

```bash
git checkout -b gcp-migration/mykka-web
git add .github/workflows/mykka-web-deploy.yml
git commit -m "ci(mykka-web): deploy to Cloud Run instead of relying on Vercel Git integration"
git push -u origin gcp-migration/mykka-web
gh pr create --base staging --title "ci(mykka-web): deploy to Cloud Run" --body "Wires mykka-web-deploy.yml to build/push/deploy to Cloud Run staging on merge."
```

- [ ] **Step 3: Verify after merge to `staging`**

Watch the Actions run: `gh run watch`. Expected: `deploy` job succeeds, then:
```bash
curl -sI https://mykka-web-staging-HASH.a.run.app | head -1
```
(get the exact URL from `gcloud run services describe mykka-web-staging --region=us-central1 --format="value(status.url)"`) — expected `HTTP/2 200`.

- [ ] **Step 4: Already committed in Step 2** — no further commit needed here.

---

### Task 10: Domain mapping + DNS cutover for mykka-web

**Files:** none (gcloud + DNS provider dashboard)

- [ ] **Step 1: Create domain mappings**

```bash
gcloud beta run domain-mappings create --service=mykka-web-staging --domain=staging.mykka.ai --region=us-central1
gcloud beta run domain-mappings create --service=mykka-web-prod --domain=mykka.ai --region=us-central1
gcloud beta run domain-mappings create --service=mykka-web-prod --domain=www.mykka.ai --region=us-central1
```
Each command prints the DNS records (A/AAAA or CNAME) to create.

- [ ] **Step 2: Update DNS at your registrar/DNS provider**

Replace the existing records pointing `staging.mykka.ai` / `mykka.ai` / `www.mykka.ai` at Vercel with the records `gcloud` printed in Step 1.

- [ ] **Step 3: Verify**

```bash
gcloud beta run domain-mappings describe --domain=mykka.ai --region=us-central1
curl -sI https://mykka.ai | head -1
curl -sI https://staging.mykka.ai | head -1
```
Expected: mapping status `Ready=True` (can take up to ~24h for DNS propagation + managed cert issuance — don't proceed to Task 19 decommissioning until this is confirmed working), both curls return `200`.

- [ ] **Step 4: Commit** — nothing to commit, DNS is external to the repo.

---

### Task 11: Fix stale API base + first manual deploy of pretzel-console to Cloud Run staging

**Files:**
- Modify: `pretzel-console/.env.prod` (local file, gitignored — not committed)

- [ ] **Step 1: Fix the stale `VITE_API_BASE`**

`pretzel-console/.env.prod` currently has `VITE_API_BASE=https://api.ciyo.ai` — a pre-rebrand domain. Change it to `VITE_API_BASE=https://api.mykka.ai`. This file is gitignored (local-only), so there's no commit for this edit — just fix it on disk before the next prod console build.

- [ ] **Step 2: Build and push the staging image**

```bash
cd pretzel-console
gcloud auth configure-docker us-central1-docker.pkg.dev
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY="$(grep '^VITE_CLERK_PUBLISHABLE_KEY=' .env.staging | cut -d= -f2-)" \
  --build-arg VITE_API_BASE=http://localhost:3000 \
  -t us-central1-docker.pkg.dev/PROJECT_ID/mykka/console:staging .
docker push us-central1-docker.pkg.dev/PROJECT_ID/mykka/console:staging
cd ..
```
(`VITE_API_BASE=http://localhost:3000` is a placeholder for this first smoke test — Task 13 wires the real staging backend URL.)

- [ ] **Step 3: Deploy it**

```bash
REGION=us-central1 PROJECT_ID=PROJECT_ID ENV_SUFFIX=-staging IMAGE_TAG=staging \
  envsubst < deploy/gcp/console-service.yaml > /tmp/console-service-staging.yaml
gcloud run services replace /tmp/console-service-staging.yaml --region=us-central1
gcloud run services add-iam-policy-binding mykka-console-staging --region=us-central1 \
  --member=allUsers --role=roles/run.invoker
```

- [ ] **Step 4: Verify**

```bash
URL=$(gcloud run services describe mykka-console-staging --region=us-central1 --format="value(status.url)")
curl -sI "$URL" | head -1
```
Expected: `HTTP/2 200` (the app will load but sign-in won't fully work yet — the staging backend isn't live until Task 13).

- [ ] **Step 5: Commit** — the `.env.prod` fix isn't committed (gitignored); nothing else to commit here.

---

### Task 12: Wire pretzel-console CI/CD to Cloud Run

**Files:**
- Modify: `.github/workflows/pretzel-console-deploy.yml`

- [ ] **Step 1: Replace the `deploy` job**

Replace the entire `deploy` job in `.github/workflows/pretzel-console-deploy.yml` (keep the `test` job as-is):

```yaml
  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: ${{ github.ref_name == 'master' && 'production' || 'staging' }}
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker auth
        run: gcloud auth configure-docker ${{ vars.GCP_REGION }}-docker.pkg.dev

      - name: Set env vars
        run: |
          if [ "${{ github.ref_name }}" = "master" ]; then
            echo "ENV_SUFFIX=-prod" >> "$GITHUB_ENV"
            echo "IMAGE_TAG=master" >> "$GITHUB_ENV"
            echo "VITE_API_BASE=https://api.mykka.ai" >> "$GITHUB_ENV"
          else
            echo "ENV_SUFFIX=-staging" >> "$GITHUB_ENV"
            echo "IMAGE_TAG=staging" >> "$GITHUB_ENV"
            echo "VITE_API_BASE=$(gcloud run services describe mykka-backend-staging --region=${{ vars.GCP_REGION }} --format='value(status.url)')" >> "$GITHUB_ENV"
          fi

      - name: Build and push
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.PRETZEL_CLERK_PUBLISHABLE_KEY }}
        run: |
          docker build \
            --build-arg VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY" \
            --build-arg VITE_API_BASE="$VITE_API_BASE" \
            -t ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/mykka/console:$IMAGE_TAG \
            pretzel-console
          docker push ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/mykka/console:$IMAGE_TAG

      - name: Render and deploy Cloud Run manifest
        run: |
          REGION=${{ vars.GCP_REGION }} PROJECT_ID=${{ vars.GCP_PROJECT_ID }} \
            envsubst < deploy/gcp/console-service.yaml > /tmp/console-service.yaml
          gcloud run services replace /tmp/console-service.yaml --region=${{ vars.GCP_REGION }}
          gcloud run services add-iam-policy-binding mykka-console$ENV_SUFFIX \
            --region=${{ vars.GCP_REGION }} --member=allUsers --role=roles/run.invoker

      - name: Notify Discord
        if: always()
        uses: sarisia/actions-status-discord@eb045afee445dc055c18d3d90bd0f244fd062708 # v1.16.0
        with:
          webhook: ${{ secrets.SHARED_DISCORD_WEBHOOK_URL }}
          status: ${{ job.status }}
          title: "pretzel-console → ${{ github.ref_name == 'master' && 'production' || 'staging' }} (Cloud Run)"
          description: "Branch `${{ github.ref_name }}` · commit `${{ github.sha }}`"
```

This uses the existing `PRETZEL_CLERK_PUBLISHABLE_KEY` secret already in place per `docs/ENVIRONMENT_AND_SECRETS.md` — no new secret needed.

- [ ] **Step 2: PR against `staging`, merge, verify**

```bash
git checkout -b gcp-migration/pretzel-console
git add .github/workflows/pretzel-console-deploy.yml
git commit -m "ci(pretzel-console): deploy to Cloud Run instead of Render deploy hook"
git push -u origin gcp-migration/pretzel-console
gh pr create --base staging --title "ci(pretzel-console): deploy to Cloud Run" --body "Wires pretzel-console-deploy.yml to build/push/deploy to Cloud Run staging on merge."
```

- [ ] **Step 3: Verify**

After merge, `gh run watch`, then confirm the deployed staging console loads and its bundle references the real staging backend URL (view page source or Network tab for API calls — should hit the `mykka-backend-staging` Cloud Run URL, not `localhost:3000`).

- [ ] **Step 4: Already committed in Step 2.**

---

### Task 13: First manual deploy of backend to Cloud Run staging

**Files:** none (manual verification before wiring CI)

- [ ] **Step 1: Build and push**

```bash
cd backend
docker build -t us-central1-docker.pkg.dev/PROJECT_ID/mykka/backend:staging .
docker push us-central1-docker.pkg.dev/PROJECT_ID/mykka/backend:staging
cd ..
```

- [ ] **Step 2: Deploy it**

```bash
REGION=us-central1 PROJECT_ID=PROJECT_ID ENV_SUFFIX=-staging IMAGE_TAG=staging \
  APP_ENV=staging CONSOLE_URL=https://staging-console.mykka.ai \
  envsubst < deploy/gcp/backend-service.yaml > /tmp/backend-service-staging.yaml
gcloud run services replace /tmp/backend-service-staging.yaml --region=us-central1
gcloud run services add-iam-policy-binding mykka-backend-staging --region=us-central1 \
  --member=allUsers --role=roles/run.invoker
```

- [ ] **Step 3: Verify — health check and DB connectivity**

```bash
URL=$(gcloud run services describe mykka-backend-staging --region=us-central1 --format="value(status.url)")
curl -sI "$URL/health" | head -1
```
Expected: `HTTP/2 200` (confirms the container boots, env validation in `src/env.ts` passes, and it can reach Neon — the server refuses to start otherwise since `DATABASE_URL` is required at boot per `backend/src/env.ts:5`).

Check logs if it fails:
```bash
gcloud run services logs read mykka-backend-staging --region=us-central1 --limit=50
```

- [ ] **Step 4: Re-run Task 9's and Task 12's staging deploys** (or just redeploy manually) now that a real `mykka-backend-staging` URL exists, so mykka-web-staging and pretzel-console-staging pick it up instead of their `localhost:3000` placeholder:

```bash
gh workflow run mykka-web-deploy.yml --ref staging
gh workflow run pretzel-console-deploy.yml --ref staging
```

- [ ] **Step 5: Commit** — nothing to commit, this was a manual smoke test.

---

### Task 14: Wire backend CI/CD to Cloud Run

**Files:**
- Modify: `.github/workflows/backend-deploy.yml`

**Interfaces:**
- Consumes: same GCP secrets/vars as Tasks 9 and 12; Secret Manager secrets from Task 5.

- [ ] **Step 1: Replace only the `Deploy to Render` step** in the `build-and-deploy` job — keep the `test` job, the destructive-migration guard, image build/push, and the migration/seed steps exactly as they are today, they're unrelated to the hosting provider:

Replace:
```yaml
      - name: Deploy to Render
        env:
          SERVICE_ID: ${{ secrets.BACKEND_RENDER_SERVICE_ID }}
          RENDER_API_KEY: ${{ secrets.SHARED_RENDER_API_KEY }}
          IMAGE_URL: ${{ env.IMAGE }}:${{ github.sha }}
        run: |
          HTTP_STATUS=$(curl --silent --show-error --write-out '%{http_code}' \
            -X POST \
            "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
            -H "Authorization: Bearer ${RENDER_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"imageUrl\": \"${IMAGE_URL}\"}" \
            -o /tmp/render-response.json)
          cat /tmp/render-response.json
          if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
            echo "Render deploy failed with HTTP $HTTP_STATUS"
            exit 1
          fi
```

With:
```yaml
      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker auth
        run: gcloud auth configure-docker ${{ vars.GCP_REGION }}-docker.pkg.dev

      - name: Push image to Artifact Registry
        run: |
          docker pull ${{ env.IMAGE }}:${{ github.sha }}
          docker tag ${{ env.IMAGE }}:${{ github.sha }} \
            ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/mykka/backend:${{ github.ref_name }}
          docker push ${{ vars.GCP_REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/mykka/backend:${{ github.ref_name }}

      - name: Set env vars
        run: |
          if [ "${{ github.ref_name }}" = "master" ]; then
            echo "ENV_SUFFIX=-prod" >> "$GITHUB_ENV"
            echo "APP_ENV=production" >> "$GITHUB_ENV"
            echo "CONSOLE_URL=https://pretzel-console.mykka.ai" >> "$GITHUB_ENV"
          else
            echo "ENV_SUFFIX=-staging" >> "$GITHUB_ENV"
            echo "APP_ENV=staging" >> "$GITHUB_ENV"
            echo "CONSOLE_URL=https://staging-console.mykka.ai" >> "$GITHUB_ENV"
          fi

      - name: Render and deploy Cloud Run manifest
        run: |
          REGION=${{ vars.GCP_REGION }} PROJECT_ID=${{ vars.GCP_PROJECT_ID }} \
            IMAGE_TAG=${{ github.ref_name }} APP_ENV=$APP_ENV CONSOLE_URL=$CONSOLE_URL \
            envsubst < deploy/gcp/backend-service.yaml > /tmp/backend-service.yaml
          gcloud run services replace /tmp/backend-service.yaml --region=${{ vars.GCP_REGION }}
          gcloud run services add-iam-policy-binding mykka-backend$ENV_SUFFIX \
            --region=${{ vars.GCP_REGION }} --member=allUsers --role=roles/run.invoker
```

Also add `id-token: write` to the job's `permissions:` block (needed for the GCP auth step) and pull the image from GHCR — the existing `IMAGE` env var already points at GHCR, this step re-tags and re-pushes it into Artifact Registry rather than building twice.

- [ ] **Step 2: PR against `staging`, merge, verify**

```bash
git checkout -b gcp-migration/backend
git add .github/workflows/backend-deploy.yml
git commit -m "ci(backend): deploy to Cloud Run instead of Render API"
git push -u origin gcp-migration/backend
gh pr create --base staging --title "ci(backend): deploy to Cloud Run" --body "Wires backend-deploy.yml to push into Artifact Registry and deploy to Cloud Run staging on merge, replacing the Render API deploy call."
```

- [ ] **Step 3: Verify**

After merge: `gh run watch`, then:
```bash
curl -s https://mykka-backend-staging-HASH.a.run.app/health
```
Expected: `200`. Then run a real smoke test — sign in via `staging-console.mykka.ai` (once Task 16 maps its domain) or hit an authenticated API route with a staging Clerk session, confirming the full auth chain (Clerk → backend → Neon) works end-to-end on Cloud Run.

- [ ] **Step 4: Already committed in Step 2.**

---

### Task 15: Domain mapping for backend production + console (both envs)

**Files:** none (gcloud + DNS provider dashboard)

- [ ] **Step 1: Map domains**

```bash
gcloud beta run domain-mappings create --service=mykka-backend-prod --domain=api.mykka.ai --region=us-central1
gcloud beta run domain-mappings create --service=mykka-console-prod --domain=pretzel-console.mykka.ai --region=us-central1
gcloud beta run domain-mappings create --service=mykka-console-staging --domain=staging-console.mykka.ai --region=us-central1
```
(Backend staging deliberately gets no custom domain — matches today's Render staging, which also has none; apps reference it via the raw `*.run.app` URL.)

- [ ] **Step 2: Update DNS**

Replace the existing records for `api.mykka.ai`, `pretzel-console.mykka.ai`, and add a new record for `staging-console.mykka.ai`, using the records `gcloud` printed in Step 1.

- [ ] **Step 3: Verify**

```bash
for d in api.mykka.ai pretzel-console.mykka.ai staging-console.mykka.ai; do
  echo "== $d =="; curl -sI "https://$d" | head -1
done
```
Expected: `200` for each, once DNS propagates and the managed cert issues (can take up to ~24h).

- [ ] **Step 4: Commit** — nothing to commit.

---

### Task 16: Production QA pass on GCP before decommissioning anything

**Files:** none (manual/QA verification)

- [ ] **Step 1: Deploy backend, console, and web to production** by merging the respective `gcp-migration/*` work into `master` (each workflow's `deploy` job already branches on `github.ref_name == 'master'` to target the `-prod` services).

- [ ] **Step 2: Run the existing QA suite against the new production URLs**

Per `AGENTS.md` regression rules and `qa/README.md`:
```bash
cd qa
pnpm test:qa
```
Point its target config at the live `mykka.ai` / `api.mykka.ai` / `pretzel-console.mykka.ai` domains (same domains as before — only the backing infra changed, so QA config shouldn't need edits beyond confirming it's not hardcoded to a `.onrender.com` URL anywhere).

- [ ] **Step 3: Manual smoke test of the golden path**

Sign up / sign in via `pretzel-console.mykka.ai`, confirm a policy publish flows through to the backend, confirm `mykka.ai` marketing pages load, confirm billing/PayPal flow if applicable.

- [ ] **Step 4: Let it run clean for a few days** before Task 17. This is a soak period, not an active step — just don't decommission Render/Vercel yet.

---

### Task 17: Decommission Render and Vercel

**Files:**
- Modify: `docs/CURRENT_STATE.md` (Deployment Model section)
- Modify: `docs/ENVIRONMENT_AND_SECRETS.md` (rotation section, secret inventory — Render/Vercel references)

- [ ] **Step 1: Delete the Render services** (backend prod+staging, console prod+staging) via the Render dashboard, and disconnect/delete the Vercel project for mykka-web.

- [ ] **Step 2: Remove now-dead GitHub secrets**

```bash
gh secret remove BACKEND_RENDER_SERVICE_ID
gh secret remove CONSOLE_RENDER_DEPLOY_HOOK
gh secret remove SHARED_RENDER_API_KEY
```
Keep `BACKEND_DATABASE_URL` if anything still reads it (check for stragglers with `grep -rn "BACKEND_DATABASE_URL" .github/workflows`); it may still be used by the migration step in `backend-deploy.yml`'s `test`/`build-and-deploy` jobs, in which case leave it as-is — it's a Neon URL, not a Render-specific secret.

- [ ] **Step 3: Update `docs/CURRENT_STATE.md`**

Change the "Deployment Model" section:
```markdown
## Deployment Model

- Backend: Docker image built in GitHub Actions, pushed to GHCR and Artifact Registry, deployed to Cloud Run (GCP).
- Console: Docker image built in GitHub Actions, deployed to Cloud Run (GCP).
- Website: Docker image built in GitHub Actions, deployed to Cloud Run (GCP).
- Extension: production build attached to a GitHub Release, then manually uploaded to Chrome Web Store.
```

- [ ] **Step 4: Update `docs/ENVIRONMENT_AND_SECRETS.md`**

Remove the Render/Vercel-specific rows from the secrets inventory table and rotation checklist; add the GCP secrets (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`) and note that runtime secrets now live in Secret Manager rather than the Render/Vercel dashboards.

- [ ] **Step 5: Verify**

```bash
pnpm docs:check
```
Expected: passes (per `AGENTS.md`'s regression rule: "Documentation changes: run `pnpm docs:check` from the repository root").

- [ ] **Step 6: Commit**

```bash
git add docs/CURRENT_STATE.md docs/ENVIRONMENT_AND_SECRETS.md
git commit -m "docs: update deployment model to GCP Cloud Run, remove decommissioned Render/Vercel references"
```

---

## Notes for whoever executes this

- Tasks 1-6 are one-time GCP foundation work — do them in order, once.
- Tasks 7-10 (mykka-web), 11-12+15 (console), 13-14+15 (backend) can mostly proceed in parallel once Tasks 1-7 are done, but **backend should go last in practice** — it's the highest-risk piece (auth, billing, DB), and the console/web migrations are good low-stakes practice runs for the GitHub Actions + Cloud Run pattern before touching it.
- Every `PROJECT_ID` / `PROJECT_NUMBER` placeholder in this plan is literal — substitute the real values once known in Task 1, and keep them consistent across every subsequent task.
- If any step's actual `gcloud`/`docker` output differs from what's documented here (API surface changes, flag renames), trust the tool's own error message over this plan and adjust — this plan was written from current `gcloud`/`docker`/GitHub Actions knowledge as of writing, not verified against a live GCP project.
