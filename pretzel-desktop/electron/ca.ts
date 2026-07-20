/**
 * Local CA cert lifecycle.
 * Generates a self-signed CA cert, stores the private key in the OS keychain,
 * and installs the cert into the OS trust store so the MITM proxy can sign
 * per-host certs on the fly.
 */
import forge from 'node-forge'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const KEYCHAIN_SERVICE = 'pretzel-desktop'
const KEYCHAIN_ACCOUNT = 'local-ca-key'
const CA_CERT_FILENAME = 'pretzel-ca.crt'

export interface CACert {
  cert: forge.pki.Certificate
  certPem: string
  keyPem: string
}

/** Generate a new self-signed CA cert valid for 10 years. */
export function generateCACert(): CACert {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10)

  const attrs = [
    { name: 'commonName', value: 'Pretzel Desktop Local CA' },
    { name: 'organizationName', value: 'mykka.ai' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' },
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    cert,
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

/** Sign a per-host certificate using the CA cert. Used by the proxy for each CONNECT target. */
export function signHostCert(hostname: string, ca: CACert): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  cert.setSubject([{ name: 'commonName', value: hostname }])
  cert.setIssuer(ca.cert.subject.attributes)
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ])

  const caKey = forge.pki.privateKeyFromPem(ca.keyPem)
  cert.sign(caKey, forge.md.sha256.create())

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

// Per-host cert cache. Signing a cert generates a fresh 2048-bit RSA keypair, which
// is CPU-heavy; without caching a page can fan out CONNECTs to many hostnames and peg
// the user's machine. Certs are stable for a session, so memoize by hostname. Reset
// when the CA changes so we never serve a host cert signed by a stale CA.
const hostCertCache = new Map<string, { certPem: string; keyPem: string }>()
let hostCertCacheCaPem: string | null = null

/** Cached wrapper around signHostCert — use this on the proxy hot path. */
export function signHostCertCached(hostname: string, ca: CACert): { certPem: string; keyPem: string } {
  if (hostCertCacheCaPem !== ca.certPem) {
    hostCertCache.clear()
    hostCertCacheCaPem = ca.certPem
  }
  const cached = hostCertCache.get(hostname)
  if (cached) return cached
  const fresh = signHostCert(hostname, ca)
  hostCertCache.set(hostname, fresh)
  return fresh
}

/** Clear the per-host cert cache (e.g. on CA rotation or shutdown). */
export function clearHostCertCache(): void {
  hostCertCache.clear()
  hostCertCacheCaPem = null
}

/** Persist CA cert PEM to app user data dir. */
export function saveCACertFile(certPem: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  const dir = app.getPath('userData')
  const certPath = path.join(dir, CA_CERT_FILENAME)
  fs.writeFileSync(certPath, certPem, 'utf-8')
  return certPath
}

/** Install CA cert into OS trust store. Requires elevated privileges on first run. */
export function installCACert(certPath: string): void {
  switch (process.platform) {
    case 'darwin':
      execSync(`security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`)
      break
    case 'win32':
      execSync(`certutil -addstore Root "${certPath}"`)
      break
    case 'linux':
      execSync(`cp "${certPath}" /usr/local/share/ca-certificates/pretzel-ca.crt && update-ca-certificates`)
      break
  }
}

/** Store the CA private key PEM in the OS keychain. */
export async function storeCAKeyInKeychain(keyPem: string): Promise<void> {
  const keytar = await import('keytar')
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, keyPem)
}

/** Retrieve the CA private key PEM from the OS keychain. Returns null if not stored. */
export async function loadCAKeyFromKeychain(): Promise<string | null> {
  const keytar = await import('keytar')
  return keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
}
