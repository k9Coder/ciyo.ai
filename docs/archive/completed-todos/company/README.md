# company/todos — Action Item Format

Each file is a self-contained action item that can be triggered as an agent task.

## How to run an item

Invoke the CTO skill and paste the file contents as context:
```
staff:marcus-webb
```
Then paste the **"Prompt to CTO"** block from the file. Marcus routes to the right owner.

## File naming

```
<domain>-<short-slug>.md

Examples:
  engineering-rate-limiter.md
  legal-dpa-subprocessors.md
  infra-log-drain.md
```

## Format inside each file

```
# [Title]
Owner suggestion: [who should do this]
Priority: 🔴 / 🟡 / 🟢
Effort: [estimate]

## Context
[Why this matters]

## Acceptance criteria
- [ ] ...

## Prompt to CTO (copy-paste to staff:marcus-webb)
[Self-contained briefing Marcus can use to delegate]
```
