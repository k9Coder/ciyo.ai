# Logger System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a singleton Logger class with pluggable transports and wire it into the Fastify app with request lifecycle middleware (Started / Completed / Failed).

**Architecture:** A `Logger` singleton holds an array of `LogTransport` functions; calling `logger.info()/warn()/error()/debug()` fans out a structured `LogEntry` to every transport. The default transport writes JSON to stdout/stderr. A Fastify plugin hooks into `onRequest` and `onResponse` to emit lifecycle events. Adding a Datadog/Coralogix/Logz.io transport later is a one-liner: `logger.addTransport(datadogTransport)`.

**Tech Stack:** TypeScript (ESM), Fastify 4.x, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/src/logger/index.ts` | `Logger` class, `LogEntry` types, `consoleTransport`, exported `logger` singleton |
| Create | `backend/src/logger/request-logging.ts` | Fastify plugin — `onRequest` → Started, `onResponse` → Completed or Failed |
| Create | `backend/src/logger/logger.test.ts` | Unit tests for Logger singleton and transport fan-out |
| Create | `backend/src/logger/request-logging.test.ts` | Integration tests for the Fastify plugin |
| Modify | `backend/src/app.ts` | Register `requestLoggingPlugin`, replace `app.log.error(err)` with `logger.error()` |

---

### Task 1: Logger Singleton Core

**Files:**
- Create: `backend/src/logger/logger.test.ts`
- Create: `backend/src/logger/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/logger/logger.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { Logger, logger, consoleTransport, type LogEntry } from './index.js'

afterEach(() => {
  logger.clearTransports()
  logger.addTransport(consoleTransport)
})

describe('Logger singleton', () => {
  it('returns the same instance on every call', () => {
    expect(Logger.getInstance()).toBe(Logger.getInstance())
  })

  it('exported logger is the singleton instance', () => {
    expect(logger).toBe(Logger.getInstance())
  })
})

describe('Logger.info', () => {
  it('passes a structured entry to registered transports', () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    logger.info('hello world', { key: 'value' })

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      level: 'info',
      message: 'hello world',
      context: { key: 'value' },
    })
    expect(typeof received[0]!.timestamp).toBe('string')
  })

  it('uses empty context when none is provided', () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    logger.info('no context')

    expect(received[0]!.context).toEqual({})
  })
})

describe('Logger.error', () => {
  it('emits an error-level entry', () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    logger.error('something broke', { code: 500 })

    expect(received[0]).toMatchObject({ level: 'error', message: 'something broke' })
  })
})

describe('Logger.warn', () => {
  it('emits a warn-level entry', () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    logger.warn('watch out')

    expect(received[0]).toMatchObject({ level: 'warn', message: 'watch out' })
  })
})

describe('Logger.debug', () => {
  it('emits a debug-level entry', () => {
    const received: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => received.push(e))

    logger.debug('verbose detail', { trace: 'abc' })

    expect(received[0]).toMatchObject({ level: 'debug', message: 'verbose detail' })
  })
})

describe('Logger with multiple transports', () => {
  it('delivers each entry to every transport', () => {
    const t1: LogEntry[] = []
    const t2: LogEntry[] = []
    logger.clearTransports()
    logger.addTransport((e) => t1.push(e))
    logger.addTransport((e) => t2.push(e))

    logger.warn('multicast')

    expect(t1).toHaveLength(1)
    expect(t2).toHaveLength(1)
    expect(t1[0]!.level).toBe('warn')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npm test -- logger/logger.test.ts
```
Expected: fail with `Cannot find module './index.js'`

- [ ] **Step 3: Implement the Logger**

```typescript
// backend/src/logger/index.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

export interface LogEntry {
  level: LogLevel
  message: string
  context: LogContext
  timestamp: string
}

export type LogTransport = (entry: LogEntry) => void

export function consoleTransport(entry: LogEntry): void {
  const line = JSON.stringify({
    time: entry.timestamp,
    level: entry.level,
    msg: entry.message,
    ...entry.context,
  })
  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export class Logger {
  private static instance: Logger | null = null
  private transports: LogTransport[]

  private constructor() {
    this.transports = [consoleTransport]
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  addTransport(transport: LogTransport): void {
    this.transports.push(transport)
  }

  clearTransports(): void {
    this.transports = []
  }

  private emit(level: LogLevel, message: string, context: LogContext = {}): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    }
    for (const transport of this.transports) {
      transport(entry)
    }
  }

  debug(message: string, context?: LogContext): void {
    this.emit('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.emit('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.emit('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.emit('error', message, context)
  }
}

export const logger = Logger.getInstance()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm test -- logger/logger.test.ts
```
Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/logger/index.ts backend/src/logger/logger.test.ts
git commit -m "feat(logger): add Logger singleton with pluggable transports"
```

---

### Task 2: Request Lifecycle Fastify Plugin

**Files:**
- Create: `backend/src/logger/request-logging.test.ts`
- Create: `backend/src/logger/request-logging.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/logger/request-logging.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npm test -- logger/request-logging.test.ts
```
Expected: fail with `Cannot find module './request-logging.js'`

- [ ] **Step 3: Implement the plugin**

```typescript
// backend/src/logger/request-logging.ts
import type { FastifyPluginAsync } from 'fastify'
import { logger } from './index.js'

export const requestLoggingPlugin: FastifyPluginAsync = async (app) => {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm test -- logger/request-logging.test.ts
```
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/logger/request-logging.ts backend/src/logger/request-logging.test.ts
git commit -m "feat(logger): add request lifecycle plugin (Started/Completed/Failed)"
```

---

### Task 3: Wire Logger into app.ts

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Register the plugin and replace the bare `app.log.error()` call**

Open `backend/src/app.ts`. Apply two changes:

**Add import at the top (after existing imports):**
```typescript
import { requestLoggingPlugin } from './logger/request-logging.js'
import { logger } from './logger/index.js'
```

**Register plugin just after `void app.register(cors)`:**
```typescript
void app.register(requestLoggingPlugin)
```

**Replace the error handler body:**
```typescript
app.setErrorHandler((err, _req, reply) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack })
  return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
})
```

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
cd backend && npm test
```
Expected: all tests PASS

- [ ] **Step 3: Smoke test — start the server and hit the health endpoint**

```bash
cd backend && npm run dev
curl http://localhost:3000/health
```
Expected: `{"ok":true}` AND two JSON log lines in the terminal:
```json
{"time":"...","level":"info","msg":"Request Started","method":"GET","url":"/health"}
{"time":"...","level":"info","msg":"Request Completed","statusCode":200,"responseTimeMs":...}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.ts
git commit -m "feat(logger): register request logging plugin in app, replace app.log.error"
```

---

## Adding Future Transports (reference — not a task)

To send logs to Datadog, Coralogix, or Logz.io, create a transport function and register it at startup:

```typescript
// backend/src/logger/transports/datadog.ts
import type { LogTransport } from '../index.js'

export function datadogTransport(apiKey: string): LogTransport {
  return async (entry) => {
    await fetch('https://http-intake.logs.datadoghq.com/api/v2/logs', {
      method: 'POST',
      headers: { 'DD-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: entry.message, level: entry.level, ...entry.context }),
    })
  }
}
```

```typescript
// backend/src/index.ts — wire it in at startup
if (process.env.DD_API_KEY) {
  logger.addTransport(datadogTransport(process.env.DD_API_KEY))
}
```
