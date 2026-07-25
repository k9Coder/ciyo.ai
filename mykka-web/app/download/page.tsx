import type { Metadata } from 'next'
import { DownloadClient } from './DownloadClient'
import { getDownloads } from './getDownloads'

// Vercel Blob contents change independently of a deploy (publish-desktop-blob.mjs
// runs outside the build) — without this, Next statically caches getDownloads()'s
// result from whatever the last build saw, serving stale/deleted blob URLs.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Download Pretzel Desktop — System-wide AI Prompt DLP',
  description: 'Install Pretzel Desktop for macOS, Windows, or Linux. System-wide HTTPS interception — monitors Chrome, Safari, and all native AI tools, not just the browser.',
  openGraph: {
    title: 'Download Pretzel Desktop',
    description: 'One install. Every app. Every AI request checked against your org policy.',
  },
}

export default async function DownloadPage() {
  return <DownloadClient downloads={await getDownloads()} />
}
