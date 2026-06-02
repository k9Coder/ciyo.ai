# ciyo

AI prompt protection — detects secrets and PII before they leave your browser. ciyo is a browser-based DLP (Data Loss Prevention) tool for LLM chat interfaces. It inspects prompts before they are sent, warns on sensitive data, and gives admins full visibility via the ciyo Admin Console.

## Supported Sites

- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai) — adapter stub, selectors require verification
- Gemini (gemini.google.com) — adapter stub, selectors require verification

## What It Detects

- API keys: OpenAI, Anthropic, AWS, GitHub, Slack, Google
- Credentials: PEM private keys, SSH private keys, JWTs, .env assignments
- PII: Credit card numbers (Luhn-validated), US SSNs
- Network: RFC 1918 internal IP addresses
- Entropy: Long high-entropy tokens (configurable threshold)
- Dictionary: Custom terms and fuzzy variants (configurable)

---

## Quick Start (Development)

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- [Docker](https://www.docker.com/) (for local Postgres)
- A [Clerk](https://clerk.com/) account

### 1. Install dependencies

```sh
npm install
cd backend && npm install && cd ..
cd admin && npm install && cd ..
```

### 2. Configure environment variables

```sh
cp backend/.env.example backend/.env
```

Fill in your keys in `backend/.env`:

| Variable | Where to get it |
|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |

### 3. Start the database

Creates a local Postgres container with a **named volume** (data survives container deletion), runs migrations, and seeds demo data:

```sh
npm run db:setup
```

Re-run any time you want a clean slate — it wipes and reseeds automatically.

### 4. Start the services

In three separate terminals:

```sh
# Backend API — http://localhost:3000
cd backend && npm run dev

# Admin dashboard — http://localhost:5173
cd admin && npm run dev

# Extension hot-reload build
npm run dev
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `dist/` directory

### Production Build

```sh
npm run build
```

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run db:setup` | Recreate DB container, migrate, seed demo data |
| `npm run check-db` | Query DB to verify your user/tenant rows |
| `cd backend && npm run db:migrate` | Run pending migrations only |
| `cd backend && npm run seed:fintech` | Reseed demo data (container must be running) |

---

## Querying the local database

Use `npm run check-db` to run SQL against the local Postgres container without needing any extra tools installed.

**Default** — shows the `tenants` and `members` tables (useful for auth debugging):

```sh
npm run check-db
```

**Custom query** — pass any SQL after `--`:

```sh
# Check which members are missing a clerk_id
npm run check-db -- "SELECT id, email, role, clerk_id FROM members WHERE clerk_id IS NULL;"

# Inspect rules
npm run check-db -- "SELECT id, kind, action, active FROM rules LIMIT 20;"

# List all tables
npm run check-db -- "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"

# Count rows in every table
npm run check-db -- "SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY rows DESC;"
```

> The `--` is npm's argument separator — everything after it is passed directly to the script.

---

## Auth troubleshooting

If you see 401 errors in the admin dashboard, your DB rows are likely out of sync with Clerk. Run:

```sh
npm run check-db
```

This shows your `tenants`, `users`, and `members` tables. You need:
- A row in `users` with `clerk_id` matching your Clerk user ID
- A row in `members` linking that user to a tenant

If either is missing, re-run `npm run db:setup` — the seed script creates both rows automatically when it detects your Clerk user.

> **Note:** The system no longer uses Clerk organisations. Identity is managed via the `users` table (keyed on `clerk_id`) and tenant membership via the `members` table.

---

## Running Tests

```sh
# Unit tests (Vitest)
npm test

# E2E tests (Playwright) — requires a production build first
npm run build && npm run test:e2e
```

---

## Policy Format

The detection policy is a JSON document validated with Zod. You can import/export it from the Options page.

See [docs/policy-format.md](docs/policy-format.md) for the full schema reference.

Example enterprise policy: [`src/policy/examples/enterprise.json`](src/policy/examples/enterprise.json)

### Minimal custom rule example

```json
{
  "version": 1,
  "baseline": [],
  "custom": [
    {
      "id": "my-codename",
      "name": "Project Codename",
      "description": "Prevent leaking internal project name",
      "severity": "high",
      "action": "require_confirmation",
      "enabled": true,
      "tags": ["confidential"],
      "kind": "dictionary",
      "terms": ["ProjectX", "project-x"],
      "caseSensitive": false
    }
  ],
  "perSite": {
    "chatgpt.com": { "enabled": true }
  },
  "allowSendAnywayWithReason": true,
  "auditRetentionDays": 30
}
```

---

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Adding a New Site Adapter

See [docs/adding-a-site-adapter.md](docs/adding-a-site-adapter.md).
