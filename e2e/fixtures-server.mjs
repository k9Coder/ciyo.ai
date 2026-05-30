import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PORT = 9876

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
}

createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0]
  if (urlPath === '/' || urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  const filePath = join(__dirname, 'fixtures', urlPath)
  try {
    const content = readFileSync(filePath)
    const mime    = MIME[extname(filePath)] ?? 'text/plain'
    res.writeHead(200, { 'Content-Type': mime })
    res.end(content)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }
}).listen(PORT, () => {
  console.log(`Fixtures server listening on http://localhost:${PORT}`)
})
