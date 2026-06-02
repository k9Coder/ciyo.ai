import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import { logger, consoleTransport, type LogEntry } from './index.js'
import { requestLoggingPlugin } from './request-logging.js'

afterEach(() => {
  logger.clearTransports()
  logger.addTransport(consoleTransport)
})

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(requestLoggingPlugin)
  app.get('/ok', async () => ({ ok: true }))
  app.get('/bad', async () => { throw new Error('boom') })
  app.setErrorHandler((err, _req, reply) => reply.status(500).send({ error: err.message }))
  await app.ready()
  return app
}

describe('requestLoggingPlugin — Request Started', () => {
  it('emits "Request Started" for every incoming request', async () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    const app = await buildTestApp()
    await app.inject({ method: 'GET', url: '/ok' })

    const started = received.find((e) => e.message === 'Request Started')
    expect(started).toBeDefined()
    expect(started!.context).toMatchObject({ method: 'GET', url: '/ok' })
    expect(started!.level).toBe('info')
  })
})

describe('requestLoggingPlugin — Request Completed', () => {
  it('emits "Request Completed" for 2xx responses', async () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    const app = await buildTestApp()
    await app.inject({ method: 'GET', url: '/ok' })

    const completed = received.find((e) => e.message === 'Request Completed')
    expect(completed).toBeDefined()
    expect(completed!.context).toMatchObject({ method: 'GET', url: '/ok', statusCode: 200 })
    expect(typeof completed!.context['responseTimeMs']).toBe('number')
    expect(completed!.level).toBe('info')
  })
})

describe('requestLoggingPlugin — Request Failed', () => {
  it('emits "Request Failed" for 4xx/5xx responses', async () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    const app = await buildTestApp()
    await app.inject({ method: 'GET', url: '/bad' })

    const failed = received.find((e) => e.message === 'Request Failed')
    expect(failed).toBeDefined()
    expect(failed!.context).toMatchObject({ method: 'GET', url: '/bad', statusCode: 500 })
    expect(failed!.level).toBe('error')
  })

  it('does not emit "Request Completed" for failed requests', async () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    const app = await buildTestApp()
    await app.inject({ method: 'GET', url: '/bad' })

    const completed = received.find((e) => e.message === 'Request Completed')
    expect(completed).toBeUndefined()
  })
})
