import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

// SSL follows the connection string (Neon requires it; local/CI containers
// don't support it) — NODE_ENV is unreliable here, CI runners never set it.
const useSsl = process.env.DATABASE_URL.includes('sslmode=require')
const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: useSsl ? 'require' : false,
})
const db = drizzle(sql)
await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') })
await sql.end()
console.log('Migrations complete')
