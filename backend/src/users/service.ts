import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, members, type User, type NewUser } from '../db/schema.js'

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkId, clerkId))
  return row ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email))
  return row ?? null
}

export async function createUser(
  data: Pick<NewUser, 'clerkId' | 'email' | 'firstName' | 'lastName' | 'avatarUrl'>,
): Promise<User | null> {
  const [row] = await db.insert(users).values(data).onConflictDoNothing().returning()
  if (row) return row
  // Conflict — user already exists (e.g. seeded); return existing row
  return getUserByEmail(data.email)
}

export async function updateUserProfile(
  clerkId: string,
  data: Partial<Pick<NewUser, 'firstName' | 'lastName' | 'avatarUrl'>>,
): Promise<void> {
  await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId))
}

export async function nullifyClerkId(clerkId: string): Promise<void> {
  await db.update(users).set({ clerkId: null }).where(eq(users.clerkId, clerkId))
}

export async function setPlatformAdmin(userId: string, value: boolean): Promise<void> {
  await db.update(users).set({ isPlatformAdmin: value }).where(eq(users.id, userId))
}

// Connects pre-enrolled members (userId = null) to a newly-signed-up user.
export async function claimPendingMembers(email: string, userId: string): Promise<void> {
  await db.update(members)
    .set({ userId })
    .where(and(eq(members.email, email), isNull(members.userId)))
}
