import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const isProd = process.env.NODE_ENV === 'production'

export const sql = postgres(process.env.DATABASE_URL, {
  max: parseInt(process.env.DB_POOL_MAX ?? '5', 10),
  idle_timeout: 20,
  ssl: isProd ? 'require' : false,
})
export const db = drizzle(sql, { schema })

export async function pingDb(): Promise<void> {
  await sql`SELECT 1`
}
