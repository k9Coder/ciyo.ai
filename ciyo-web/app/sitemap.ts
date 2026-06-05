import { getAllPosts } from '@/lib/posts'
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    '/', '/product', '/pricing', '/solutions',
    '/solutions/healthcare', '/solutions/legal', '/solutions/fintech', '/solutions/engineering',
    '/security', '/about', '/blog', '/accessibility',
  ]
  const posts = getAllPosts().map(p => ({
    url: `https://ciyo.ai/blog/${p.slug}`,
    lastModified: new Date(p.date),
  }))
  return [
    ...staticRoutes.map(route => ({ url: `https://ciyo.ai${route}`, lastModified: new Date() })),
    ...posts,
  ]
}
