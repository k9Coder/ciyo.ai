import http from 'http'
import type { AddressInfo } from 'net'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { members } from '../src/db/schema.js'
import { publishPolicy } from '../src/policy/service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_sse_alice'
const MOCK_JWT           = 'eyJhbGciOiJSUzI1NiJ9.sse.mock'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_sse_alice' }),
}))
vi.mock('@clerk/backend', () => ({ verifyToken: mockVerifyToken }))

let app: FastifyInstance
let tenantId: string
let port: number

beforeAll(async () => {
  app = buildApp()
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
  port = (app.server.address() as AddressInfo).port
})

beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
  const t = await buildTestTenant('ssefirm')
  tenantId  = t.tenantId
  const user = await buildTestUser(MOCK_CLERK_USER_ID, 'sse@acme.com')
  await db.insert(members).values({ tenantId, userId: user.id, email: 'sse@acme.com', role: 'member' })
})

afterAll(async () => { await app.close() })

// ── Helper: open a raw SSE connection and return the IncomingMessage ──────────
function openSSE(token: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${port}/v1/events?token=${token}`,
      (res) => resolve(res),
    )
    req.on('error', reject)
    setTimeout(() => reject(new Error('SSE connect timeout')), 3000)
  })
}

// ── Auth rejection cases ──────────────────────────────────────────────────────

describe('GET /v1/events — auth', () => {
  it('returns 401 when no token query param is provided', async () => {
    const res = await openSSE('')
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when the Clerk JWT is invalid', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('bad jwt'))
    const res = await openSSE('bad.jwt.token')
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when the user has no DB row', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_nobody' })
    const res = await openSSE(MOCK_JWT)
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when the user has no member row', async () => {
    await db.delete(members)
    const res = await openSSE(MOCK_JWT)
    expect(res.statusCode).toBe(401)
  })
})

// ── SSE stream cases ──────────────────────────────────────────────────────────

describe('GET /v1/events — SSE stream', () => {
  it('opens a 200 text/event-stream connection', async () => {
    const res = await openSSE(MOCK_JWT)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')
    expect(res.headers['cache-control']).toBe('no-cache')
    res.destroy()
  })

  it('sends a data frame when publishPolicy fires for the same tenant', async () => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no SSE frame received')), 3000)

      http.get(
        `http://127.0.0.1:${port}/v1/events?token=${MOCK_JWT}`,
        async (res) => {
          res.on('data', (chunk: Buffer) => {
            const frame = chunk.toString()
            if (frame.startsWith(':')) return  // skip comment frames (: connected, : ping)
            clearTimeout(timeout)
            expect(frame).toMatch(/^data:/)
            res.destroy()
            resolve()
          })

          // Trigger the policy update after the connection is open
          await publishPolicy(tenantId, { version: 1 as const, tenantId, subjects: [], siteConfigs: {} })
        },
      ).on('error', reject)
    })
  })

  it('does NOT send a frame when a different tenant publishes', async () => {
    const other = await buildTestTenant('otherfirm')
    let sseRes: http.IncomingMessage | null = null

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sseRes?.destroy()
        resolve()
      }, 500) // pass after 500 ms with no data

      http.get(
        `http://127.0.0.1:${port}/v1/events?token=${MOCK_JWT}`,
        async (res) => {
          sseRes = res
          res.on('data', (chunk: Buffer) => {
            if (chunk.toString().startsWith(':')) return  // skip comment frames
            clearTimeout(timeout)
            res.destroy()
            reject(new Error('received unexpected data frame for wrong tenant'))
          })
          await publishPolicy(other.tenantId, { version: 1 as const, tenantId: other.tenantId, subjects: [], siteConfigs: {} })
        },
      ).on('error', reject)
    })
  })
})
