---
status: current
owner: architecture
verified_at: 2026-06-17
sources:
  - backend/src/policy/compiler.ts
  - backend/src/policy/resolver.ts
  - backend/src/policy/router.ts
  - pretzel/src/policy
  - pretzel/src/detection
---

# Policy And Enforcement

Administrators edit subjects, rules, site configs, destination groups, and organizational scope. Publishing compiles the current database state into an immutable versioned policy snapshot.

The compiled policy contains subjects, rules, and site configs. For a Clerk member, the backend resolves applicable global, division, and team subjects, deduplicates equivalent detection rules, favors more-specific scopes, and expands destination groups.

Pretzel validates the wire policy, bridges it into its local detection format, caches it in Chrome storage, and enforces locally. If no server policy is stored, the extension uses built-in defaults. If a server policy exists, the extension keeps the built-in baseline rules and merges tenant rules as custom runtime rules, so a published tenant policy does not remove baseline API-key and secret detection.

Detection supports pattern, entropy, exact/fuzzy dictionary, and score rules. Rules are filtered by current hostname before detection; empty destinations apply to all supported AI sites, and configured hostnames match themselves and subdomains. Current enforcement is limited to manifest-authorized ChatGPT, Claude, and Gemini hosts. The warning modal shows send-anyway only when every matched finding is overridable. See [Known Issues](../KNOWN_ISSUES.md) for policy fields that are not fully enforced.
