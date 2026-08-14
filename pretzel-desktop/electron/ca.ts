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
import { getKeytar } from './keytar-interop'

const KEYCHAIN_SERVICE = 'pretzel-desktop'
const KEYCHAIN_ACCOUNT = 'local-ca-key'
const CA_CERT_FILENAME = 'pretzel-ca.crt'
/** Common Name of the CA — used to look it up in the OS trust store. */
const CA_COMMON_NAME = 'Pretzel Desktop Local CA'

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

/**
 * Is our CA already trusted in the OS root store? Lets us install it once and
 * skip (or re-attempt) on later launches, and — critically — recover when a
 * first-run install was silently skipped because the app wasn't elevated.
 */
export function isCACertTrusted(): boolean {
  try {
    switch (process.platform) {
      case 'darwin':
        execSync(`security find-certificate -c "${CA_COMMON_NAME}" /Library/Keychains/System.keychain`, { stdio: 'ignore' })
        return true
      case 'win32':
        // certutil exits non-zero if the store has no cert matching the CN.
        execSync(`certutil -store Root "${CA_COMMON_NAME}"`, { stdio: 'ignore' })
        return true
      case 'linux':
        return fs.existsSync('/usr/local/share/ca-certificates/pretzel-ca.crt')
      default:
        return false
    }
  } catch {
    return false
  }
}

/**
 * Install the CA cert into the OS trust store, elevating with a single native
 * prompt (UAC on Windows, admin password on macOS, pkexec on Linux). Writing to
 * the machine root store requires admin, so a plain unelevated exec silently
 * failed before — leaving the MITM proxy untrusted (ERR_CERT_AUTHORITY_INVALID)
 * with only a "Proxy start failed" log. Rejects if the user cancels the prompt.
 */
export async function installCACert(certPath: string): Promise<void> {
  switch (process.platform) {
    case 'darwin': {
      const inner = `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \\"${certPath}\\"`
      // osascript shows the native admin dialog and runs the command as root.
      execSync(`osascript -e 'do shell script "${inner}" with administrator privileges'`)
      break
    }
    case 'win32': {
      // Start-Process -Verb RunAs triggers the UAC prompt; -Wait so we don't
      // return before the store write completes.
      const ps = `Start-Process -FilePath certutil -ArgumentList '-addstore','Root','"${certPath}"' -Verb RunAs -Wait`
      execSync(`powershell -NoProfile -Command "${ps}"`)
      break
    }
    case 'linux': {
      // pkexec pops the polkit auth dialog on desktop Linux.
      execSync(`pkexec sh -c 'cp "${certPath}" /usr/local/share/ca-certificates/pretzel-ca.crt && update-ca-certificates'`)
      break
    }
  }
}

/** Store the CA private key PEM in the OS keychain. */
export async function storeCAKeyInKeychain(keyPem: string): Promise<void> {
  const keytar = await getKeytar()
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, keyPem)
}

/** Retrieve the CA private key PEM from the OS keychain. Returns null if not stored. */
export async function loadCAKeyFromKeychain(): Promise<string | null> {
  const keytar = await getKeytar()
  return keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
}
