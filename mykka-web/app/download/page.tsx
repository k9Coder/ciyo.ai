import type { Metadata } from 'next'
import { DESKTOP_DOWNLOADS_ENABLED } from '@/lib/config'
import { DownloadClient } from './DownloadClient'
import { getDownloads, type Downloads } from './getDownloads'

const NO_DOWNLOADS: Downloads = { version: null, macArm: null, macIntel: null, windows: null, linux: null }

// Vercel Blob contents change independently of a deploy (publish-desktop-blob.mjs
// runs outside the build) — without this, Next statically caches getDownloads()'s
// result from whatever the last build saw, serving stale/deleted blob URLs.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: DESKTOP_DOWNLOADS_ENABLED
    ? 'Download Pretzel — Chrome extension and desktop app'
    : 'Download Pretzel — Chrome extension',
  description: DESKTOP_DOWNLOADS_ENABLED
    ? 'Install the Pretzel Chrome extension for ChatGPT, Claude and Gemini, or Pretzel Desktop for AI apps outside the browser.'
    : 'Install the Pretzel Chrome extension for ChatGPT, Claude and Gemini.',
  alternates: { canonical: 'https://mykka.ai/download' },
  openGraph: {
    title: 'Download Pretzel',
    description: 'Install Pretzel, then sign in with your work email.',
  },
}

export default async function DownloadPage() {
  // With desktop downloads off, skip the Blob listing entirely so no installer URL reaches the page.
  const downloads = DESKTOP_DOWNLOADS_ENABLED ? await getDownloads() : NO_DOWNLOADS
  return <DownloadClient downloads={downloads} desktopEnabled={DESKTOP_DOWNLOADS_ENABLED} />
}
