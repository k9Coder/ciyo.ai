# Policy Format

The detection policy is a JSON object validated against the Zod schema in `src/policy/schema.ts`.

## Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | `1` | Schema version. Currently always `1`. |
| `tenantId` | `string?` | Optional. Reserved for future multi-tenant cloud sync. |
| `baseline` | `Rule[]` | Built-in rules. Populated from `defaults.ts`. |
| `custom` | `Rule[]` | User-defined rules. Merged with baseline at detection time. |
| `perSite` | `Record<string, SiteConfig>` | Per-hostname overrides. |
| `allowSendAnywayWithReason` | `boolean` | Whether users can bypass a warning by entering a reason. |
| `auditRetentionDays` | `number` | Days to keep audit events in IndexedDB. |

## SiteConfig

```json
{
  "enabled": true,
  "defaultAction": "warn"
}
```

## Rule types

### PatternRule

```json
{
  "id": "my-rule",
  "name": "My Rule",
  "description": "...",
  "severity": "high",
  "action": "block",
  "enabled": true,
  "tags": ["api-key"],
  "kind": "pattern",
  "pattern": "sk-[A-Za-z0-9]{20,}",
  "flags": "",
  "validator": "none",
  "scope": "all"
}
```

- `pattern` — JavaScript regex source (no `/` delimiters).
- `flags` — regex flags string, e.g. `"gi"`. The engine always adds `g`.
- `validator` — post-match validator: `"luhn"`, `"ssn"`, `"iban"`, or `"none"`.
- `scope` — `"all"` | `"outside_code"` | `"inside_code"`. Controls whether the rule fires inside markdown fences.

### EntropyRule

```json
{
  "id": "high-entropy",
  "kind": "entropy",
  "severity": "medium",
  "action": "warn",
  "minTokenLength": 24,
  "minBitsPerChar": 4.0,
  ...
}
```

Shannon entropy is computed per-token. Tokens are alphanumeric sequences ≥ `minTokenLength` chars.

### DictionaryRule

```json
{
  "id": "my-terms",
  "kind": "dictionary",
  "severity": "high",
  "action": "require_confirmation",
  "terms": ["ProjectX", "project-x"],
  "fuzzyTerms": [{ "term": "ProjectX", "maxDistance": 1 }],
  "caseSensitive": false,
  ...
}
```

- `terms` — exact word-boundary matches (case-insensitive unless `caseSensitive: true`).
- `fuzzyTerms` — Levenshtein matches within `maxDistance` edits. Only applies to terms ≤ 20 chars.

## Severity and Action matrix

| Severity | Default action | Can send with reason? |
|----------|---------------|----------------------|
| `low` | `log` | N/A (no modal) |
| `medium` | `warn` | Yes |
| `high` | `warn` or `require_confirmation` | Yes |
| `critical` | `block` | No (unless `allowSendAnywayWithReason: true`) |

Override per-rule via the `action` field.
