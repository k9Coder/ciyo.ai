import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

export const sql = postgres(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })

export async function pingDb(): Promise<void> {
  await sql`SELECT 1`
}
