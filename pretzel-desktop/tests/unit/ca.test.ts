/**
 * CA cert generation and per-host signing tests.
 * Does NOT test the actual OS trust store install (that requires elevated
 * privileges) — but isCACertTrusted's read-only check IS covered below, with
 * execSync mocked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import forge from 'node-forge'

const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }))

// Mock electron so ca.ts can be imported without a real Electron binary
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/pretzel-test') } }))
vi.mock('child_process', () => ({ execSync: mockExecSync }))

import { generateCACert, signHostCert, signHostCertCached, clearHostCertCache, isCACertTrusted } from '../../electron/ca'

describe('generateCACert', () => {
  it('returns certPem, keyPem, and cert object', () => {
    const ca = generateCACert()
    expect(ca.certPem).toMatch(/^-----BEGIN CERTIFICATE-----/)
    expect(ca.keyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
    expect(ca.cert).toBeDefined()
  })

  it('cert is marked as CA', () => {
    const ca = generateCACert()
    const basicConstraints = ca.cert.getExtension('basicConstraints') as { cA?: boolean } | null
    expect(basicConstraints?.cA).toBe(true)
  })

  it('cert CN is Pretzel Desktop Local CA', () => {
    const ca = generateCACert()
    const cn = ca.cert.subject.getField('CN')?.value
    expect(cn).toBe('Pretzel Desktop Local CA')
  })

  it('cert is valid for at least 9 years from now', () => {
    const ca = generateCACert()
    const nineYears = new Date()
    nineYears.setFullYear(nineYears.getFullYear() + 9)
    expect(ca.cert.validity.notAfter.getTime()).toBeGreaterThan(nineYears.getTime())
  })

  it('cert is self-signed (issuer equals subject)', () => {
    const ca = generateCACert()
    const subjectCN = ca.cert.subject.getField('CN')?.value
    const issuerCN = ca.cert.issuer.getField('CN')?.value
    expect(subjectCN).toBe(issuerCN)
  })
})

describe('signHostCert', () => {
  it('returns certPem and keyPem for a given hostname', () => {
    const ca = generateCACert()
    const host = signHostCert('api.openai.com', ca)
    expect(host.certPem).toMatch(/^-----BEGIN CERTIFICATE-----/)
    expect(host.keyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
  })

  it('host cert CN matches hostname', () => {
    const ca = generateCACert()
    const host = signHostCert('chat.openai.com', ca)
    const cert = forge.pki.certificateFromPem(host.certPem)
    expect(cert.subject.getField('CN')?.value).toBe('chat.openai.com')
  })

  it('host cert is issued by the CA', () => {
    const ca = generateCACert()
    const host = signHostCert('example.com', ca)
    const cert = forge.pki.certificateFromPem(host.certPem)
    const issuerCN = cert.issuer.getField('CN')?.value
    expect(issuerCN).toBe('Pretzel Desktop Local CA')
  })

  it('host cert verifies against CA cert', () => {
    const ca = generateCACert()
    const host = signHostCert('example.com', ca)
    const hostCert = forge.pki.certificateFromPem(host.certPem)
    // Verify the signature — throws if invalid
    expect(() => ca.cert.verify(hostCert)).not.toThrow()
  })

  it('host cert has SAN for the hostname', () => {
    const ca = generateCACert()
    const host = signHostCert('secure.example.com', ca)
    const cert = forge.pki.certificateFromPem(host.certPem)
    const san = cert.getExtension('subjectAltName') as { altNames?: Array<{ type: number; value: string }> } | null
    const hasDns = san?.altNames?.some(n => n.type === 2 && n.value === 'secure.example.com')
    expect(hasDns).toBe(true)
  })
})

describe('S8: signHostCertCached', () => {
  it('reuses the cached cert for repeated calls (no re-keygen)', () => {
    clearHostCertCache()
    const ca = generateCACert()
    const a = signHostCertCached('cache.example.com', ca)
    const b = signHostCertCached('cache.example.com', ca)
    expect(b).toBe(a)
  })

  it('returns a valid host cert on the first call', () => {
    clearHostCertCache()
    const ca = generateCACert()
    const host = signHostCertCached('first.example.com', ca)
    const cert = forge.pki.certificateFromPem(host.certPem)
    expect(cert.subject.getField('CN')?.value).toBe('first.example.com')
  })

  it('rebuilds the cache when the CA changes', () => {
    clearHostCertCache()
    const ca1 = generateCACert()
    const ca2 = generateCACert()
    const a = signHostCertCached('host.example.com', ca1)
    const b = signHostCertCached('host.example.com', ca2)
    expect(b).not.toBe(a)
  })
})

describe('isCACertTrusted (win32)', () => {
  const realPlatform = process.platform
  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: p, configurable: true })
  }

  afterEach(() => {
    setPlatform(realPlatform)
    mockExecSync.mockReset()
  })

  it('false when the store listing does not mention our CA', () => {
    setPlatform('win32')
    // Regression: `certutil -store Root "<CN>"` exits 0 ("command completed
    // successfully") even when the filter matches nothing, so checking the
    // exit code alone can never observe "not trusted" — it must inspect the
    // actual listing.
    mockExecSync.mockReturnValue('================ Certificate 0 ================\nSome Other CA\nCertUtil: -store command completed successfully.\n')
    expect(isCACertTrusted()).toBe(false)
  })

  it('true when the store listing includes our CA CN', () => {
    setPlatform('win32')
    mockExecSync.mockReturnValue('================ Certificate 3 ================\nIssuer: CN=Pretzel Desktop Local CA, O=mykka.ai\n...\nCertUtil: -store command completed successfully.\n')
    expect(isCACertTrusted()).toBe(true)
  })

  it('false when the command itself throws', () => {
    setPlatform('win32')
    mockExecSync.mockImplementation(() => { throw new Error('certutil not found') })
    expect(isCACertTrusted()).toBe(false)
  })
})
