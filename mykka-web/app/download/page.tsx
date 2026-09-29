import type { Metadata } from 'next'
import { DownloadClient } from './DownloadClient'
import { getDownloads } from './getDownloads'

// Vercel Blob contents change independently of a deploy (publish-desktop-blob.mjs
// runs outside the build) — without this, Next statically caches getDownloads()'s
// result from whatever the last build saw, serving stale/deleted blob URLs.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Download Pretzel — Chrome extension and desktop app',
  description: 'Install the Pretzel Chrome extension for ChatGPT, Claude and Gemini, or Pretzel Desktop for AI apps outside the browser.',
  alternates: { canonical: 'https://mykka.ai/download' },
  openGraph: {
    title: 'Download Pretzel',
    description: 'Install Pretzel, then sign in with your work email.',
  },
}

export default async function DownloadPage() {
  return <DownloadClient downloads={await getDownloads()} />
}
