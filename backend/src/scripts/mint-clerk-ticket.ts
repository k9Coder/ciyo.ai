// Mint a Clerk sign-in token and print a ready-to-open console URL that logs
// that user in headlessly — no password, no Google OAuth, no Turnstile.
//
// WHY: automated QA / a headless browser can't complete Clerk's interactive
// sign-in (Google consent + Cloudflare Turnstile block bots by design). A Clerk
// sign-in token is the Backend-API-blessed way to establish a REAL session
// (with a valid JWT) for an existing user — the exact approach the e2e
// invite-signup fixme points to. Navigating the app to
// `<app>/?__clerk_ticket=<token>` makes the Clerk client consume the ticket and
// sign in.
//
// Usage:
//   npm run mint-clerk-ticket -- --email you@example.com
//   npm run mint-clerk-ticket -- --clerk-id user_123 --app-url http://localhost:5173
//
// SECURITY: this creates a live session for a real user. Dev/QA only. Never run
// against a production Clerk instance you don't own.
import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'
import { env } from '../env.js'

type Flags = { email?: string; clerkId?: string; appUrl: string; ttl: number }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { appUrl: 'http://localhost:5173', ttl: 600 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--email') flags.email = argv[++i]?.toLowerCase()
    else if (a === '--clerk-id') flags.clerkId = argv[++i]
    else if (a === '--app-url') flags.appUrl = argv[++i]!.replace(/\/$/, '')
    else if (a === '--ttl') flags.ttl = Number(argv[++i])
    else if (a === '--help' || a === '-h') { console.log('--email <e> | --clerk-id <id> [--app-url <url>] [--ttl <seconds>]'); process.exit(0) }
    else { console.error(`Unknown arg: ${a}`); process.exit(1) }
  }
  if (!flags.email && !flags.clerkId) { console.error('Provide --email or --clerk-id'); process.exit(1) }
  return flags
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

  let userId = flags.clerkId
  if (!userId) {
    const res = await clerk.users.getUserList({ emailAddress: [flags.email!], limit: 1 })
    const list = Array.isArray(res) ? res : res.data
    const u = list[0]
    if (!u) { console.error(`No Clerk user for ${flags.email}`); process.exit(1) }
    userId = u.id
  }

  const token = await clerk.signInTokens.createSignInToken({ userId: userId!, expiresInSeconds: flags.ttl })

  const url = `${flags.appUrl}/?__clerk_ticket=${token.token}`
  console.log(url)
  console.error(`[mint-clerk-ticket] user=${userId} ttl=${flags.ttl}s — open the URL on stdout to sign in.`)
}

main().catch(err => { console.error(err); process.exit(1) })
