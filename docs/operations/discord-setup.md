# Discord Community Setup

## Step 1 — Create the Server

1. Open Discord → click **+** (Add a Server) in the left sidebar
2. Choose **Create My Own** → **For a club or community**
3. Server name: `mykka.ai Security Community`
4. Upload a server icon (use the mykka.ai logo — ask Carlos for a square PNG, 512×512)
5. Click **Create**

---

## Step 2 — Create Channels

Delete the default channels Discord creates (`#general`, `#voice`), then create these exactly:

### Category: `COMMUNITY`
| Channel | Type | Purpose |
|---|---|---|
| `#announcements` | Text | Product updates, launches, threat report releases. Only Ethan/Priya can post. |
| `#general` | Text | Open conversation. Everyone can post. |
| `#help-and-questions` | Text | Users ask questions about mykka.ai, DLP, policy config. |
| `#template-requests` | Text | Members request new policy templates. |
| `#share-your-policy` | Text | Curated only — users submit via form, we post on their behalf. Pin this rule at the top. |

### Category: `RESOURCES`
| Channel | Type | Purpose |
|---|---|---|
| `#security-news` | Text | Weekly curated DLP/security links. Megan posts. |

### How to create a category:
Right-click the server name → **Create Category** → name it → drag channels into it.

### How to restrict #announcements to admins only:
Channel Settings → Permissions → disable **Send Messages** for `@everyone` → enable it only for your admin role.

---

## Step 3 — Create Roles

Go to **Server Settings → Roles**, create these:

| Role | Color | Who gets it | Permissions |
|---|---|---|---|
| `mykka.ai Team` | Brand color (ask Carlos for hex) | All mykka.ai staff | Can post in #announcements, can manage messages |
| `Member` | Default | Everyone who joins | Standard — read + post everywhere except #announcements |

Assign yourself and any staff `mykka.ai Team`.

---

## Step 4 — Pin Rules in #share-your-policy

Post and pin this message in `#share-your-policy`:

> **How this works:**
> We don't accept direct posts here — this keeps quality high and protects your organization.
> Submit your policy via the form: [FORM LINK — add later]
> We review it, anonymize if needed, and post it for you within 48h.
> Questions? Use #help-and-questions.

---

## Step 5 — Generate a Permanent Invite Link

1. Right-click any channel → **Invite People**
2. Click **Edit invite link**
3. Set expiry to **Never**, max uses **No limit**
4. Copy the link — format: `https://discord.gg/XXXXXXX`

**Done — permanent invite link: `https://discord.gg/MUJP6bJX2J`**

---

## Step 6 — Add the Link to the Codebase

The invite URL is public (it ships in client bundles), so it is **not** a GitHub secret — it follows the deploy-env conventions in [`docs/ENVIRONMENT_AND_SECRETS.md`](../ENVIRONMENT_AND_SECRETS.md): add it to each package's `env.ts` module and committed `.env` files. Same value in staging and production, with a safe default in the schema so nothing breaks if the var is unset.

### pretzel-console (Vite — `VITE_` prefix, not `NEXT_PUBLIC_`)
1. Add to `src/env.ts` (live-getter pattern like the existing vars):
   ```
   VITE_DISCORD_INVITE_URL: z.string().default('https://discord.gg/MUJP6bJX2J')
   ```
2. Add the same line to `.env.example` and `.env.staging`. No Render dashboard entry needed — the default covers it.

### mykka-web (Next.js — `NEXT_PUBLIC_` prefix)
1. Add to `lib/env.ts` (must be referenced literally — Next inlines at build):
   ```
   NEXT_PUBLIC_DISCORD_INVITE_URL: z.string().default('https://discord.gg/MUJP6bJX2J')
   ```
2. Add to `.env.example`. No Vercel dashboard entry needed — the default covers it.

Access it only via the `env` modules — no raw `process.env` / `import.meta.env` reads (repo rule).

---

## Step 7 — Where the Link Will Appear (Carlos's design spec)

### pretzel-console
- **Location:** Bottom of left sidebar, below the Help/Docs link
- **Treatment:** Discord logo icon (20px), tooltip "Join community" on hover
- **Color:** Muted — match secondary icon treatment, not primary action color
- **Behavior:** Always visible, no badge, no animation

### mykka-web
- **Location 1:** Global nav — text link "Community" between Blog and Contact
- **Location 2:** Footer — Discord icon alongside LinkedIn/Twitter social icons
- **Optional:** Small "Join our Discord" strip on blog index and docs pages

Carlos will produce Figma specs → Chloe implements in pretzel-console → whoever owns mykka-web implements the nav/footer.

---

## Channel Seed Copy

First message to post (and pin) in each channel before inviting anyone.

### `#announcements` — welcome post (Ethan or Priya)

> **Welcome to the mykka.ai Security Community** 👋
> This is the home for people building and running DLP policies with mykka.ai.
> What to expect here: product updates, launch notes, and our threat report releases.
> Start in #general to introduce yourself, ask anything in #help-and-questions, and browse real-world configs in #share-your-policy.

### `#general` — community guidelines (pin)

Final Priya-reviewed version lives in [discord-seed-posts.md](discord-seed-posts.md) — use that one.

### `#help-and-questions` — intro (pin)

> Ask anything about mykka.ai: setup, policy config, DLP concepts, integrations, billing.
> To help us help you fast, include: what you're trying to do, what you tried, and any error text (sanitized).
> Team members answer weekdays; the community may be faster.

### `#template-requests` — how it works (pin)

> Want a policy template we don't have yet? Post it here as:
> **Scenario:** what you're trying to detect or block
> **Data types involved:** e.g. PII, source code, financials
> **Where:** e.g. ChatGPT, Claude, email, uploads
> We triage requests weekly — 👍 reactions help us prioritize.

### `#share-your-policy` — submission rule (pin)

Already defined in Step 4 above — use that text verbatim.

### `#security-news` — intro (pin, Megan)

> Weekly curated links on DLP, data security, and AI-related leaks — posted every [pick a day].
> Format per post: link, one-line summary, and why it matters for people running DLP.
> Discussion welcome in threads; suggestions for inclusion → DM Megan.

---

## Step 8 — Seed Before Launch

All seed content is drafted and ready to paste: [discord-seed-posts.md](discord-seed-posts.md).

Before opening to anyone:

- [ ] Ethan posts 5 real policy scenario posts in `#share-your-policy`
- [ ] Priya posts 25 policy template entries (configs from engineering + Priya's threat-scenario headers)
- [ ] Community guidelines pinned in `#general`
- [ ] `#security-news` has at least 3 posts ready to publish day one
- [ ] Aisha Johnson added with `mykka.ai Team` role, moderation briefed (3-4 hrs/week in Q3 OKRs)

**Do not share the invite link publicly until all of the above are done.**

---

## Open Items Blocking Launch

| Blocker | Owner |
|---|---|
| Template configs (25 policy configs) | Marcus assigns engineer |
| Template headers copy | Priya — needs config list by Monday |
| Community guidelines draft | Priya |
| Figma spec for console + web placement | Carlos |
| Feedback bot (`/feedback` tag → Notion → Ben) | James + Ben to set up |
| Policy submission form | TBD — can be a Typeform for now |

**Target launch: 3 weeks from July 4, 2026 = July 25, 2026**
