import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { logger } from './index.js'

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    logger.info('Request Started', {
      method: request.method,
      url: request.url,
      requestId: request.id,
      ip: request.ip,
    })
  })

  app.addHook('onResponse', async (request, reply) => {
    const isError = reply.statusCode >= 400
    if (isError) {
      logger.error('Request Failed', {
        method: request.method,
        url: request.url,
        requestId: request.id,
        statusCode: reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      })
    } else {
      logger.info('Request Completed', {
        method: request.method,
        url: request.url,
        requestId: request.id,
        statusCode: reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      })
    }
  })
}

export const requestLoggingPlugin = fp(plugin, { name: 'request-logging' })
