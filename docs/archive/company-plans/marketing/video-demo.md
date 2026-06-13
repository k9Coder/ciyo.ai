# ciyo.ai Product Demo Video — Two Execution Plans

**Prepared by:** Priya Nair (Head of Marketing)
**Stakeholders:** Ethan Cole (CEO), Carlos Mendes (Designer)

Choose one:
- **Plan A** — Hire a Fiverr freelancer (~$50–150, 5–7 days)
- **Plan B** — Agent executes it with free AI tools (~$0, 2–3 hours)

---

## Plan A — Fiverr Brief (send this to the freelancer)

### What to search on Fiverr

Search: `"product demo video" OR "SaaS explainer video" OR "software demo video"`  
Filter: `$50–200`, `Top Rated Seller`, `Delivery: 3–5 days`  
Target sellers who show B2B SaaS demo videos in their portfolio (not cartoon explainers).

---

### Brief to paste into the Fiverr order

> **Project: 90-second SaaS product demo video for ciyo.ai**
>
> **Product:** ciyo.ai — a Chrome extension that detects and blocks sensitive data before employees paste it into AI tools like ChatGPT, Claude, and Gemini. Think of it as DLP (data loss prevention) for AI.
>
> **Style reference:** [Lovable.dev launch video](https://lovable.dev) or [base44.com](https://base44.com) — clean, fast-paced, screen recording of the real product with motion text overlay and AI voiceover. No cartoon characters, no stock footage of people shaking hands.
>
> **Length:** 90 seconds maximum.
>
> **Video structure:**
>
> | Timestamp | Scene | Visual | Voiceover |
> |-----------|-------|--------|-----------|
> | 0–8s | Hook | Employee typing into ChatGPT; red highlight pulses on sensitive text | "Every day, your employees paste things into AI that should never leave your company." |
> | 8–20s | Problem | Screen splits: user at laptop / "data exfiltration" abstract visual / news headline | "API keys. Client names. Internal code. They don't mean to. But they do it anyway." |
> | 20–50s | Solution demo | Screen recording of ciyo.ai console: admin creates a rule, publishes policy. Cut to extension warning modal appearing in ChatGPT. | "ciyo.ai gives security teams control — without blocking productivity. Set the rules once. Protect every AI session." |
> | 50–65s | Feature bullets | Bullet points animate in one by one | "Works on ChatGPT, Claude, Gemini. Deploys in minutes via Chrome Enterprise. No prompt content stored — ever." |
> | 65–80s | Trust signal | Clean background, company logo | "Trusted by security-first teams." |
> | 80–90s | CTA | ciyo.ai website mockup or URL | "Start free at ciyo.ai." |
>
> **Assets I will provide you:**
> - Screen recordings of the console and extension (MP4, I will record these)
> - Logo (PNG, transparent background)
> - Brand colors: `#1a1a2e` (dark navy), `#e94560` (accent red), `#ffffff`
> - Font: Inter or similar clean sans-serif
>
> **Music:** Upbeat but professional, no lyrics. Something like corporate-tech-positive, not cinematic trailer.
>
> **Voiceover:** AI voiceover is fine (ElevenLabs quality). Male or female, clear American English accent, calm and authoritative.
>
> **Deliverables:**
> - 1x MP4, 1920×1080, H.264
> - 1x 9:16 version (1080×1920) for social media (bonus, not required)
> - Captions/subtitles as separate SRT file
>
> **Revisions:** 2 rounds included.

---

### What you need to provide the freelancer

- [ ] Screen recording of the console: create a rule → publish policy (2–3 min Loom, then trim)
- [ ] Screen recording of the extension: trigger a warning modal in ChatGPT
- [ ] Logo PNG (transparent background) — ask Carlos Mendes
- [ ] Brand color hex codes (above) confirmed with Carlos

---

## Plan B — Agent Execution Plan (run yourself with free tools)

**Total cost: $0. Time: 2–3 hours.**

### Step 1: Record the product (30 min)

Use **Loom** (free, download at loom.com):

```
Recording 1 — Console demo (60 seconds)
1. Open pretzel-console in browser
2. Navigate to Subjects → create a subject called "API Keys"
3. Navigate to Rules → create a rule linking that subject to "Block" action
4. Navigate to Publish → click Publish
5. Show the policy is live

Recording 2 — Extension demo (30 seconds)  
1. Open ChatGPT in Chrome with Pretzel extension installed
2. Type a fake API key: "sk-proj-abc123xyz789..."
3. Show the warning modal appear with red highlight
4. Click "Remove" and show the prompt is cleaned
```

Export both Loom recordings as MP4.

---

### Step 2: Generate voiceover (15 min)

Go to **ElevenLabs** (elevenlabs.io, free tier: 10,000 chars/month):

1. Create account (free)
2. Choose voice: "Rachel" (female, professional) or "Adam" (male, calm)
3. Paste this script:

```
[Paste this into ElevenLabs text box]

Every day, your employees paste things into AI that should never leave your company.
API keys. Client names. Internal code. They don't mean to. But they do it anyway.

ciyo.ai gives your security team control — without blocking productivity.
Set the rules once. Protect every AI session.

Works on ChatGPT, Claude, and Gemini. Deploys in minutes via Chrome Enterprise.
No prompt content stored — ever.

Start free at ciyo.ai.
```

4. Download as MP3

---

### Step 3: Generate b-roll clips (20 min)

Go to **Runway** (runwayml.com, free tier: 125 credits):

Generate these 3 short clips (5 seconds each):

```
Prompt 1: "Abstract visualization of data packets flowing from a laptop screen into the cloud, blue and white glowing particles, dark background, cinematic"

Prompt 2: "Red glowing particles being blocked by an invisible wall, corporate cybersecurity theme, dark navy background"

Prompt 3: "Clean modern office, employee at laptop, focus on screen showing a web browser, professional"
```

Download all 3 as MP4.

---

### Step 4: Edit everything together (60 min)

Go to **CapCut** (capcut.com, free, browser-based):

```
Timeline assembly order:
[0:00–0:08] Runway clip 1 (data packets) — fade in
[0:08–0:20] Runway clip 3 (office/employee) — overlay text: "API keys. Client names. Internal code."
[0:20–0:50] Screen recording 1 (console demo) — add text label "Admin sets the rules once"  
[0:50–1:00] Screen recording 2 (extension warning) — add text label "Employee is protected automatically"
[1:00–1:15] Runway clip 2 (blocked particles) — overlay bullet points animating in
[1:15–1:30] Black screen with ciyo.ai logo — overlay: "Start free at ciyo.ai"
```

CapCut how-tos:
- Add voiceover: Import the MP3 → drag to audio track
- Add music: CapCut Audio Library → filter "Corporate" → volume at 20%
- Text animations: Text → Animate → "Fade In" or "Typewriter"
- Transitions: Transition panel → "Smooth" between clips

Export: 1920×1080, MP4, max quality.

---

### Step 5: Add captions (10 min)

Upload final MP4 to **CapCut** → Auto Captions → English → Export SRT.  
Or use **Cleft** (getcleft.com, free) to generate SRT from the MP3.

---

### Checklist before publishing

- [ ] Voiceover synced to visuals (±0.5s tolerance)
- [ ] Warning modal scene clearly visible (not cut off)
- [ ] Logo readable in final frame
- [ ] ciyo.ai URL spelled correctly
- [ ] No Loom watermark in export (free Loom adds watermark — trim around it or upgrade $12.50/mo)
- [ ] Total length ≤ 90 seconds
