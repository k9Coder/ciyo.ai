import { and, eq, isNull } from 'drizzle-orm'
import { Webhook } from 'svix'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'
import { generateSecret, hashToken } from '../auth/tokens.js'
import { createUser, updateUserProfile, nullifyClerkId, claimPendingMembers } from '../users/service.js'
import type { FastifyInstance } from 'fastify'

type ClerkWebhookEvent =
  | { type: 'user.created'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'user.updated'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'user.deleted'; data: { id: string; deleted?: boolean } }

export async function clerkWebhookRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/webhooks/clerk', async (req, reply) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET
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

        const user = await createUser({
          clerkId:   id,
          email,
          firstName: first_name ?? undefined,
          lastName:  last_name  ?? undefined,
          avatarUrl: image_url  || undefined,
        })
        if (!user) break

        // Check for pre-enrolled members (userId = null) matching this email
        const pending = await db.select({ id: members.id })
          .from(members)
          .where(and(eq(members.email, email), isNull(members.userId)))

        if (pending.length > 0) {
          await claimPendingMembers(email, user.id)
        } else {
          // No pre-enrollment — auto-provision a tenant for this user
          const localPart = email.split('@')[0] ?? email
          const base = localPart.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
          const suffix = Math.random().toString(36).slice(2, 7)
          const slug = `${base}-${suffix}`

          const orgSecret   = generateSecret()
          const adminSecret = generateSecret()

          const [tenant] = await db.insert(tenants).values({
            name:               `${first_name ?? localPart}'s Organization`,
            slug,
            orgTokenHash:       await hashToken(orgSecret),
            adminTokenHash:     await hashToken(adminSecret),
            paymentProvider:    'stripe',
            externalSubId:      `sub_auto_${slug}`,
            subscriptionStatus: 'active',
            plan:               'pro',
          }).returning({ id: tenants.id })

          await db.insert(members).values({
            tenantId: tenant!.id,
            userId:   user.id,
            email,
            role:     'super_admin',
          })
        }
        break
      }

      case 'user.updated': {
        const { id, first_name, last_name, image_url } = event.data
        await updateUserProfile(id, {
          firstName: first_name ?? undefined,
          lastName:  last_name  ?? undefined,
          avatarUrl: image_url  || undefined,
        })
        break
      }

      case 'user.deleted': {
        await nullifyClerkId(event.data.id)
        break
      }
    }

    return reply.status(200).send({ received: true })
  })
}
