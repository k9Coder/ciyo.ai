# Discord Community Setup

## Step 1 — Create the Server

1. Open Discord → click **+** (Add a Server) in the left sidebar
2. Choose **Create My Own** → **For a club or community**
3. Server name: `ciyo.ai Security Community`
4. Upload a server icon (use the ciyo.ai logo — ask Carlos for a square PNG, 512×512)
5. Click **Create**

---

## Step 2 — Create Channels

Delete the default channels Discord creates (`#general`, `#voice`), then create these exactly:

### Category: `COMMUNITY`
| Channel | Type | Purpose |
|---|---|---|
| `#announcements` | Text | Product updates, launches, threat report releases. Only Ethan/Priya can post. |
| `#general` | Text | Open conversation. Everyone can post. |
| `#help-and-questions` | Text | Users ask questions about ciyo.ai, DLP, policy config. |
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
| `ciyo.ai Team` | Brand color (ask Carlos for hex) | All ciyo.ai staff | Can post in #announcements, can manage messages |
| `Member` | Default | Everyone who joins | Standard — read + post everywhere except #announcements |

Assign yourself and any staff `ciyo.ai Team`.

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

This is your `DISCORD_INVITE_URL`.

---

## Step 6 — Add the Link to the Codebase

Once you have the invite URL, add it as an environment variable:

### pretzel-console
Add to `.env` (and your deployment secrets):
```
NEXT_PUBLIC_DISCORD_INVITE_URL=https://discord.gg/XXXXXXX
```

### ciyo-web
Same variable name — it's public so `NEXT_PUBLIC_` prefix is correct for Next.js.

---

## Step 7 — Where the Link Will Appear (Carlos's design spec)

### pretzel-console
- **Location:** Bottom of left sidebar, below the Help/Docs link
- **Treatment:** Discord logo icon (20px), tooltip "Join community" on hover
- **Color:** Muted — match secondary icon treatment, not primary action color
- **Behavior:** Always visible, no badge, no animation

### ciyo-web
- **Location 1:** Global nav — text link "Community" between Blog and Contact
- **Location 2:** Footer — Discord icon alongside LinkedIn/Twitter social icons
- **Optional:** Small "Join our Discord" strip on blog index and docs pages

Carlos will produce Figma specs → Chloe implements in pretzel-console → whoever owns ciyo-web implements the nav/footer.

---

## Step 8 — Seed Before Launch

Before opening to anyone:

- [ ] Ethan posts 5 real policy scenario posts in `#share-your-policy`
- [ ] Priya posts 25 policy template entries (configs from engineering + Priya's threat-scenario headers)
- [ ] Community guidelines pinned in `#general`
- [ ] `#security-news` has at least 3 posts ready to publish day one
- [ ] Aisha Johnson added with `ciyo.ai Team` role, moderation briefed (3-4 hrs/week in Q3 OKRs)

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
