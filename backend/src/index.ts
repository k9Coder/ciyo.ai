import { buildApp } from './app.js'
import { logger } from './logger/index.js'
import { pingDb } from './db/client.js'

const port = Number(process.env['PORT'] ?? 3000)

const appEnv = process.env['APP_ENV']
logger.info(`ciyo-api starting on :${port}${appEnv ? `  [ENV: ${appEnv}]` : ''}`)

try {
  logger.info('connecting to database...')
  await pingDb()
  logger.info('database connected')
} catch (err) {
  logger.error('database connection failed — check DATABASE_URL', { error: (err as Error).message })
  process.exit(1)
}

const app = buildApp()

const close = () => app.close().then(() => process.exit(0), () => process.exit(1))
process.on('SIGTERM', close)
process.on('SIGINT',  close)

await app.listen({ port, host: '0.0.0.0' })
logger.info(`listening on http://0.0.0.0:${port}`)
