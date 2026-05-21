import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import {
  getAnalyticsSummary,
  getAnalyticsDaily,
  getAnalyticsIncidents,
  getAnalyticsTopSites,
  getAnalyticsBySubject,
} from './service.js'

function parseDays(raw: string | undefined): 7 | 30 | 90 {
  const n = Number(raw ?? '30')
  return ([7, 30, 90] as const).includes(n as 7 | 30 | 90) ? (n as 7 | 30 | 90) : 30
}

export async function analyticsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/analytics/summary', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { days } = req.query as { days?: string }
    return getAnalyticsSummary(req.tenant.id, parseDays(days))
  })

  fastify.get('/analytics/daily', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return getAnalyticsDaily(req.tenant.id)
  })

  fastify.get('/analytics/incidents', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return getAnalyticsIncidents(req.tenant.id)
  })

  fastify.get('/analytics/top-sites', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { days } = req.query as { days?: string }
    return getAnalyticsTopSites(req.tenant.id, parseDays(days))
  })

  fastify.get('/analytics/by-subject', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { days } = req.query as { days?: string }
    return getAnalyticsBySubject(req.tenant.id, parseDays(days))
  })
}
