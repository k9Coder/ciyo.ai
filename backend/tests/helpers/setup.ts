import type { AddressInfo } from 'net'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

export interface TestApp {
  app: FastifyInstance
  port: number
}

export async function startTestApp(): Promise<TestApp> {
  const app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as AddressInfo).port
  process.env['INTERNAL_API_URL'] = `http://127.0.0.1:${port}`
  return { app, port }
}
