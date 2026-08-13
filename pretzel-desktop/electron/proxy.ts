/**
 * HTTPS MITM proxy daemon.
 *
 * Listens on 127.0.0.1:PROXY_PORT. For CONNECT tunnels to MONITORED hosts it
 * terminates TLS with an on-the-fly signed cert, runs @mykka/detect on the
 * request body, and forwards or blocks based on the result. Every other host
 * is blind-tunnelled (raw TCP pipe, no interception) so we never MITM banking,
 * email, SSO, or cert-pinned traffic.
 *
 *   monitored host, mutating (POST/PUT/PATCH):
 *                    client → TLS-terminate → detect → forward/block → upstream
 *   monitored host, other methods (GET/asset/poll):
 *                    client → TLS-terminate → stream straight through (no detect)
 *   other host:      client → raw pipe → upstream   (no TLS interception)
 *
 * Only mutating requests can carry a prompt, so only those are buffered and
 * inspected; everything else is streamed to keep the site fast and intact.
 *
 * Streaming/SSE: the request body (the prompt) is buffered — it is a small
 * JSON POST — but the upstream RESPONSE is piped straight through and never
 * buffered, so token-streaming (SSE) responses flow unbroken.
 */
import http from 'http'
import https from 'https'
import net from 'net'
import tls from 'tls'
import { EventEmitter } from 'events'
import { detectPrompt } from '@mykka/detect'
import type { Policy, DetectionResult } from '@mykka/detect'
import { signHostCertCached, type CACert } from './ca'

export const PROXY_PORT = 18888

/** Max request body we will buffer for inspection (2 MB). Larger → forward unscanned. */
const MAX_INSPECT_BYTES = 2 * 1024 * 1024

/** How long we hold a request waiting for a user decision before applying failMode. */
const DECISION_TIMEOUT_MS = 30_000

/**
 * Hosts we TLS-intercept. Everything else is blind-tunnelled. Keep in sync with
 * the extension manifest host list (pretzel/manifest.config.ts).
 */
const MONITORED_HOST_RE = /(^|\.)(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com)$/i

export function isMonitoredHost(hostname: string): boolean {
  return MONITORED_HOST_RE.test(hostname)
}

export interface ProxyDecisionEvent {
  requestId: string
  hostname: string
  result: DetectionResult
  resolve: (allow: boolean) => void
}

/**
 * Pure detection step — exported for unit testing without a live socket.
 * Returns the detection result for a request body on a given host.
 */
export async function evaluateRequest(
  policy: Policy,
  hostname: string,
  body: string,
): Promise<DetectionResult> {
  return detectPrompt({ text: body, hostname, inputType: 'prompt' }, policy)
}

/** True if a detection result requires holding the request for a user decision. */
export function needsDecision(result: DetectionResult): boolean {
  return result.highestAction === 'warn' || result.highestAction === 'block'
}

export class PretzelProxy extends EventEmitter {
  private server: http.Server | null = null
  private ca: CACert | null = null
  private policy: Policy | null = null
  private pending = new Map<string, (allow: boolean) => void>()

  setCA(ca: CACert): void {
    this.ca = ca
  }

  setPolicy(policy: Policy): void {
    this.policy = policy
  }

  /** Resolve a held request from the decision UI. No-op if already settled/expired. */
  resolveDecision(requestId: string, allow: boolean): void {
    const resolve = this.pending.get(requestId)
    if (!resolve) return
    this.pending.delete(requestId)
    resolve(allow)
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer()
      this.server.on('connect', (req, socket, head) => {
        this.handleConnect(req, socket as net.Socket, head)
      })
      this.server.on('error', reject)
      this.server.listen(PROXY_PORT, '127.0.0.1', () => resolve())
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const [id, r] of this.pending) { r(this.failOpen()); this.pending.delete(id) }
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  private failOpen(): boolean {
    return (this.policy?.failMode ?? 'open') === 'open'
  }

  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    const [rawHost, portStr] = (req.url ?? '').split(':')
    const hostname = rawHost ?? ''
    const port = parseInt(portStr ?? '443', 10)

    clientSocket.on('error', () => clientSocket.destroy())

    // Not a monitored host, or not ready → blind tunnel (no TLS interception).
    if (!this.ca || !this.policy || !isMonitoredHost(hostname)) {
      this.blindTunnel(hostname, port, clientSocket, head)
      return
    }

    let hostCert: { certPem: string; keyPem: string }
    try {
      hostCert = signHostCertCached(hostname, this.ca)
    } catch {
      this.blindTunnel(hostname, port, clientSocket, head)
      return
    }

    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

    const tlsSocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      key: hostCert.keyPem,
      cert: hostCert.certPem,
    })
    tlsSocket.on('error', () => tlsSocket.destroy())

    const interceptServer = http.createServer((clientReq, clientRes) => {
      void this.handleInterceptedRequest(hostname, port, clientReq, clientRes)
    })
    // Upgrades (WebSocket) are not inspected — pass them straight upstream.
    interceptServer.on('upgrade', (upReq, upSocket) => {
      this.tunnelUpgrade(hostname, port, upReq, upSocket as net.Socket)
    })
    interceptServer.emit('connection', tlsSocket)
  }

  private blindTunnel(hostname: string, port: number, clientSocket: net.Socket, head: Buffer): void {
    const upstream = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    upstream.on('error', () => clientSocket.destroy())
  }

  // Hop-by-hop headers must not be forwarded to the upstream (RFC 7230 §6.1).
  // Passing them through — especially after downgrading the client's HTTP/2 to
  // the HTTP/1.1 we speak upstream — is what let chatgpt's edge reject the
  // re-emitted request with 431 (Request Header Fields Too Large).
  private static readonly HOP_BY_HOP = new Set([
    'connection', 'proxy-connection', 'keep-alive', 'transfer-encoding',
    'upgrade', 'te', 'trailer', 'proxy-authorization',
  ])

  private sanitizeHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
    const out: http.OutgoingHttpHeaders = {}
    for (const [k, v] of Object.entries(headers)) {
      if (v === undefined) continue
      if (PretzelProxy.HOP_BY_HOP.has(k.toLowerCase())) continue
      out[k] = v
    }
    return out
  }

  private async handleInterceptedRequest(
    hostname: string,
    port: number,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): Promise<void> {
    // Only mutating requests can carry a prompt body — inspect just those.
    // Everything else on a monitored host (GET page loads, static assets, SSE
    // polls like /sentinel/ping) is streamed straight through with no buffering,
    // which is both faster and avoids corrupting non-prompt traffic.
    const method = (clientReq.method ?? 'GET').toUpperCase()
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
      this.forwardStream(hostname, port, clientReq, clientRes)
      return
    }

    // Buffer the request body (capped). Prompts are small JSON POSTs.
    const chunks: Buffer[] = []
    let total = 0
    let truncated = false
    for await (const chunk of clientReq) {
      const buf = chunk as Buffer
      total += buf.length
      if (total > MAX_INSPECT_BYTES) { truncated = true; break }
      chunks.push(buf)
    }
    const bodyBuf = Buffer.concat(chunks)
    const body = bodyBuf.toString('utf-8')

    if (!truncated && body.length > 0 && this.policy) {
      try {
        const result = await evaluateRequest(this.policy, hostname, body)
        if (needsDecision(result)) {
          const allowed = await this.awaitDecision(hostname, result)
          if (!allowed) {
            clientRes.writeHead(403, { 'Content-Type': 'text/plain' })
            clientRes.end('Blocked by Pretzel Desktop policy')
            return
          }
        }
      } catch {
        // Detection failure → fail per policy failMode.
        if (!this.failOpen()) {
          clientRes.writeHead(403, { 'Content-Type': 'text/plain' })
          clientRes.end('Blocked by Pretzel Desktop policy (detection unavailable)')
          return
        }
      }
    }

    this.forwardUpstream(hostname, port, clientReq, clientRes, bodyBuf)
  }

  private forwardUpstream(
    hostname: string,
    port: number,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    body: Buffer,
  ): void {
    const upstreamReq = https.request(
      {
        hostname,
        port,
        path: clientReq.url,
        method: clientReq.method,
        headers: this.sanitizeHeaders(clientReq.headers),
        servername: hostname,
      },
      (upstreamRes) => {
        clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        upstreamRes.pipe(clientRes) // stream response — SSE-safe, never buffered
      },
    )
    upstreamReq.on('error', () => {
      if (!clientRes.headersSent) clientRes.writeHead(502)
      clientRes.end()
    })
    if (body.length) upstreamReq.write(body)
    upstreamReq.end()
  }

  /**
   * Forward a request we never need to inspect (non-mutating methods on a
   * monitored host) straight upstream, streaming both directions — no body
   * buffering, no detection. This is the fast path for the bulk of a monitored
   * site's traffic (page loads, assets, polls).
   */
  private forwardStream(
    hostname: string,
    port: number,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ): void {
    const upstreamReq = https.request(
      {
        hostname,
        port,
        path: clientReq.url,
        method: clientReq.method,
        headers: this.sanitizeHeaders(clientReq.headers),
        servername: hostname,
      },
      (upstreamRes) => {
        clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        upstreamRes.pipe(clientRes)
      },
    )
    upstreamReq.on('error', () => {
      if (!clientRes.headersSent) clientRes.writeHead(502)
      clientRes.end()
    })
    clientReq.pipe(upstreamReq) // stream the request body straight through
  }

  private tunnelUpgrade(
    hostname: string,
    port: number,
    upReq: http.IncomingMessage,
    upSocket: net.Socket,
  ): void {
    const upstream = tls.connect({ host: hostname, port, servername: hostname }, () => {
      const headers = Object.entries(upReq.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n')
      upstream.write(`${upReq.method} ${upReq.url} HTTP/1.1\r\n${headers}\r\n\r\n`)
      upstream.pipe(upSocket)
      upSocket.pipe(upstream)
    })
    upstream.on('error', () => upSocket.destroy())
    upSocket.on('error', () => upstream.destroy())
  }

  private awaitDecision(hostname: string, result: DetectionResult): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      let settled = false
      const settle = (allow: boolean) => {
        if (settled) return
        settled = true
        this.pending.delete(requestId)
        clearTimeout(timer)
        resolve(allow)
      }

      this.pending.set(requestId, settle)
      const event: ProxyDecisionEvent = { requestId, hostname, result, resolve: settle }
      this.emit('decision-required', event)

      const timer = setTimeout(() => settle(this.failOpen()), DECISION_TIMEOUT_MS)
    })
  }
}

export const proxy = new PretzelProxy()
