# Before Deploy Checklist

Things that must be configured in the hosting environment before going live.
These are NOT in the repo (gitignored or simply not automated) — you must set them manually each time you deploy to a new environment.

---

## 1. Sentry DSNs — Error Monitoring

**What:** Two environment variables that tell the app where to send error reports.
**Why:** Sentry is already wired into the code (`pretzel-console` and the extension), but it only activates when the DSN env var is present. Without it, errors are silently swallowed and you have zero visibility into what's breaking in production.

### pretzel-console (Vite/React app)

Set this wherever `pretzel-console` is hosted (Vercel / Railway / etc.):

```
VITE_SENTRY_DSN=https://755fe72242df5a2ed0ead4188c1b0461@o4511497522380800.ingest.de.sentry.io/4511497738518608
```

> **Why VITE_ prefix?** Vite only exposes env vars to client-side code if they start with `VITE_`. Without this prefix the variable is invisible to the React app.

### pretzel extension (Chrome extension build)

The extension is a static build — it bakes env vars in at build time. So this must be set in your **CI/CD environment** (GitHub Actions secret, or locally in `pretzel/.env`) before running `pnpm build`:

```
VITE_SENTRY_DSN_EXTENSION=https://89fcdcdc836cfd00125cea672b8b6a6e@o4511497522380800.ingest.de.sentry.io/4511497582936144
```

> **Important:** Unlike a server app, the extension doesn't read env vars at runtime — it reads them at build time. If this variable is missing when you run `pnpm build`, the extension will be built without Sentry and errors will be invisible. The code gracefully skips init when the DSN is absent, so it won't crash — it just won't report anything.

### Where to find these DSNs again

Sentry dashboard → select the project → **Settings → Client Keys (DSN)** → copy the value under "DSN".

- `pretzel-console` DSN: project named **pretzel-console** (React)
- Extension DSN: project named **pretzel-extension** (Browser JavaScript)

---

## 2. Microsoft Clarity — Session Replay

**What:** Already hardcoded into `pretzel-console/index.html` — project ID `x0wzdd5nvx`.
**Why:** Clarity's snippet is public (like a Google Analytics tag) and doesn't need to be secret. Nothing to configure — it's already live once the console is deployed.

> If you ever need to replace the Clarity project, change the ID in `pretzel-console/index.html` line 9.

---

## 3. Backend Sentry (future)

The backend (`backend/`) does not yet have Sentry. When you add it, use a **third** Sentry project (Node.js) and set:

```
SENTRY_DSN=<backend-project-dsn>
```

This is a server-side env var (no `VITE_` prefix needed).

---

## 4. Other production env vars (reminder)

These are separate from observability but easy to forget. Each service needs its own copy:

| Service | File to copy from | Where to set |
|---|---|---|
| `pretzel-console` | `pretzel-console/.env.example` | Vercel / Railway environment settings |
| `pretzel` extension | `pretzel/.env.example` | GitHub Actions secrets / local `.env` before build |
| `backend` | `backend/.env.example` | Railway environment settings |
