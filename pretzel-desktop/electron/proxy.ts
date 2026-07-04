/**
 * HTTPS MITM proxy daemon.
 * Listens on localhost:PORT, intercepts CONNECT tunnels, signs per-host certs
 * on the fly using the local CA, runs @ciyo/detect on request bodies, and
 * either forwards or blocks the request based on detection results.
 *
 * Architecture:
 *   client -> proxy:CONNECT -> TLS interception -> detect -> forward/block
 *
 * The proxy holds the client connection while detection runs. On block it
 * sends a 403 and emits a decision-required event so the tray can notify.
 */
import http from 'http'
import net from 'net'
import tls from 'tls'
import { EventEmitter } from 'events'
import { detectPrompt } from '@ciyo/detect'
import type { Policy, DetectionResult } from '@ciyo/detect'
import { signHostCert, type CACert } from './ca'

export const PROXY_PORT = 18888

export interface ProxyDecisionEvent {
  requestId: string
  hostname: string
  result: DetectionResult
  resolve: (allow: boolean) => void
}

export class PretzelProxy extends EventEmitter {
  private server: http.Server | null = null
  private ca: CACert | null = null
  private policy: Policy | null = null

  setCA(ca: CACert): void {
    this.ca = ca
  }

  setPolicy(policy: Policy): void {
    this.policy = policy
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer()

      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnect(req, clientSocket as net.Socket, head)
      })

      this.server.on('error', reject)
      this.server.listen(PROXY_PORT, '127.0.0.1', () => resolve())
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    const [hostname, portStr] = (req.url ?? '').split(':')
    const port = parseInt(portStr ?? '443', 10)

    if (!this.ca || !this.policy) {
      // Not ready — pass through without interception
      const upstream = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        upstream.write(head)
        upstream.pipe(clientSocket)
        clientSocket.pipe(upstream)
      })
      return
    }

    const hostCert = signHostCert(hostname, this.ca)

    // Tell client the tunnel is up, then intercept via TLS
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

    const tlsSocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      key: hostCert.keyPem,
      cert: hostCert.certPem,
    })

    const interceptServer = http.createServer(async (interceptReq, interceptRes) => {
      const chunks: Buffer[] = []
      for await (const chunk of interceptReq) chunks.push(chunk as Buffer)
      const body = Buffer.concat(chunks).toString('utf-8')

      const policy = this.policy!
      const result = detectPrompt({ text: body, inputType: 'text' }, policy)

      if (result.action === 'block' || result.action === 'warn') {
        const allowed = await this.promptDecision(hostname, result)
        if (!allowed) {
          interceptRes.writeHead(403, { 'Content-Type': 'text/plain' })
          interceptRes.end('Blocked by Pretzel Desktop policy')
          return
        }
      }

      // Forward to actual upstream
      const upstreamReq = https.request(
        { hostname, port, path: interceptReq.url, method: interceptReq.method, headers: interceptReq.headers },
        (upstreamRes) => {
          interceptRes.writeHead(upstreamRes.statusCode ?? 200, upstreamRes.headers)
          upstreamRes.pipe(interceptRes)
        },
      )
      upstreamReq.on('error', () => {
        interceptRes.writeHead(502)
        interceptRes.end()
      })
      if (body) upstreamReq.write(body)
      upstreamReq.end()
    })

    interceptServer.emit('connection', tlsSocket)
  }

  private promptDecision(hostname: string, result: DetectionResult): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const event: ProxyDecisionEvent = { requestId, hostname, result, resolve }
      this.emit('decision-required', event)

      // 30s timeout → apply failMode
      setTimeout(() => {
        const failMode = this.policy?.failMode ?? 'open'
        resolve(failMode === 'open')
      }, 30_000)
    })
  }
}

// Need https for upstream forwarding — add after module scope to avoid circular
import https from 'https'

export const proxy = new PretzelProxy()
