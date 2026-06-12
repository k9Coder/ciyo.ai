# Lena Hartmann — Unit Test Fixes

**Participants:** Lena Hartmann (QA Analyst)
**Directed by:** Natasha Ivanova (QA Lead)

_Completed manually after agent stalled pre-commit._

## Files Changed

| File | Change |
|---|---|
| `backend/tests/assistant-prompt.test.ts` | Replaced 13× `toContain('HEADER')` with assertions on actual instruction content |
| `backend/tests/policy-routes.test.ts` | Fixed `toBeDefined()` → `toMatchObject({ expected shape })` |
| `backend/tests/policy.service.test.ts` | Added DB call shape assertions; mock now verified with correct data |
| `backend/tests/scans.test.ts` | Added plan limit test, remaining count test, Clerk-member path test |
| `backend/tests/subjects.test.ts` | Fixed filter test: seeds both active + inactive, asserts filter excludes inactive |
| `pretzel/tests/unit/policy/role.test.ts` | Updated token format to current non-deprecated format |

## Test Results

- Backend: **256/256 passing** (35 test files)
- Pretzel: **136/136 passing** (14 test files)

## Commit

`ad292fe` on branch `worktree-agent-a8f5accd91b0ee15a`
