import { getDownloads } from '@/app/download/getDownloads'

// The installed desktop app polls this on launch (and on manual "Check for
// updates") to learn the latest published version. Source of truth is the same
// Vercel Blob store that /download reads, so a new release needs only new blobs
// uploaded — no code change here. Must stay dynamic: blob contents change
// independently of a deploy (publish-desktop-blob.mjs runs outside the build),
// so a static cache would pin a stale version forever.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { version } = await getDownloads()

  return Response.json(
    { latest: version },
    {
      headers: {
        // Short edge cache so a burst of launches doesn't hammer Blob list(),
        // but new releases still surface within a minute.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    },
  )
}
