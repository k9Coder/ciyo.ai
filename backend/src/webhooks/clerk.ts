import { and, eq, isNull } from 'drizzle-orm'
import { Webhook } from 'svix'
import { db } from '../db/client.js'
import { members } from '../db/schema.js'
import { usersClient } from '../http/internal-client.js'
import { env } from '../env.js'
import type { FastifyInstance } from 'fastify'
// NOTE: auto-provisioning a personal tenant used to happen inline here on
// EVERY signup, regardless of which surface (console/extension/desktop)
// triggered it. It's been moved to POST /me/self-serve-org
// (backend/src/me/service.ts::selfServeProvisionOrg), which only console
// calls — see that file for why. If auto-provision-on-signup is ever needed
// back inline here, its logic (tenant + member insert, publishInitialPolicy)
// lives there now, unchanged.

type ClerkWebhookEvent =
  | { type: 'user.created'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'user.updated'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'user.deleted'; data: { id: string; deleted?: boolean } }

export async function clerkWebhookRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/webhooks/clerk', async (req, reply) => {
    const secret = env.CLERK_WEBHOOK_SECRET
    if (!secret) return reply.status(500).send({ error: 'Webhook secret not configured' })

    let event: ClerkWebhookEvent
    try {
      const wh = new Webhook(secret)
      event = wh.verify(req.body as string, {
        'svix-id':        (req.headers['svix-id'] as string) ?? '',
        'svix-timestamp': (req.headers['svix-timestamp'] as string) ?? '',
        'svix-signature': (req.headers['svix-signature'] as string) ?? '',
      }) as ClerkWebhookEvent
    } catch {
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    switch (event.type) {
      case 'user.created': {
        const { id, first_name, last_name, image_url, email_addresses } = event.data
        const email = email_addresses[0]?.email_address ?? ''
        if (!email) break

        const user = (await usersClient.post('/', {
          clerkId:   id,
          email,
          firstName: first_name ?? undefined,
          lastName:  last_name  ?? undefined,
          avatarUrl: image_url  || undefined,
        })).data
        if (!user) break

        // If the user already has any membership (e.g. from seed-fintech), skip
        // both the pending-claim and auto-provision paths entirely.
        const [alreadyEnrolled] = await db.select({ id: members.id })
          .from(members)
          .where(eq(members.userId, user.id))
          .limit(1)
        if (alreadyEnrolled) break

        // Check for pre-enrolled members (userId = null) matching this email
        // — admin-added via POST /members (createMember). This is the only
        // pre-enrollment mechanism left; the token-invite-link check that used
        // to run alongside this (querying the `invites` table) is retired —
        // see backend/src/invites/ and backend/src/app.ts.
        const pending = await db.select({ id: members.id })
          .from(members)
          .where(and(eq(members.email, email), isNull(members.userId)))

        if (pending.length > 0) {
          await usersClient.post('/claim-pending', { email, userId: user.id })
        }
        // No pre-enrollment: leave the user at zero memberships. Console
        // explicitly calls POST /me/self-serve-org to provision a personal
        // org when it sees this state; extension/desktop never do, so a
        // non-enrolled sign-up through those surfaces just stays unusable
        // (auth middleware rejects with "Not enrolled in any organisation").
        break
      }

      case 'user.updated': {
        const { id, first_name, last_name, image_url } = event.data
        await usersClient.patch(`/by-clerk/${id}`, {
          firstName: first_name ?? undefined,
          lastName:  last_name  ?? undefined,
          avatarUrl: image_url  || undefined,
        })
        break
      }

      case 'user.deleted': {
        await usersClient.post(`/by-clerk/${event.data.id}/nullify`, {})
        break
      }
    }

    return reply.status(200).send({ received: true })
  })
}
