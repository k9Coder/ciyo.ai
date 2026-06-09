import { getAllPosts } from '@/lib/posts'
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  // Static routes with approximate last-modified dates to avoid unnecessary recrawling.
  // Update the date here when a page's content changes significantly.
  const staticRoutes: Array<{ url: string; lastModified: Date }> = [
    { url: 'https://ciyo.ai/',                              lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/product',                      lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/pricing',                      lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/solutions',                    lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/solutions/healthcare',         lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/solutions/legal',              lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/solutions/fintech',            lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/solutions/engineering',        lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/security',                     lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/about',                        lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/blog',                         lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/privacy',                      lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/terms',                        lastModified: new Date('2026-06-08') },
    { url: 'https://ciyo.ai/accessibility',                lastModified: new Date('2026-06-08') },
  ]

  const posts = getAllPosts().map(p => ({
    url: `https://ciyo.ai/blog/${p.slug}`,
    lastModified: new Date(p.date),
  }))

  return [...staticRoutes, ...posts]
}
