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
