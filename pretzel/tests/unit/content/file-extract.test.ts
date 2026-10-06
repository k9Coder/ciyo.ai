import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractFile, FILE_SIZE_LIMIT_BYTES } from '@/content/file-extract'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(name: string, content: string | Uint8Array, type = ''): File {
  // `content as BlobPart`: a Uint8Array is a valid BlobPart at runtime, but
  // the DOM lib's BlobPart types the buffer as ArrayBuffer (not
  // ArrayBufferLike), so a plain Uint8Array trips a spurious SharedArrayBuffer
  // variance error. The cast is safe here.
  const blob = new Blob([content as BlobPart], { type })
  return new File([blob], name, { type })
}

function makeLargeFile(name: string): File {
  // Creates a File that reports size > 10 MB without actually allocating 10 MB
  const tiny = new Blob(['x'])
  const file = new File([tiny], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: FILE_SIZE_LIMIT_BYTES + 1 })
  return file
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractFile', () => {
  describe('unsupported types', () => {
    it('returns null for PNG image', async () => {
      const file = makeFile('photo.png', 'fake-png-bytes', 'image/png')
      expect(await extractFile(file)).toBeNull()
    })

    it('returns null for JPEG image', async () => {
      const file = makeFile('pic.jpg', 'fake-jpg-bytes', 'image/jpeg')
      expect(await extractFile(file)).toBeNull()
    })

    it('returns null for MP4 video', async () => {
      const file = makeFile('video.mp4', 'fake-mp4', 'video/mp4')
      expect(await extractFile(file)).toBeNull()
    })

    it('returns null for unknown binary (.bin)', async () => {
      const file = makeFile('data.bin', 'binary-data', 'application/octet-stream')
      expect(await extractFile(file)).toBeNull()
    })

    it('returns null for a file with no extension', async () => {
      const file = makeFile('Makefile', 'CC=gcc\nall: main', '')
      // "Makefile" → ext = "" → not in TEXT_EXTENSIONS → null
      // (makefile lowercase with a dot would be supported, bare "Makefile" has no ext)
      expect(await extractFile(file)).toBeNull()
    })
  })

  describe('size limit', () => {
    it('returns contentUnavailable=true when file exceeds 10 MB', async () => {
      const file = makeLargeFile('big.txt')
      const result = await extractFile(file)
      expect(result).not.toBeNull()
      expect(result!.text).toBe('')
      expect(result!.contentUnavailable).toBe(true)
      expect(result!.filename).toBe('big.txt')
    })
  })

  describe('text files', () => {
    it('extracts content from a .txt file', async () => {
      const file = makeFile('notes.txt', 'Hello world', 'text/plain')
      const result = await extractFile(file)
      expect(result).not.toBeNull()
      expect(result!.text).toBe('Hello world')
      expect(result!.contentUnavailable).toBe(false)
      expect(result!.filename).toBe('notes.txt')
      expect(result!.mimeType).toBe('text/plain')
    })

    it('extracts content from a .py file', async () => {
      const file = makeFile('secret.py', 'API_KEY = "sk-real-key"', 'text/x-python')
      const result = await extractFile(file)
      expect(result!.text).toBe('API_KEY = "sk-real-key"')
      expect(result!.contentUnavailable).toBe(false)
    })

    it('extracts content from a .ts file', async () => {
      const file = makeFile('config.ts', 'export const KEY = "abc"', 'text/typescript')
      const result = await extractFile(file)
      expect(result!.text).toBe('export const KEY = "abc"')
    })

    it('extracts content from a .env file', async () => {
      const file = makeFile('.env', 'DATABASE_URL=postgres://user:pass@localhost/db', '')
      const result = await extractFile(file)
      expect(result!.text).toContain('DATABASE_URL')
    })

    it('extracts content from a .json file', async () => {
      const json = '{"key":"value"}'
      const file = makeFile('data.json', json, 'application/json')
      const result = await extractFile(file)
      expect(result!.text).toBe(json)
    })

    it('extracts content from a .csv file', async () => {
      const csv = 'name,email\nAlice,alice@example.com'
      const file = makeFile('users.csv', csv, 'text/csv')
      const result = await extractFile(file)
      expect(result!.text).toBe(csv)
    })
  })

  describe('PDF files', () => {
    beforeEach(() => {
      vi.mock('pdfjs-dist', () => ({
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: (_opts: unknown) => ({
          promise: Promise.resolve({
            numPages: 2,
            getPage: (n: number) => Promise.resolve({
              getTextContent: () => Promise.resolve({
                items: [{ str: `Page ${n} text` }],
              }),
            }),
          }),
        }),
      }))
    })

    it('extracts text from a .pdf file via pdfjs-dist', async () => {
      const file = makeFile('report.pdf', 'fake-pdf-bytes', 'application/pdf')
      const result = await extractFile(file)
      expect(result).not.toBeNull()
      expect(result!.text).toContain('Page 1 text')
      expect(result!.text).toContain('Page 2 text')
      expect(result!.contentUnavailable).toBe(false)
    })
  })

  describe('DOCX files', () => {
    beforeEach(() => {
      vi.mock('jszip', () => ({
        default: {
          loadAsync: (_buf: unknown) => Promise.resolve({
            file: (path: string) => path === 'word/document.xml'
              ? { async: (_enc: string) => Promise.resolve('<w:t>Secret content</w:t>') }
              : null,
          }),
        },
      }))
    })

    it('extracts text from a .docx file via jszip', async () => {
      const file = makeFile('contract.docx', 'fake-docx-bytes',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      const result = await extractFile(file)
      expect(result).not.toBeNull()
      expect(result!.text).toContain('Secret content')
      expect(result!.contentUnavailable).toBe(false)
    })
  })
})
