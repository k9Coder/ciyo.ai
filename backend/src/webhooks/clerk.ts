import { eq } from 'drizzle-orm'
import { Webhook } from 'svix'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'
import type { FastifyInstance } from 'fastify'

type ClerkWebhookEvent =
  | { type: 'organization.created'; data: { id: string; name: string; slug: string; created_by: string } }
  | { type: 'organizationMembership.created'; data: { organization: { id: string }; public_user_data: { user_id: string; first_name: string | null; last_name: string | null; image_url: string; identifier: string }; role: string } }
  | { type: 'user.updated'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'organizationMembership.deleted'; data: { organization: { id: string }; public_user_data: { user_id: string; identifier: string } } }

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
      case 'organization.created': {
        const { id, name, slug } = event.data
        await db.insert(tenants).values({
          name,
          slug:               slug.slice(0, 50),
          clerkOrgId:         id,
          orgTokenHash:       '',
          adminTokenHash:     '',
          paymentProvider:    'clerk',
          externalSubId:      id,
          subscriptionStatus: 'active',
          plan:               'pro',
        }).onConflictDoNothing()
        break
      }

      case 'organizationMembership.created': {
        const { organization, public_user_data: u, role } = event.data
        const [tenant] = await db.select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.clerkOrgId, organization.id))
        if (!tenant) break
        await db.insert(members).values({
          tenantId:  tenant.id,
          email:     u.identifier,
          clerkId:   u.user_id,
          firstName: u.first_name ?? undefined,
          lastName:  u.last_name ?? undefined,
          avatarUrl: u.image_url,
          role:      role === 'org:admin' ? 'super_admin' : 'member',
        }).onConflictDoNothing()
        break
      }

      case 'user.updated': {
        const { id, first_name, last_name, image_url } = event.data
        await db.update(members)
          .set({ firstName: first_name ?? undefined, lastName: last_name ?? undefined, avatarUrl: image_url })
          .where(eq(members.clerkId, id))
        break
      }

      case 'organizationMembership.deleted': {
        const { organization, public_user_data: u } = event.data
        const [tenant] = await db.select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.clerkOrgId, organization.id))
        if (!tenant) break
        await db.delete(members)
          .where(eq(members.clerkId, u.user_id))
        break
      }
    }

    return reply.status(200).send({ received: true })
  })
}
