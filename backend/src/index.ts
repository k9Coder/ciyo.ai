import { buildApp } from './app.js'

const app = buildApp()

const close = () => app.close().then(() => process.exit(0), () => process.exit(1))
process.on('SIGTERM', close)
process.on('SIGINT',  close)

await app.listen({ port: Number(process.env['PORT'] ?? 3000), host: '0.0.0.0' })
