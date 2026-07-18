const RESET_FLAG = 'ALLOW_E2E_DATABASE_RESET'

export function assertDisposableE2EDatabase(operation: string) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error(`[${operation}] DATABASE_URL is required`)

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[${operation}] refusing to run against NODE_ENV=production`)
  }

  if (process.env[RESET_FLAG] !== 'true') {
    throw new Error(`[${operation}] refusing destructive E2E reset without ${RESET_FLAG}=true`)
  }

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error(`[${operation}] DATABASE_URL must be a valid PostgreSQL URL`)
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`[${operation}] DATABASE_URL must use postgres/postgresql protocol`)
  }

  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase()
  if (!/(^|[_-])(e2e|test)([_-]|$)/.test(databaseName)) {
    throw new Error(`[${operation}] refusing to reset database "${databaseName}" because its name is not marked as e2e/test`)
  }
}
