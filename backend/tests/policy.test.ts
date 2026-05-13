import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import {
  getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback,
} from '../src/policy/service.js'

const SAMPLE = {
  version: 1 as const,
  baseline: [],
  custom: [],
  perSite: {},
  allowSendAnywayWithReason: true,
  auditRetentionDays: 90,
}

let tenantId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
})

describe('publishPolicy', () => {
  it('first publish returns version 1', async () => {
    expect(await publishPolicy(tenantId, SAMPLE)).toBe(1)
  })

  it('increments version on each call', async () => {
    await publishPolicy(tenantId, SAMPLE)
    expect(await publishPolicy(tenantId, SAMPLE)).toBe(2)
  })
})

describe('getVersionOnly', () => {
  it('returns null when no policy exists', async () => {
    expect(await getVersionOnly(tenantId)).toBeNull()
  })

  it('returns the latest version number', async () => {
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, SAMPLE)
    expect(await getVersionOnly(tenantId)).toBe(2)
  })
})

describe('getLatestPolicy', () => {
  it('returns null when no policy exists', async () => {
    expect(await getLatestPolicy(tenantId)).toBeNull()
  })

  it('returns the most recently published row', async () => {
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, { ...SAMPLE, auditRetentionDays: 365 })
    const row = await getLatestPolicy(tenantId)
    expect(row?.version).toBe(2)
    expect((row?.policyJson as typeof SAMPLE).auditRetentionDays).toBe(365)
  })
})

describe('getHistory', () => {
  it('returns versions in descending order', async () => {
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, SAMPLE)
    const history = await getHistory(tenantId)
    expect(history.map(h => h.version)).toEqual([3, 2, 1])
  })
})

describe('rollback', () => {
  it('publishes a copy of a past version as a new version', async () => {
    await publishPolicy(tenantId, { ...SAMPLE, auditRetentionDays: 30 })
    await publishPolicy(tenantId, { ...SAMPLE, auditRetentionDays: 60 })
    const newVer = await rollback(tenantId, 1)
    expect(newVer).toBe(3)
    const latest = await getLatestPolicy(tenantId)
    expect((latest?.policyJson as typeof SAMPLE).auditRetentionDays).toBe(30)
  })

  it('throws for a version that does not exist', async () => {
    await expect(rollback(tenantId, 99)).rejects.toThrow()
  })
})
