# Legal — Privacy Policy & Security Page Accuracy Check

**Owner suggestion:** David Horowitz (GC) reviews mykka-web pages vs actual code behavior
**Priority:** 🟡 Pre-launch
**Effort:** 2–3 hours legal review. Engineering: varies depending on gaps found.

---

## Context

The mykka-web marketing site has:
- `/privacy` — Privacy Policy page
- `/terms` — Terms of Service page
- `/security` — Security/trust page (claims about what we do to protect data)
- `/accessibility` — Accessibility statement

These pages were recently added (`fix(mykka-web)` commit). Their content has **not yet been reviewed** against what the code actually does. Claims on these pages create legal obligations. If the code does something different than what's claimed, we are exposed.

Known areas of potential mismatch:
1. Security page claims vs actual auth/encryption implementation
2. Privacy policy: does it disclose transmission of data to Anthropic/OpenAI/Groq/Stripe/Clerk/Sentry?
3. Data retention claims: the policy may say "we retain data for X days" but no retention mechanism exists (see `legal-data-retention.md`)
4. Cookies / tracking: does mykka-web use analytics? Are cookies disclosed?

---

## Acceptance criteria

- [ ] David reads `mykka-web/app/privacy/page.tsx`, `mykka-web/app/terms/page.tsx`, `mykka-web/app/security/page.tsx`
- [ ] David cross-references each claim against actual code behavior (work with Marcus/Arjun for technical questions)
- [ ] All inaccurate claims are flagged with a proposed fix
- [ ] Engineering updates pages to match reality (or code updated to match claims)
- [ ] Final pages signed off by David before launch

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: legal accuracy review of mykka-web Privacy/Security/Terms pages — pre-launch gate**
>
> David Horowitz needs to review `mykka-web/app/privacy/page.tsx`, `mykka-web/app/terms/page.tsx`, and `mykka-web/app/security/page.tsx` for accuracy. These pages were recently added but their content has not been verified against what the backend actually does.
>
> David will flag any claims that don't match reality. When flagged: either Priya/Carlos update the copy (if the code is correct), or Arjun updates the code (if the claim is something we should actually implement). Be available to answer David's technical questions about what data we collect, where it goes, and how long we keep it.
>
> This is a legal gate — pages must be accurate before the first paying customer.
