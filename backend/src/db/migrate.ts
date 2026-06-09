import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const isProd = process.env.NODE_ENV === 'production'
const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: isProd ? 'require' : false,
})
const db = drizzle(sql)
await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') })
await sql.end()
console.log('Migrations complete')
