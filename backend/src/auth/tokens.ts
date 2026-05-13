import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

export interface ParsedToken {
  prefix: 'ps_live' | 'ps_adm'
  slug: string
  secret: string
}

const TOKEN_RE = /^(ps_live|ps_adm)_([a-z][a-z0-9]*)_([A-Za-z0-9_-]{32})$/

export function parseToken(token: string): ParsedToken | null {
  const m = token.match(TOKEN_RE)
  if (!m) return null
  return { prefix: m[1] as ParsedToken['prefix'], slug: m[2]!, secret: m[3]! }
}

/** 24 random bytes → 32 base64url chars (no padding). */
export function generateSecret(): string {
  return randomBytes(24).toString('base64url')
}

export function formatToken(prefix: 'ps_live' | 'ps_adm', slug: string, secret: string): string {
  return `${prefix}_${slug}_${secret}`
}

export async function hashToken(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10)
}

export async function compareToken(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash)
}
