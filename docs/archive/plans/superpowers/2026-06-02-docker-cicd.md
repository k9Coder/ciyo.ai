# Docker, CI/CD & Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lean Docker images for all deployable services, a root `docker-compose.yml` for local full-stack dev, GitHub Actions CI/CD pipelines that deploy to Render on push to `staging`/`master`, Discord deploy notifications, a semi-automated Chrome extension release workflow, and update all READMEs with deployment instructions.

**Architecture:** Each deployable service gets a multi-stage Dockerfile (build stage compiles, runtime stage carries only prod output + deps). Images are pushed to `ghcr.io` (GitHub's free registry) by CI and pulled by Render. The extension release flow triggers on a git tag and produces a zip artifact attached to a GitHub Release. The GCP Cloud Run migration plan lives in the spec doc and is not implemented here.

**Tech Stack:** Docker (multi-stage, BuildKit), nginx:alpine, pnpm@9, GitHub Actions, ghcr.io, Render Web Service + Static Site, `sarisia/actions-status-discord@v1`, `softprops/action-gh-release@v2`, `docker/build-push-action@v5`

**Spec:** `docs/superpowers/specs/2026-06-02-docker-cicd-design.md`

---

## Task 1: backend Dockerfile + .dockerignore

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Context:** Fastify API, TypeScript, pnpm@9. Build script is `pnpm build` (runs `tsc`). Start command is `node dist/index.js`. Port 3000. The `drizzle/` folder must be in the runtime image because `src/db/migrate.ts` resolves migration files relative to `dist/db/` at `join(__dirname, '../../drizzle')`. DB migrations run in CI (Task 6), not inside the container — but the folder must exist for ad-hoc manual migration runs from a container.

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9 --quiet
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install -g pnpm@9 --quiet
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `backend/.dockerignore`**

```
node_modules
dist
.env*
tests
e2e
*.md
.vscode
.github
scripts
drizzle.config.ts
playwright.config.ts
vitest.config.ts
```

- [ ] **Step 3: Build the image locally to verify it compiles**

Run from the repo root:
```bash
docker build -t pretzel-api-test ./backend
```
Expected: build completes with no errors, two stages complete.

- [ ] **Step 4: Verify the image starts**

```bash
docker run --rm \
  -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/promptshield \
  -e PORT=3000 \
  -p 3000:3000 \
  pretzel-api-test
```
Expected: server starts, logs something like `Server listening at http://0.0.0.0:3000`. It will fail to connect to DB (that's fine — just confirm it starts without import errors). `Ctrl+C` to stop.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(backend): add lean multi-stage Dockerfile"
```

---

## Task 2: pretzel-console Dockerfile + .dockerignore + nginx.conf

**Files:**
- Create: `pretzel-console/Dockerfile`
- Create: `pretzel-console/.dockerignore`
- Create: `pretzel-console/nginx.conf`

**Context:** Vite SPA. Build script is `pnpm build:prod`. Output goes to `dist/`. Final runtime image is nginx:alpine serving static files. This Dockerfile is used only for `docker-compose` local dev — Render Static Site builds from source directly (Render handles `pnpm build:staging` / `pnpm build:prod` itself). `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE` are Vite env vars baked at build time, so they must be passed as build args.

- [ ] **Step 1: Create `pretzel-console/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
}
```

- [ ] **Step 2: Create `pretzel-console/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9 --quiet
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_BASE
RUN pnpm build:prod

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Create `pretzel-console/.dockerignore`**

```
node_modules
dist
.env*
e2e
*.md
.vscode
.github
playwright.config.ts
vitest.config.ts
```

- [ ] **Step 4: Build the image locally to verify it compiles**

Run from repo root (replace key with your actual staging Clerk key from `pretzel-console/.env`):
```bash
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_test_placeholder \
  --build-arg VITE_API_BASE=http://localhost:3000 \
  -t pretzel-console-test \
  ./pretzel-console
```
Expected: build completes, Vite build output shows files written to dist/.

- [ ] **Step 5: Verify nginx serves the SPA**

```bash
docker run --rm -p 5173:80 pretzel-console-test
```
Open http://localhost:5173 in browser. Expected: app loads (may show Clerk errors without a real key — that is fine, just confirms nginx serves `index.html`). `Ctrl+C` to stop.

- [ ] **Step 6: Commit**

```bash
git add pretzel-console/Dockerfile pretzel-console/.dockerignore pretzel-console/nginx.conf
git commit -m "feat(pretzel-console): add multi-stage Dockerfile with nginx"
```

---

## Task 3: mykka-web Dockerfile + .dockerignore + next.config.ts

**Files:**
- Modify: `mykka-web/next.config.ts`
- Create: `mykka-web/Dockerfile`
- Create: `mykka-web/.dockerignore`

**Context:** Next.js 16 app. Currently deployed on Vercel — Dockerfile is for local `docker-compose` only. Next.js `output: 'standalone'` mode copies only what's needed to run the app (no `node_modules` bloat). `NEXT_PUBLIC_*` vars are baked at build time so must be passed as build args. The standalone output entrypoint is `.next/standalone/server.js`.

- [ ] **Step 1: Update `mykka-web/next.config.ts` to enable standalone output**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 2: Create `mykka-web/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9 --quiet
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_ENV
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
```

- [ ] **Step 3: Create `mykka-web/.dockerignore`**

```
node_modules
.next
.env*
*.md
.vscode
.github
eslint.config.mjs
```

- [ ] **Step 4: Build the image locally**

Run from repo root:
```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_ENV=development \
  -t mykka-web-test \
  ./mykka-web
```
Expected: build completes, standalone output generated.

- [ ] **Step 5: Verify Next.js starts**

```bash
docker run --rm -p 3001:3001 mykka-web-test
```
Open http://localhost:3001. Expected: marketing site loads. `Ctrl+C` to stop.

- [ ] **Step 6: Commit**

```bash
git add mykka-web/next.config.ts mykka-web/Dockerfile mykka-web/.dockerignore
git commit -m "feat(mykka-web): add standalone Dockerfile, enable next standalone output"
```

---

## Task 4: Root docker-compose.yml + .dockerignore

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `.dockerignore` (repo root)

**Context:** Spins up the full stack locally: postgres + backend + pretzel-console + mykka-web. The backend `env_file` loads `./backend/.env` so developers must have that file — if not, run `cp backend/.env.example backend/.env` first. The `DATABASE_URL` in `environment:` overrides whatever is in `.env`, pointing at the compose postgres service. pretzel-console and mykka-web build args use `localhost` URLs because these are accessed from the host browser, not container-to-container.

- [ ] **Step 1: Create `docker-compose.yml` at the repo root**

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: promptshield
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/promptshield
      PORT: '3000'
    env_file:
      - ./backend/.env
    depends_on:
      postgres:
        condition: service_healthy

  pretzel-console:
    build:
      context: ./pretzel-console
      dockerfile: Dockerfile
      args:
        VITE_CLERK_PUBLISHABLE_KEY: ${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_placeholder}
        VITE_API_BASE: http://localhost:3000
    ports:
      - '5173:80'
    depends_on:
      - backend

  mykka-web:
    build:
      context: ./mykka-web
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_BASE: http://localhost:3000
        NEXT_PUBLIC_ENV: development
    ports:
      - '3001:3001'

volumes:
  postgres_data:
```

- [ ] **Step 2: Create `.dockerignore` at the repo root**

```
node_modules
**/node_modules
**/.git
**/.env*
**/dist
**/.next
**/playwright-report
**/test-results
```

- [ ] **Step 3: Ensure backend .env exists**

```bash
# Only needed on first run
cp backend/.env.example backend/.env
# Then edit backend/.env and fill in Clerk, Stripe, etc. keys for local dev
```

- [ ] **Step 4: Start the full stack and verify all services come up**

```bash
docker-compose up --build
```
Expected output (in order):
1. `postgres` — "database system is ready to accept connections"
2. `backend` — "Server listening at http://0.0.0.0:3000"
3. `pretzel-console` — nginx starts
4. `mykka-web` — Next.js starts

Verify manually:
- http://localhost:3000/health → `{ "status": "ok" }` (or 200)
- http://localhost:5173 → pretzel-console loads
- http://localhost:3001 → mykka-web loads

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .dockerignore
git commit -m "feat: add root docker-compose for full local stack"
```

---

## Task 5: One-time Render setup (manual steps — not automated)

**Context:** These steps are done once in a browser. They are prerequisites for Tasks 6 and 7. Document the service IDs and deploy hooks — you will need them as GitHub Secrets in Task 6.

- [ ] **Step 1: Create a Render account at render.com if you don't have one**

- [ ] **Step 2: Create the backend staging Web Service**

1. New → Web Service → "Deploy an existing image from a registry"
2. Image URL: `ghcr.io/<your-github-org>/<repo-name>/backend:staging`
3. Name: `pretzel-api-staging`
4. Instance type: Free
5. Environment variables: add all variables from `backend/.env.example` with staging values
6. Save → note the Service ID from the URL: `https://dashboard.render.com/web/srv-XXXX` → ID is `srv-XXXX`

- [ ] **Step 3: Create the backend production Web Service**

Same as Step 2 but:
- Image URL: `ghcr.io/<your-github-org>/<repo-name>/backend:master`
- Name: `pretzel-api-prod`
- Environment variables: production values
- Note the Service ID: `srv-YYYY`

- [ ] **Step 4: Create the pretzel-console staging Static Site**

1. New → Static Site → connect GitHub repo
2. Branch: `staging`
3. Root directory: `pretzel-console`
4. Build command: `pnpm install --frozen-lockfile && pnpm build:staging`
5. Publish directory: `dist`
6. Environment variables: `VITE_CLERK_PUBLISHABLE_KEY` (staging key), `VITE_API_BASE` (staging backend URL)
7. Settings → Deploy hooks → Create deploy hook → copy the full URL (e.g. `https://api.render.com/deploy/sta-XXXX?key=YYYY`)

- [ ] **Step 5: Create the pretzel-console production Static Site**

Same as Step 4 but:
- Branch: `master`
- Build command: `pnpm install --frozen-lockfile && pnpm build:prod`
- Environment variables: production values
- Create deploy hook → copy the URL

- [ ] **Step 6: Get a Render API key**

Render Dashboard → Account Settings → API Keys → Create API Key → copy it.

- [ ] **Step 7: Set up Discord webhook**

1. Open your Discord server → Edit the channel you want notifications in
2. Integrations → Webhooks → New Webhook → copy the URL

- [ ] **Step 8: Add all GitHub Secrets**

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add each of these:
```
RENDER_API_KEY                     ← from Step 6
RENDER_BACKEND_STAGING_SERVICE_ID  ← srv-XXXX from Step 2
RENDER_BACKEND_PROD_SERVICE_ID     ← srv-YYYY from Step 3
RENDER_CONSOLE_STAGING_DEPLOY_HOOK ← full URL from Step 4
RENDER_CONSOLE_PROD_DEPLOY_HOOK    ← full URL from Step 5
STAGING_DATABASE_URL               ← staging postgres connection string
PROD_DATABASE_URL                  ← production postgres connection string
DISCORD_WEBHOOK_URL                ← from Step 7
VITE_CLERK_PUBLISHABLE_KEY_PROD    ← pk_live_... (for extension release build)
VITE_API_BASE_PROD                 ← https://api.mykka.ai (or wherever prod backend lives)
```

---

## Task 6: backend-deploy.yml

**Files:**
- Create: `.github/workflows/backend-deploy.yml`

**Context:** Triggers on push to `master` or `staging` when `backend/` files change. Runs vitest, builds and pushes Docker image to ghcr.io, runs DB migrations using `tsx` against the target DB, then calls Render API to deploy the exact image SHA. Discord notification at the end (always, whether success or failure).

- [ ] **Step 1: Create `.github/workflows/backend-deploy.yml`**

```yaml
name: Deploy Backend

on:
  push:
    branches: [master, staging]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-deploy.yml'

env:
  IMAGE: ghcr.io/${{ github.repository }}/backend

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
          cache-dependency-path: backend/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: backend

      - name: Run tests
        run: pnpm test
        working-directory: backend

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
          cache-dependency-path: backend/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: backend

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3

      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ github.sha }}
            ${{ env.IMAGE }}:${{ github.ref_name }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Run DB migrations
        run: pnpm exec tsx src/db/migrate.ts
        working-directory: backend
        env:
          DATABASE_URL: ${{ github.ref_name == 'master' && secrets.PROD_DATABASE_URL || secrets.STAGING_DATABASE_URL }}

      - name: Deploy to Render
        env:
          SERVICE_ID: ${{ github.ref_name == 'master' && secrets.RENDER_BACKEND_PROD_SERVICE_ID || secrets.RENDER_BACKEND_STAGING_SERVICE_ID }}
        run: |
          curl -f -X POST \
            "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
            -H "Authorization: Bearer ${{ secrets.RENDER_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{\"imageUrl\": \"${{ env.IMAGE }}:${{ github.sha }}\"}"

      - name: Notify Discord
        if: always()
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_URL }}
          status: ${{ job.status }}
          title: "Backend → ${{ github.ref_name == 'master' && 'production' || 'staging' }}"
          description: "Branch `${{ github.ref_name }}` · commit `${{ github.sha }}`"
```

- [ ] **Step 2: Push to staging branch to trigger the workflow**

```bash
git add .github/workflows/backend-deploy.yml
git commit -m "feat(ci): add backend deploy workflow"
git push origin staging
```

Expected: workflow appears in GitHub → Actions tab, runs test + build-and-deploy jobs, deploys to Render staging, sends Discord notification.

- [ ] **Step 3: Verify Render staging service is running the new image**

In Render dashboard, staging service → Deploys → confirm latest deploy shows the git SHA from your push.

---

## Task 7: pretzel-console-deploy.yml

**Files:**
- Create: `.github/workflows/pretzel-console-deploy.yml`

**Context:** Triggers on push to `master` or `staging` when `pretzel-console/` changes. Runs vitest + typecheck, then triggers a Render Static Site deploy hook. Render builds from source on its side (using `pnpm build:staging` or `pnpm build:prod` as configured in the Render dashboard — Task 5 Step 4/5). No Docker image needed for static hosting.

- [ ] **Step 1: Create `.github/workflows/pretzel-console-deploy.yml`**

```yaml
name: Deploy pretzel-console

on:
  push:
    branches: [master, staging]
    paths:
      - 'pretzel-console/**'
      - '.github/workflows/pretzel-console-deploy.yml'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
          cache-dependency-path: pretzel-console/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: pretzel-console

      - name: Run tests
        run: pnpm test
        working-directory: pretzel-console

      - name: Typecheck
        run: pnpm typecheck
        working-directory: pretzel-console

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render deploy
        env:
          DEPLOY_HOOK: ${{ github.ref_name == 'master' && secrets.RENDER_CONSOLE_PROD_DEPLOY_HOOK || secrets.RENDER_CONSOLE_STAGING_DEPLOY_HOOK }}
        run: curl -f -X POST "$DEPLOY_HOOK"

      - name: Notify Discord
        if: always()
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_URL }}
          status: ${{ job.status }}
          title: "pretzel-console → ${{ github.ref_name == 'master' && 'production' || 'staging' }}"
          description: "Branch `${{ github.ref_name }}` · commit `${{ github.sha }}`"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pretzel-console-deploy.yml
git commit -m "feat(ci): add pretzel-console deploy workflow"
```

---

## Task 8: mykka-web-deploy.yml

**Files:**
- Create: `.github/workflows/mykka-web-deploy.yml`

**Context:** Vercel already auto-deploys when you push. This workflow is a test gate (runs lint + build to catch type errors before Vercel deploys) and a Discord notification layer. The `pnpm build` command in Next.js also runs the TypeScript compiler, so it catches type errors.

- [ ] **Step 1: Create `.github/workflows/mykka-web-deploy.yml`**

```yaml
name: Deploy mykka-web

on:
  push:
    branches: [master, staging]
    paths:
      - 'mykka-web/**'
      - '.github/workflows/mykka-web-deploy.yml'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
          cache-dependency-path: mykka-web/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: mykka-web

      - name: Lint
        run: pnpm lint
        working-directory: mykka-web

      - name: Build (type-check)
        run: pnpm build
        working-directory: mykka-web
        env:
          NEXT_PUBLIC_API_BASE: http://localhost:3000
          NEXT_PUBLIC_ENV: staging

      - name: Notify Discord
        if: always()
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_URL }}
          status: ${{ job.status }}
          title: "mykka-web → ${{ github.ref_name == 'master' && 'production' || 'staging' }} (Vercel)"
          description: "Branch `${{ github.ref_name }}` · commit `${{ github.sha }}`"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/mykka-web-deploy.yml
git commit -m "feat(ci): add mykka-web check + discord notification workflow"
```

---

## Task 9: pretzel-release.yml

**Files:**
- Create: `.github/workflows/pretzel-release.yml`

**Context:** Triggered by a version tag matching `pretzel-v*` (e.g. `pretzel-v2.1.0`). Builds the extension in prod mode, zips the dist/ folder, creates a GitHub Release with the zip attached. The developer then downloads the zip and uploads it to the Chrome Web Store manually.

- [ ] **Step 1: Create `.github/workflows/pretzel-release.yml`**

```yaml
name: Release Pretzel Extension

on:
  push:
    tags:
      - 'pretzel-v*'

jobs:
  build-release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
          cache-dependency-path: pretzel/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: pretzel

      - name: Build extension
        run: pnpm build:prod
        working-directory: pretzel
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY_PROD }}
          VITE_API_BASE: ${{ secrets.VITE_API_BASE_PROD }}

      - name: Zip extension
        run: cd pretzel/dist && zip -r ../../${{ github.ref_name }}.zip .

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ github.ref_name }}.zip
          generate_release_notes: true
          name: ${{ github.ref_name }}

      - name: Notify Discord
        if: always()
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_URL }}
          status: ${{ job.status }}
          title: "${{ github.ref_name }} build ready"
          description: "Extension ZIP attached to GitHub Release. Download and upload to Chrome Web Store."
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pretzel-release.yml
git commit -m "feat(ci): add pretzel extension release workflow"
```

- [ ] **Step 3: Smoke test the workflow with a test tag**

```bash
git tag pretzel-v0.0.0-test
git push --tags
```
Expected: workflow runs, a GitHub Release `pretzel-v0.0.0-test` is created with a zip file attached. Delete the test tag/release afterwards:
```bash
git tag -d pretzel-v0.0.0-test
git push origin :refs/tags/pretzel-v0.0.0-test
```
Then delete the release in GitHub UI → Releases → `pretzel-v0.0.0-test` → Delete release.

---

## Task 10: Update e2e.yml

**Files:**
- Modify: `.github/workflows/e2e.yml`

**Context:** The existing e2e workflow references `admin/` which no longer exists (renamed to `pretzel-console/`). Update all references.

- [ ] **Step 1: Replace all `admin` references in `.github/workflows/e2e.yml`**

Open `.github/workflows/e2e.yml`. Make these exact replacements:

Replace the step:
```yaml
      - name: Install admin dependencies
        run: pnpm install
        working-directory: admin
```
With:
```yaml
      - name: Install pretzel-console dependencies
        run: pnpm install
        working-directory: pretzel-console
```

Replace the step:
```yaml
      - name: Build admin app
        run: pnpm run build
        working-directory: admin
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: http://localhost:3000
```
With:
```yaml
      - name: Build pretzel-console
        run: pnpm run build:staging
        working-directory: pretzel-console
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: http://localhost:3000
```

Replace the step:
```yaml
      - name: Serve admin app
        run: pnpm run preview -- --port 5173 &
        working-directory: admin
```
With:
```yaml
      - name: Serve pretzel-console
        run: pnpm run preview -- --port 5173 &
        working-directory: pretzel-console
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "fix(ci): update e2e workflow to use pretzel-console instead of admin"
```

---

## Task 11: README updates

**Files:**
- Modify: `README.md` (root)
- Modify: `backend/README.md`
- Modify: `pretzel-console/README.md`
- Modify: `pretzel/README.md`
- Modify: `mykka-web/README.md`

**Context:** Add a "Deployment & Releases" section to each README. The root README already has a good structure — append a Docker section. The package READMEs may not exist yet — create them if missing.

- [ ] **Step 1: Add docker-compose section to root `README.md`**

Add this section after the existing "Tests" section:

```markdown
---

## Running the full stack with Docker

One command starts everything — postgres, backend, pretzel-console, and mykka-web:

```bash
# First time only
cp backend/.env.example backend/.env
# Fill in backend/.env with Clerk, Stripe, and LLM keys

docker-compose up --build
```

| Service | URL |
|---|---|
| Backend API | http://localhost:3000 |
| pretzel-console | http://localhost:5173 |
| mykka-web | http://localhost:3001 |
| Postgres | localhost:5432 |

> For daily development, run `pnpm dev` per package instead — Docker is for full-stack demos and integration testing.
```

- [ ] **Step 2: Add deployment section to `backend/README.md`** (create the file if it doesn't exist)

```markdown
## Deployment

Pushes to `staging` or `master` trigger `.github/workflows/backend-deploy.yml` automatically.

| Branch | Environment |
|---|---|
| `staging` | Render staging service |
| `master` | Render production service |

**Pipeline steps:** run tests → build Docker image → push to `ghcr.io` → run DB migrations → deploy to Render → Discord notification.

### Running migrations manually

```bash
DATABASE_URL=<your-db-url> pnpm exec tsx src/db/migrate.ts
```

### GitHub Secrets required

| Secret | Where to get it |
|---|---|
| `RENDER_API_KEY` | Render → Account Settings → API Keys |
| `RENDER_BACKEND_STAGING_SERVICE_ID` | Render service URL: `dashboard.render.com/web/srv-XXXX` |
| `RENDER_BACKEND_PROD_SERVICE_ID` | Same, for prod service |
| `STAGING_DATABASE_URL` | Staging Postgres connection string |
| `PROD_DATABASE_URL` | Production Postgres connection string |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → Webhooks |
```

- [ ] **Step 3: Add deployment section to `pretzel-console/README.md`** (create if missing)

```markdown
## Deployment

Pushes to `staging` or `master` trigger `.github/workflows/pretzel-console-deploy.yml` automatically.

| Branch | Environment | Build command |
|---|---|---|
| `staging` | Render Static Site (staging) | `pnpm build:staging` |
| `master` | Render Static Site (production) | `pnpm build:prod` |

**Pipeline:** run tests + typecheck → trigger Render deploy hook → Render builds from source → Discord notification.

Environment variables (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE`) are set in the Render dashboard per environment — not in GitHub Secrets.

### GitHub Secrets required

| Secret | Where to get it |
|---|---|
| `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` | Render staging Static Site → Settings → Deploy Hooks |
| `RENDER_CONSOLE_PROD_DEPLOY_HOOK` | Render prod Static Site → Settings → Deploy Hooks |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → Webhooks |
```

- [ ] **Step 4: Add release section to `pretzel/README.md`** (create if missing)

```markdown
## Releasing a New Version

1. **Bump the version** in `manifest.config.ts`:
   ```ts
   version: "2.1.0",
   ```

2. **Commit and push to `master`:**
   ```bash
   git add pretzel/manifest.config.ts
   git commit -m "chore(pretzel): bump version to 2.1.0"
   git push origin master
   ```

3. **Tag the release** (this triggers the build):
   ```bash
   git tag pretzel-v2.1.0
   git push --tags
   ```

4. **GitHub Actions builds the extension** and creates a GitHub Release with `pretzel-v2.1.0.zip` attached. You will get a Discord notification when it's ready.

5. **Upload to Chrome Web Store:**
   - Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Select the Pretzel extension
   - "Upload new package" → download and upload the `.zip` from GitHub Releases
   - Fill in release notes
   - Submit for review (Google typically reviews in 1–3 business days)

### GitHub Secrets required

| Secret | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY_PROD` | `pk_live_...` (production Clerk publishable key) |
| `VITE_API_BASE_PROD` | `https://api.mykka.ai` (or wherever the prod backend is) |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook URL |
```

- [ ] **Step 5: Add deployment section to `mykka-web/README.md`** (create if missing)

```markdown
## Deployment

mykka-web deploys automatically via **Vercel** when you push to `master` or `staging`.

- `staging` branch → Vercel preview URL
- `master` branch → production (`mykka.ai` or your configured domain)

`.github/workflows/mykka-web-deploy.yml` runs lint + build as a test gate before Vercel deploys. If the build fails in CI, Vercel still deploys — fix the failure and push again.

Vercel environment variables (`NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_ENV`) are configured in the Vercel dashboard.
```

- [ ] **Step 6: Commit all README updates**

```bash
git add README.md backend/README.md pretzel-console/README.md pretzel/README.md mykka-web/README.md
git commit -m "docs: add deployment and release instructions to all READMEs"
```
