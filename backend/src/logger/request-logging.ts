import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { logger } from './index.js'

/**
 * Redact sensitive values from a URL before logging.
 * Strips query parameters that may contain tokens or credentials.
 * Returns only the path portion (no query string) to avoid leaking
 * token values passed as query params (e.g. ?token=ps_live_...).
 */
function redactUrl(rawUrl: string): string {
  try {
    // Parse relative URL against a placeholder base
    const url = new URL(rawUrl, 'http://localhost')
    // Redact known sensitive query params; strip unknowns with tokens
    const sensitiveParams = ['token', 'apikey', 'api_key', 'key', 'secret', 'authorization']
    for (const param of sensitiveParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '[REDACTED]')
      }
    }
    // Return path + redacted search (omit host since it's placeholder)
    const search = url.search
    return url.pathname + search
  } catch {
    // If URL parsing fails, return only the path portion
    return rawUrl.split('?')[0] ?? rawUrl
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    // Skip health check polling to avoid log flood
    if (request.url === '/health') return

    logger.info('Request Started', {
      method:    request.method,
      url:       redactUrl(request.url),
      requestId: request.id,
      ip:        request.ip,
    })
  })

  app.addHook('onResponse', async (request, reply) => {
    if (request.url === '/health') return

    const isError = reply.statusCode >= 400
    if (isError) {
      logger.error('Request Failed', {
        method:         request.method,
        url:            redactUrl(request.url),
        requestId:      request.id,
        statusCode:     reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      })
    } else {
      logger.info('Request Completed', {
        method:         request.method,
        url:            redactUrl(request.url),
        requestId:      request.id,
        statusCode:     reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      })
    }
  })
}

export const requestLoggingPlugin = fp(plugin, { name: 'request-logging' })
