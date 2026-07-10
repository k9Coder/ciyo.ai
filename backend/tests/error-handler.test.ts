import { describe, it, expect } from 'vitest'
import { buildErrorBody } from '../src/app.js'

describe('S7: buildErrorBody', () => {
  it('hides the message for 5xx and includes the traceId', () => {
    expect(buildErrorBody(500, 'insert violates foreign key constraint "x"', 'trace-1'))
      .toEqual({ error: 'Internal error', traceId: 'trace-1' })
  })

  it('hides the message for 5xx even without a traceId', () => {
    expect(buildErrorBody(503, 'ECONNREFUSED 10.0.0.1:5432'))
      .toEqual({ error: 'Internal error' })
  })

  it('passes through the message for tagged 4xx', () => {
    expect(buildErrorBody(400, 'invalid siteUrl')).toEqual({ error: 'invalid siteUrl' })
    expect(buildErrorBody(402, 'scan_limit_reached')).toEqual({ error: 'scan_limit_reached' })
  })
})
