import { getAllPosts } from '@/lib/posts'
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  // Static routes with approximate last-modified dates to avoid unnecessary recrawling.
  // Update the date here when a page's content changes significantly.
  const staticRoutes: Array<{ url: string; lastModified: Date }> = [
    { url: 'https://mykka.ai/',                              lastModified: new Date('2026-07-05') },
    { url: 'https://mykka.ai/product',                      lastModified: new Date('2026-07-05') },
    { url: 'https://mykka.ai/pricing',                      lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/solutions',                    lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/solutions/healthcare',         lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/solutions/legal',              lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/solutions/fintech',            lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/solutions/engineering',        lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/security',                     lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/about',                        lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/blog',                         lastModified: new Date('2026-07-05') },
    { url: 'https://mykka.ai/privacy',                      lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/terms',                        lastModified: new Date('2026-06-08') },
    { url: 'https://mykka.ai/accessibility',                lastModified: new Date('2026-06-08') },
  ]

  const posts = getAllPosts().map(p => ({
    url: `https://mykka.ai/blog/${p.slug}`,
    lastModified: new Date(p.date),
  }))

  return [...staticRoutes, ...posts]
}
