import { list } from '@vercel/blob'

export interface DownloadAsset {
  url: string
  size: number
}

export interface Downloads {
  version: string | null
  macArm: DownloadAsset | null
  macIntel: DownloadAsset | null
  windows: DownloadAsset | null
  linux: DownloadAsset | null
}

function findAsset(blobs: { pathname: string; url: string; size: number }[], pattern: RegExp): DownloadAsset | null {
  const blob = blobs.find(b => pattern.test(b.pathname))
  if (!blob) return null
  return { url: blob.url, size: blob.size }
}

/** Reads installer blobs from Vercel Blob so a new release only needs new files uploaded, no code changes. */
export async function getDownloads(): Promise<Downloads> {
  let blobs: { pathname: string; url: string; size: number }[] = []
  try {
    const result = await list({ prefix: 'pretzel-desktop/' })
    blobs = result.blobs
  } catch {
    return { version: null, macArm: null, macIntel: null, windows: null, linux: null }
  }

  const versionMatch = blobs.map(b => b.pathname.match(/(\d+\.\d+\.\d+)/)?.[1]).find(Boolean)

  return {
    version: versionMatch ?? null,
    macArm: findAsset(blobs, /arm64.*\.dmg$/i),
    macIntel: findAsset(blobs, /^(?!.*arm64).*\.dmg$/i),
    windows: findAsset(blobs, /\.exe$/i),
    linux: findAsset(blobs, /\.AppImage$/i),
  }
}
