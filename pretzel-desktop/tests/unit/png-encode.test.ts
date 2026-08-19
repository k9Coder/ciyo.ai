/**
 * Unit tests for the hand-rolled PNG encoder used by tray-icon.ts.
 * Verifies real PNG structure (signature, chunk framing) and that the pixel
 * data round-trips correctly through the deflate step — not just "it didn't
 * throw".
 */
import { describe, it, expect } from 'vitest'
import zlib from 'zlib'
import { encodePNG } from '../../electron/png-encode'

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function readChunks(png: Buffer): Array<{ type: string; data: Buffer }> {
  const chunks: Array<{ type: string; data: Buffer }> = []
  let offset = 8
  while (offset < png.length) {
    const len = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const data = png.subarray(offset + 8, offset + 8 + len)
    chunks.push({ type, data })
    offset += 8 + len + 4 // length + type + data + crc
  }
  return chunks
}

describe('encodePNG', () => {
  it('starts with the PNG magic signature', () => {
    const png = encodePNG(2, 2, Buffer.alloc(2 * 2 * 4))
    expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE)
  })

  it('has IHDR, IDAT, IEND chunks in order', () => {
    const png = encodePNG(4, 3, Buffer.alloc(4 * 3 * 4))
    const chunks = readChunks(png)
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('IHDR encodes the correct width, height, and RGBA color type', () => {
    const png = encodePNG(16, 32, Buffer.alloc(16 * 32 * 4))
    const ihdr = readChunks(png).find((c) => c.type === 'IHDR')!.data
    expect(ihdr.readUInt32BE(0)).toBe(16) // width
    expect(ihdr.readUInt32BE(4)).toBe(32) // height
    expect(ihdr[8]).toBe(8) // bit depth
    expect(ihdr[9]).toBe(6) // color type: RGBA
  })

  it('round-trips actual pixel data through the deflate step', () => {
    const width = 3, height = 2
    const rgba = Buffer.from([
      255, 0, 0, 255,    0, 255, 0, 255,    0, 0, 255, 255,
      10, 20, 30, 40,    50, 60, 70, 80,    90, 100, 110, 120,
    ])
    const png = encodePNG(width, height, rgba)
    const idat = readChunks(png).find((c) => c.type === 'IDAT')!.data
    const raw = zlib.inflateSync(idat)

    // Each scanline is prefixed with a filter-type byte (0 = none).
    const stride = width * 4
    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + stride)
      expect(raw[rowStart]).toBe(0) // filter byte
      const rowPixels = raw.subarray(rowStart + 1, rowStart + 1 + stride)
      expect(rowPixels).toEqual(rgba.subarray(y * stride, (y + 1) * stride))
    }
  })

  it('produces a valid CRC for each chunk (decoders reject bad CRCs)', () => {
    // Independent reference CRC32 (standard PNG/zlib polynomial) — deliberately
    // NOT the same code path as png-encode.ts's own table, so this actually
    // catches a bug there instead of just echoing it back.
    const referenceCrc32 = (buf: Buffer): number => {
      let crc = 0xffffffff
      for (const byte of buf) {
        crc ^= byte
        for (let k = 0; k < 8; k++) {
          crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
        }
      }
      return (crc ^ 0xffffffff) >>> 0
    }

    const png = encodePNG(2, 2, Buffer.alloc(2 * 2 * 4))
    let offset = 8
    while (offset < png.length) {
      const len = png.readUInt32BE(offset)
      const typeAndData = png.subarray(offset + 4, offset + 8 + len)
      const storedCrc = png.readUInt32BE(offset + 8 + len)
      expect(storedCrc).toBe(referenceCrc32(typeAndData))
      offset += 8 + len + 4
    }
  })
})
