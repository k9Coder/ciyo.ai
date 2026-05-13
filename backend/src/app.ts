import Fastify from 'fastify'
import cors from '@fastify/cors'
import './types.js'
import { policyRouter } from './policy/router.js'
import { mattersRouter } from './matters/router.js'
import { handleStripeEvent } from './billing/stripe.js'
import { handlePayPalEvent } from './billing/paypal.js'

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  void app.register(cors)

  // Stripe webhook needs raw body for signature verification; everything else gets parsed JSON
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (req.url?.startsWith('/webhooks/stripe')) {
      done(null, body)
    } else {
      try { done(null, JSON.parse(body as string)) }
      catch (e) { done(e as Error) }
    }
  })

  app.post('/webhooks/stripe', async (request, reply) => {
    await handleStripeEvent(request.body as string, (request.headers['stripe-signature'] as string) ?? '')
    return reply.status(200).send({ received: true })
  })

  app.post('/webhooks/paypal', async (request, reply) => {
    await handlePayPalEvent(request.body as Record<string, unknown>)
    return reply.status(200).send({ received: true })
  })

  void app.register(policyRouter, { prefix: '/v1' })
  void app.register(mattersRouter, { prefix: '/v1' })

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err)
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
