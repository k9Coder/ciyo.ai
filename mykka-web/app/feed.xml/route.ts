import { getAllPosts } from '@/lib/posts'

export const dynamic = 'force-static'

export function GET() {
  const posts = getAllPosts()
  const baseUrl = 'https://ciyo.ai'

  const items = posts
    .map(post => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
      <description><![CDATA[${post.description}]]></description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>megan@ciyo.ai (${post.author ?? 'Megan O\'Brien'})</author>
      ${post.tag ? `<category>${post.tag}</category>` : ''}
    </item>`)
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ciyo.ai — AI DLP Research &amp; Security Guides</title>
    <link>${baseUrl}/blog</link>
    <description>Practical guides, policy templates, and research on AI data loss prevention for enterprise security teams.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${baseUrl}/images/logo.png</url>
      <title>ciyo.ai</title>
      <link>${baseUrl}</link>
    </image>
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
