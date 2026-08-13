import type * as KeytarModule from 'keytar'

/**
 * Load keytar with CJS/ESM interop handled.
 *
 * keytar is a native CJS addon that electron-vite keeps external (not bundled).
 * In the built main-process bundle, `await import('keytar')` yields a namespace
 * whose real exports sit under `.default` — so `keytar.setPassword` is undefined
 * and every keychain call throws "keytar.setPassword is not a function". Unwrap
 * `.default` (falling back to the namespace itself for environments that DO
 * synthesize named exports) so callers get the real keytar API either way.
 */
export async function getKeytar(): Promise<typeof KeytarModule> {
  const mod = (await import('keytar')) as unknown as
    typeof KeytarModule & { default?: typeof KeytarModule }
  // Prefer named exports when present (real ESM synthesis, and test mocks that
  // expose the API directly) — checking this first avoids touching `.default`
  // at all in those cases, which matters because a strict mock throws on an
  // undefined `.default` access. Only fall back to `.default` (the bundled-CJS
  // shape) when the named export genuinely isn't there.
  if (typeof mod.setPassword === 'function') return mod
  return mod.default as typeof KeytarModule
}
