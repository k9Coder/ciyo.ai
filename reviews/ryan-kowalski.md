# Infrastructure & Security Review — Ryan Kowalski (DevOps/Platform Engineer)

**Date:** 2026-06-08
**Reviewer:** Ryan Kowalski — DevOps/Platform Engineer, ciyo.ai
**Scope:** Docker configs, nginx, CI/CD pipelines, DB client, logger

---

#### `docker-compose.yml` — Local development / compose stack

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **Hardcoded plaintext credentials (lines 5–7, 25).** `POSTGRES_PASSWORD: postgres` and the full connection string `postgresql://postgres:postgres@postgres:5432/promptshield` are committed in plain text. Even in a dev-only compose file this is a bad habit — engineers clone repos, spin it up, and forget it's not for prod. More critically, anyone who runs `docker inspect` or `docker-compose config` on a CI runner sees these values in the output.

  2. **`DATABASE_URL` double-set (lines 25–27).** The `environment` block hardcodes `DATABASE_URL`, then `env_file: ./backend/.env` is also loaded. If the `.env` file also contains `DATABASE_URL` the compose `environment` key wins (compose precedence), which means the `.env` value is silently ignored. This is a latent ops footgun — someone updates `.env` thinking they changed the DB, but compose keeps using the hardcoded value.

  3. **No `restart` policy.** None of the services declare `restart: unless-stopped` (or `on-failure`). In a compose-based staging environment the backend and DB won't recover after a crash or host reboot without manual intervention.

  4. **Postgres port 5432 bound to `0.0.0.0` (line 8).** `- '5432:5432'` publishes Postgres to every interface on the host. On a cloud VM or shared dev machine this exposes the DB to any process (or network) that can reach the host. Should be `- '127.0.0.1:5432:5432'` for dev, or the port should be dropped entirely — the backend reaches Postgres over the internal Docker network.

  5. **No resource limits.** Compose services have no `mem_limit` / `cpus` caps. A runaway Postgres or backend process can OOM the host and bring everything down.

  **Proposed changes:**
  - Replace inline credentials with a `.env` file reference (`env_file`) or Docker secrets; never commit passwords to compose.
  - Remove the duplicate `DATABASE_URL` from `environment:` and rely solely on `env_file`.
  - Add `restart: unless-stopped` to `postgres` and `backend`.
  - Bind Postgres to `127.0.0.1`: `- '127.0.0.1:5432:5432'`.
  - Add at minimum `mem_limit: 512m` on postgres and backend.

---

#### `pretzel-console/Dockerfile` — Admin SPA (Vite + nginx)

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **Floating base image tags (lines 1, 11).** `FROM node:20-alpine` and `FROM nginx:alpine` use mutable tags. `nginx:alpine` in particular resolves to a different image digest every time nginx releases a patch. A rebuild next week can silently pick up a different binary. This breaks reproducibility and means you cannot audit exactly what is running in production.

  2. **nginx running as root (line 11).** The `nginx:alpine` image starts the master process as root by default. While the worker processes drop privileges, the master (which manages them) stays root. This is unnecessary in a container serving only static files. A container escape at the master level means full root on the container filesystem.

  3. **`VITE_CLERK_PUBLISHABLE_KEY` baked into the image as a build ARG (lines 7–8).** Build args are visible in `docker history` and in the layer metadata of any image pushed to a registry. Anyone with read access to the GHCR repo can run `docker history ghcr.io/…/pretzel-console:<tag>` and recover the key. The Clerk publishable key is technically public (it goes into JS bundles), but the pattern is dangerous because it trains the team to pass sensitive values as ARGs — and the next secret might not be public-safe.

  4. **No non-root user in nginx runtime.** No `USER` directive is added, no `nginx.conf` changes to listen on a non-privileged port (e.g., 8080). The container runs fully as root.

  **Proposed changes:**
  - Pin to digests: `FROM node:20-alpine@sha256:<digest>` and `FROM nginx:1.27-alpine@sha256:<digest>`. At minimum pin to a minor version tag (`nginx:1.27-alpine`).
  - Switch to `nginxinc/nginx-unprivileged` as the runtime base — it runs on port 8080 as `nginx` (non-root) out of the box. Update `EXPOSE 80` → `EXPOSE 8080`.
  - Clerk publishable key is fine in a bundle, but document explicitly that build ARGs are not for secrets. Add a comment in the Dockerfile.

---

#### `ciyo-web/Dockerfile` — Marketing / product site (Next.js)

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **Floating base image tags (lines 1, 13).** Both `node:20-alpine` stages use floating tags — same reproducibility risk as the pretzel-console Dockerfile.

  2. **No non-root user in the runtime stage (line 13–21).** The backend Dockerfile (correctly) adds `USER node` before `CMD`. This Dockerfile omits it entirely. The Next.js standalone server runs as root inside the container with no privilege drop.

  3. **`NEXT_PUBLIC_*` values embedded via `ENV` at build time (lines 9–10).** These are baked into the image layers. They appear in the image manifest and `docker inspect`. For `NEXT_PUBLIC_API_BASE` (a URL) this is low risk — but the pattern sets a precedent. If someone later adds `NEXT_PUBLIC_STRIPE_KEY` or similar using the same pattern, it will leak into image history.

  4. **No `HEALTHCHECK` instruction.** The Render deployment relies on HTTP health checks configured in the platform, but there is no `HEALTHCHECK` in the Dockerfile itself. If this image is ever run outside Render (k8s, docker-compose) there is no container-level health signal.

  **Proposed changes:**
  - Pin base image to a digest or minor-version tag.
  - Add `RUN addgroup -S nextjs && adduser -S nextjs -G nextjs` then `USER nextjs` before `CMD`, mirroring the backend Dockerfile.
  - Add `HEALTHCHECK CMD wget -qO- http://localhost:3001/api/health || exit 1`.

---

#### `ciyo-web/nginx.conf` — File does not exist

- [x] Reviewed
  **Verdict:** N/A

  **Findings:** The file `ciyo-web/nginx.conf` does not exist on disk. The `ciyo-web` package is a Next.js app deployed to Vercel, so nginx is not used for it — the nginx config lives only under `pretzel-console/`. The review list appears to have included this path in error; see `pretzel-console/nginx.conf` below.

  **Proposed changes:** N/A — but `pretzel-console/nginx.conf` review below covers the actual nginx config in use.

---

#### `pretzel-console/nginx.conf` — nginx config for admin SPA (not in review list but discovered)

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **Zero security headers.** No `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, or `Referrer-Policy` headers are set. This admin console manages DLP policy for enterprise customers — it absolutely needs `X-Frame-Options: DENY` to prevent clickjacking and a tight CSP to block XSS escalation.

  2. **No HTTPS redirect.** The server only listens on port 80. In production (Render), TLS termination happens at the load balancer, so the container itself never sees HTTPS — that's fine. But there is no protection if the container is accidentally exposed directly without TLS termination in front.

  3. **Directory listing not explicitly disabled.** `autoindex` is off by default in nginx, so this is not actively dangerous, but it's not explicitly stated. Given this is security-sensitive, it should be explicit: `autoindex off;`.

  4. **Gzip compresses sensitive admin data without `gzip_vary on`.** When a CDN or proxy sits in front, omitting `gzip_vary on;` can cause a compressed response to be cached and served to a client that did not send `Accept-Encoding: gzip`, corrupting the response.

  5. **No `server_tokens off`.** The default nginx config advertises the nginx version in error pages and `Server` response headers. This is unnecessary information disclosure.

  **Proposed changes:**
  ```nginx
  server {
      listen 8080;  # if using unprivileged image
      server_name _;
      server_tokens off;
      root /usr/share/nginx/html;
      index index.html;
      autoindex off;

      add_header X-Content-Type-Options "nosniff" always;
      add_header X-Frame-Options "DENY" always;
      add_header Referrer-Policy "strict-origin-when-cross-origin" always;
      add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.clerk.dev https://clerk.ciyo.ai;" always;

      location / {
          try_files $uri $uri/ /index.html;
      }

      gzip on;
      gzip_vary on;
      gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
  }
  ```

---

#### `ciyo-web/vercel.json` — Vercel deployment config for ciyo-web

- [x] Reviewed
  **Verdict:** WARN

  **Findings:**

  1. **Missing `Content-Security-Policy` header.** The file correctly sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, and `Referrer-Policy` — that's good baseline hygiene. However, there is no `Content-Security-Policy` header. For a Next.js marketing/product site that loads third-party scripts (analytics, Clerk, Stripe widgets), a missing CSP is a meaningful gap. XSS on the marketing site can redirect users to credential-harvesting pages.

  2. **Missing `Strict-Transport-Security` (HSTS).** Vercel enforces HTTPS, but without an explicit `Strict-Transport-Security` header in the response, browsers won't preload or pin HTTPS — a downgrade attack is theoretically possible in the first request to the domain if it hasn't been visited before.

  3. **No `Permissions-Policy` header.** Modern security posture includes `Permissions-Policy` to disable unused browser features (camera, microphone, geolocation). Not critical but a missed easy win.

  **Proposed changes:**
  Add to the headers array:
  ```json
  { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
  { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://clerk.ciyo.ai; connect-src 'self' https://api.clerk.dev;" },
  { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
  ```

---

#### `.github/workflows/backend-deploy.yml` — Backend CI/CD pipeline

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **`test` job has no `permissions` block (lines 13–35).** The `build-and-deploy` job correctly scopes permissions to `contents: read` + `packages: write`. The `test` job inherits the default — which in a repo with no top-level `permissions:` key defaults to `write` for most scopes including `contents: write`. The test job does not need write access to anything; it should be `permissions: contents: read`.

  2. **DB migrations run in CI before deployment completes (lines 80–84).** `pnpm exec tsx src/db/migrate.ts` is called in the same job that pushes the image and then triggers a Render deploy. The migration runs against the live production or staging DB before the new image is actually serving traffic. If the migration is destructive (column drop, rename) and the deploy to Render fails or is delayed, old code is serving against a new schema. This is the classic migration/deploy ordering risk. Migrations should either (a) be strictly backward-compatible additive-only, enforced by policy, or (b) run after the new image is confirmed healthy on Render via a webhook callback.

  3. **`sarisia/actions-status-discord@v1` is not pinned to a commit SHA (line 98).** Using a floating `@v1` tag means a malicious actor who compromises the `sarisia/actions-status-discord` repo can push a new `v1` tag that exfiltrates `DISCORD_WEBHOOK_URL` or any other secret in scope. All third-party actions should be pinned to a full commit SHA: `sarisia/actions-status-discord@a8b6932...`.

  4. **`docker/build-push-action@v5` and other docker/* actions similarly float on semver tags (lines 67, 70).** Same SHA-pinning concern as above, though docker/* actions are more widely vetted.

  5. **`RENDER_API_KEY` used in a `run:` step (line 92).** The key is passed via `${{ secrets.RENDER_API_KEY }}` inside a shell `run:` block. GitHub masks secrets in logs, but if the curl command fails with verbose output, or if `set -x` is accidentally enabled upstream, the key can appear in the log. Prefer using an official Render action or ensuring `set +x` is explicit.

  6. **No image vulnerability scan step.** The workflow builds and pushes the image then immediately deploys. There is no `docker scout`, Trivy, or Grype scan between build and push. A newly introduced vulnerable dependency ships to production with no gate.

  **Proposed changes:**
  - Add `permissions: contents: read` to the `test` job.
  - Pin all third-party actions to full commit SHAs.
  - Add a Trivy scan step between build and deploy: `uses: aquasecurity/trivy-action@<sha>` with `exit-code: '1'` on CRITICAL findings.
  - Move DB migrations to a post-deploy health-check step, or enforce additive-only migration policy with a linter (e.g., `squawk`).

---

#### `.github/workflows/pretzel-console-deploy.yml` — Admin SPA deploy pipeline

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **`deploy` job has no `permissions` block (lines 38–54).** This job uses `secrets.RENDER_CONSOLE_*_DEPLOY_HOOK` and calls `curl -f -X POST "$DEPLOY_HOOK"` (line 45). Without an explicit `permissions:` key, the job inherits default (broad) permissions including `contents: write`. A job that only calls a webhook needs `permissions: {}` (no permissions at all, or at most `contents: read`).

  2. **Deploy hook URL exposed in environment variable (line 44–45).** The deploy hook secret is assigned to `$DEPLOY_HOOK` in the `env:` block and then used inline in `run: curl -f -X POST "$DEPLOY_HOOK"`. If `set -x` is active or the shell echoes the command before executing (which bash's `run:` context can do on error), the hook URL — which is an authenticated endpoint — appears in the log. Render deploy hooks are capability-based URLs; leaking one lets anyone trigger a deploy. Use `--silent` and avoid printing the URL: wrap in a script that reads the env var without echoing.

  3. **`sarisia/actions-status-discord@v1` floating tag (line 49).** Same issue as backend-deploy.yml — must pin to commit SHA.

  4. **No test coverage for the Docker build path.** The test job only runs `pnpm test` and `pnpm typecheck`. The actual Docker build (`pretzel-console/Dockerfile`) is never exercised in CI. A broken Dockerfile only surfaces when Render tries to build and deploy — too late.

  **Proposed changes:**
  - Add `permissions: contents: read` (or `{}`) to the `deploy` job.
  - Wrap the curl in `--silent --output /dev/null` to avoid logging the hook URL.
  - Pin `sarisia/actions-status-discord` to a SHA.
  - Add a `docker build --no-push` step in the test job to validate the Dockerfile.

---

#### `.github/workflows/ciyo-web-deploy.yml` — Marketing site deploy pipeline

- [x] Reviewed
  **Verdict:** WARN

  **Findings:**

  1. **No `permissions` block on the `check` job.** Same default-wide-permissions issue as other workflows. This job only needs `contents: read`.

  2. **`NEXT_PUBLIC_API_BASE: http://localhost:3000` hardcoded in the CI build step (lines 37–39).** This is only used for the type-check build, so it won't hit production. But it means the CI artifact is built with a localhost URL — if the build output were ever cached and accidentally reused, requests would go to localhost. This is low risk for a Vercel deploy (Vercel rebuilds from source) but sloppy.

  3. **`sarisia/actions-status-discord@v1` floating tag (line 42).** Same SHA-pinning issue.

  4. **No explicit Vercel deploy step in the workflow.** The pipeline checks/lints but actual deployment is presumably handled by Vercel's GitHub integration (auto-deploy on push). This means the CI gate (`check` job) and the actual deploy are decoupled — the deploy can succeed even if the CI check fails, depending on how Vercel's integration is configured. This should be documented or the Vercel deploy should be driven from this workflow using the Vercel CLI with `--prod` flag gated on the `check` job passing.

  **Proposed changes:**
  - Add `permissions: contents: read` to the `check` job.
  - Pin Discord action to SHA.
  - Either document that Vercel auto-deploys independently, or drive the deploy from the workflow with `vercel --prod` gated on `check` completing successfully.

---

#### `.github/workflows/pretzel-release.yml` — Chrome extension release pipeline

- [x] Reviewed
  **Verdict:** WARN

  **Findings:**

  1. **`contents: write` is the minimum needed, but `id-token: write` is not declared.** The `softprops/action-gh-release@v2` action requires `contents: write` to create a release — that's correctly set. However, there is no attestation or SLSA provenance step. For a Chrome extension distributed to enterprise customers, supply-chain integrity is important. The extension ZIP is uploaded to GitHub Releases with no checksum or signature.

  2. **`softprops/action-gh-release@v2` and `sarisia/actions-status-discord@v1` use floating semver tags.** Both should be pinned to commit SHAs.

  3. **`VITE_API_BASE` secret printed in `docker history`-equivalent.** The extension build receives `VITE_API_BASE_PROD` (the production API URL) as an env var in the build step (line 35–36). This is baked into the JS bundle (intentionally — it's a `VITE_*` var), but it also appears in the `Run Build extension` log step under GitHub Actions → it is masked if it matches a secret, but the log still shows the command. Confirm this secret is registered as a repo secret so GitHub masks it.

  4. **No checksum file attached to release.** The ZIP is uploaded but there is no `sha256sum` artifact attached. Enterprise customers downloading the ZIP have no way to verify integrity without contacting you.

  **Proposed changes:**
  - Pin all actions to commit SHAs.
  - Add a checksum step:
    ```yaml
    - name: Generate SHA256 checksum
      run: sha256sum ${{ github.ref_name }}.zip > ${{ github.ref_name }}.zip.sha256
    ```
    And include `${{ github.ref_name }}.zip.sha256` in the `softprops/action-gh-release` files list.
  - Consider adding `actions/attest-build-provenance` for SLSA Level 1 provenance.

---

#### `.github/workflows/e2e.yml` — Cross-cutting E2E test pipeline

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **`DATABASE_URL` injected via inline shell expansion (line 50).** The step `run: DATABASE_URL=${{ secrets.E2E_DATABASE_URL }} pnpm run db:migrate` expands the secret inline in the shell command. GitHub Actions masks secret values in logs, but the expansion happens before masking evaluation in some edge cases. More critically, if the secret contains special shell characters, this can cause injection or unexpected behavior. The correct pattern is to pass secrets via the `env:` key of the step, never inline in `run:`.

  2. **`--frozen-lockfile` absent on root `pnpm install` (line 26).** All other install steps in the repo use `--frozen-lockfile`. The root E2E install at line 26 does not. This means a CI run could silently install a different dependency version if `pnpm-lock.yaml` is stale, breaking reproducibility.

  3. **`pnpm install` (not `--frozen-lockfile`) also on backend and pretzel-console (lines 29–33).** Same issue — three install steps, none frozen.

  4. **Backend started with `&` (background fork) with no PID capture (line 58–60).** `node dist/index.js &` detaches the process. If the backend crashes immediately (e.g., bad DB connection), the `wait-on` step will time out after 30 seconds and report a confusing failure. There is no `|| exit 1` check on the background process. A pattern like `node dist/index.js & echo $! > /tmp/backend.pid` and a post-step kill is cleaner and provides better diagnostics.

  5. **No `permissions` block on the `e2e` job.** Defaults to broad write. This job only needs `contents: read`.

  6. **`E2E_CLERK_USER_EMAIL: testuser@gmail.com` hardcoded in the workflow (line 83).** A real Gmail address hardcoded in a public (or semi-public) workflow file. Even if the repo is private now, this could become public. This should be a secret.

  7. **Workflow triggers on `main` but the repo's default branch appears to be `master` (per git log).** Lines 4–7 specify `branches: [main]`. The deploy workflows target `master` and `staging`. This means the E2E suite never runs on the actual deploy branches — it is dead code as configured. This is a significant regression risk: PRs merging to `master` never exercise the E2E suite.

  **Proposed changes:**
  - Change `branches: [main]` to `branches: [master, staging]` on both trigger events.
  - Add `--frozen-lockfile` to all `pnpm install` steps.
  - Move the inline `DATABASE_URL=${{ secrets.E2E_DATABASE_URL }}` to the step's `env:` block.
  - Add `permissions: contents: read` to the job.
  - Move `E2E_CLERK_USER_EMAIL` to a secret.

---

#### `backend/src/db/client.ts` — Drizzle database client

- [x] Reviewed
  **Verdict:** ISSUE

  **Findings:**

  1. **No SSL enforcement on the DB connection (line 5).** `postgres(process.env.DATABASE_URL!)` uses whatever SSL settings are in the connection string or the `postgres` driver's defaults. For a production Postgres on Render (or any managed cloud provider), SSL should be explicitly required — not left to the connection string which may or may not include `?sslmode=require`. A misconfigured `DATABASE_URL` without `sslmode=require` will silently connect in plaintext. The fix is to pass `{ ssl: 'require' }` (or `{ ssl: { rejectUnauthorized: true } }`) when `NODE_ENV === 'production'`.

  2. **`process.env.DATABASE_URL!` non-null assertion with no validation (line 5).** The `!` suppresses the TypeScript undefined check. If `DATABASE_URL` is undefined at startup, the driver will throw a cryptic connection error rather than a clear startup failure. A one-line guard at startup — `if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')` — gives a clear fail-fast message in logs.

  3. **No connection pool limits configured.** The `postgres` driver defaults to 10 connections. For a Render hobby/starter instance with a 25-connection Postgres limit shared between production and staging, this can exhaust the pool limit under moderate load. `max` should be set explicitly: `postgres(url, { max: 5 })` with a value tuned to the tier.

  4. **No idle timeout configured.** Without `idle_timeout`, connections are held open indefinitely. On serverless-adjacent deployments (Render's scale-to-zero) this means connections accumulate and are never released until the process exits.

  **Proposed changes:**
  ```typescript
  const isProd = process.env.NODE_ENV === 'production'
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

  export const sql = postgres(process.env.DATABASE_URL, {
    max: parseInt(process.env.DB_POOL_MAX ?? '5', 10),
    idle_timeout: 20,
    ssl: isProd ? 'require' : false,
  })
  ```

---

#### `backend/src/db/migrate.ts` — Drizzle migration runner

- [x] Reviewed
  **Verdict:** WARN

  **Findings:**

  1. **Same missing SSL enforcement as `client.ts` (line 8).** `postgres(process.env.DATABASE_URL!, { max: 1 })` — when this runs against the production DB in CI (see `backend-deploy.yml` line 80–84), if the connection string lacks `?sslmode=require`, the migration connects in plaintext over the public internet. Production database credentials are in transit unencrypted.

  2. **`DATABASE_URL!` non-null assertion (line 8).** Same fail-fast concern as client.ts — a missing env var produces a confusing downstream error.

  3. **No migration lock / concurrency guard.** Drizzle's `migrate()` runs the standard migration lock inside Postgres, which is fine. But the migration is called from CI in the same job as the deploy trigger — if two branches deploy simultaneously (e.g., a hotfix on master while a staging deploy is in-flight), two migration runners can contend. Drizzle's advisory lock should handle this, but it should be documented as a known risk.

  4. **`console.log('Migrations complete')` is the only output (line 11).** There is no logging of which migrations ran, how long they took, or any error context. If a migration hangs or partially applies, the only signal is a timeout. Use `drizzle`'s verbose option or log the migration files applied.

  **Proposed changes:**
  - Add the same SSL enforcement as recommended for `client.ts`.
  - Add `if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')` before line 8.
  - Log the migration start time and result summary.

---

#### `backend/src/logger/index.ts` — Application logger

- [x] Reviewed
  **Verdict:** WARN

  **Findings:**

  1. **No log-level filtering.** The logger emits every level unconditionally — `debug` logs are always written regardless of environment. In production, debug logs can leak internal state (query parameters, user IDs, session tokens) and generate significant log volume. The logger should check `process.env.LOG_LEVEL` (defaulting to `'info'` in production) and skip emit when the entry level is below the configured threshold.

  2. **No scrubbing / redaction of sensitive fields.** The `context: LogContext` accepts `[key: string]: unknown` — any caller can pass an object containing `password`, `token`, `authorization`, `DATABASE_URL`, etc. The `consoleTransport` spreads `entry.context` directly into the JSON payload (`...entry.context`). There is no allow-list or deny-list scrubbing. A single `logger.info('request received', req.headers)` call would write Authorization headers to stdout.

  3. **Singleton pattern with `clearTransports()` is test-leaking risk (lines 63–80).** `clearTransports()` is a public method that removes all transports, including the production one. If a test calls `clearTransports()` and the singleton persists (as it will in any test runner that doesn't fully reinitialize modules), subsequent log calls silently vanish. Tests should use dependency injection or a separate test instance rather than mutating the singleton.

  4. **`prettyTransport` uses `toLocaleTimeString` which is locale/timezone-dependent (line 50).** In a CI container or Docker image with a non-standard locale, this can produce unexpected output. Use a fixed-format time string: `new Date(entry.timestamp).toISOString().slice(11, 19)`.

  **Proposed changes:**
  - Add level filtering:
    ```typescript
    private static readonly LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']
    private minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info'

    private emit(level: LogLevel, ...): void {
      if (Logger.LEVELS.indexOf(level) < Logger.LEVELS.indexOf(this.minLevel)) return
      // ...
    }
    ```
  - Add a basic redaction list in `consoleTransport`: before spreading `entry.context`, strip keys matching `/password|token|secret|authorization|key/i`.
  - Make `clearTransports()` package-private or replace with a `withTransports()` factory for tests.

---

## Summary Table

| File | Verdict | Findings Count |
|---|---|---|
| `docker-compose.yml` | ISSUE | 5 |
| `pretzel-console/Dockerfile` | ISSUE | 4 |
| `ciyo-web/Dockerfile` | ISSUE | 4 |
| `ciyo-web/nginx.conf` | N/A | File missing |
| `pretzel-console/nginx.conf` | ISSUE | 5 |
| `ciyo-web/vercel.json` | WARN | 3 |
| `backend-deploy.yml` | ISSUE | 6 |
| `pretzel-console-deploy.yml` | ISSUE | 4 |
| `ciyo-web-deploy.yml` | WARN | 4 |
| `pretzel-release.yml` | WARN | 4 |
| `e2e.yml` | ISSUE | 7 |
| `backend/src/db/client.ts` | ISSUE | 4 |
| `backend/src/db/migrate.ts` | WARN | 4 |
| `backend/src/logger/index.ts` | WARN | 4 |

**Totals: 8 ISSUE / 5 WARN / 0 PASS** (plus 1 N/A)

---

## Top 5 Most Critical Issues

### 1. E2E workflow targets `main` branch — suite never runs on `master` (e2e.yml, lines 4–7)
The most operationally dangerous finding. The entire cross-cutting E2E suite is wired to trigger on `main`, but the repo deploys from `master`. PRs merging to master have zero E2E coverage. This is a regression gate that doesn't gate anything. Fix first.

### 2. DB connections in production have no SSL enforcement (client.ts line 5, migrate.ts line 8)
Production database credentials transit the public internet in plaintext if the `DATABASE_URL` connection string omits `sslmode=require`. The migration step in `backend-deploy.yml` calls `migrate.ts` against the live production DB from a GitHub Actions runner — no SSL means credentials on the wire. Add `ssl: 'require'` to both connection instantiations immediately.

### 3. All third-party CI actions pinned to floating semver tags — supply-chain risk (all workflow files)
`sarisia/actions-status-discord@v1`, `softprops/action-gh-release@v2`, and the docker/* actions all use mutable version tags. A compromised upstream repo re-tagging `v1` to malicious code would exfiltrate every secret in scope (Render API key, DB URLs, Clerk secrets, Discord webhook) on the next deploy. Pin every third-party action to a full commit SHA.

### 4. nginx admin console (pretzel-console) has no security headers (pretzel-console/nginx.conf)
The admin console manages enterprise DLP policy — it is the highest-value target in the system. It has no `X-Frame-Options`, no CSP, no `X-Content-Type-Options`, and nginx version disclosure is on. Clickjacking, XSS amplification, and information leakage are all unmitigated. Add the full security header block as shown in the proposed changes above.

### 5. Migrations run before the new image is live (backend-deploy.yml, lines 80–94)
The CI pipeline runs destructive schema migrations against the production database before the new Docker image is confirmed running on Render. If the Render deploy fails, old code runs against a new schema. This is the canonical pre/post-deploy migration ordering problem. Either enforce additive-only migrations with a linter, or restructure the pipeline to run migrations only after Render confirms the new image is healthy.
