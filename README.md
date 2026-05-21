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

- Node.js ≥ 18
- pnpm ≥ 9

```bash
pnpm install
pnpm dev
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` directory

### Production Build

```bash
pnpm build
```

The extension is packaged to `dist/`. Load unpacked as above.

---

## Running Tests

```bash
# Unit tests (Vitest)
pnpm test

# E2E tests (Playwright) — requires a production build first
pnpm build && pnpm test:e2e
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
