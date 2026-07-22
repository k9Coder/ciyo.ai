import Link from 'next/link'
import { getAllPosts } from '@/lib/posts'
import { format } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI DLP Blog — Security Research & Guides | mykka.ai',
  description: 'Practical guides, policy templates, and research on AI data loss prevention. Written for CISOs, security engineers, and compliance teams managing generative AI risk.',
  alternates: { canonical: 'https://mykka.ai/blog' },
  openGraph: {
    title: 'AI DLP Blog — Security Research & Guides | mykka.ai',
    description: 'Practical guides, policy templates, and research on AI data loss prevention for enterprise security teams.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  url: 'https://mykka.ai/blog',
  name: 'AI DLP Blog — Security Research & Guides',
  description: 'Practical guides, policy templates, and research on AI data loss prevention. Written for CISOs, security engineers, and compliance teams.',
  publisher: { '@id': 'https://mykka.ai/#org' },
}

export default function BlogPage() {
  const posts = getAllPosts()
  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Blog</p>
        <h1 className="mb-12 text-4xl font-extrabold tracking-tight text-white">AI DLP Research &amp; Security Guides</h1>
        {posts.map(post => (
          <Link key={post.slug} href={`/blog/${post.slug}`}
            className="mb-6 block rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 transition hover:border-[#5b8cff]/30">
            {post.tag && <span className="mb-2 inline-block rounded-full bg-[#5b8cff]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8fb3ff]">{post.tag}</span>}
            <h2 className="mb-2 text-[18px] font-bold text-white">{post.title}</h2>
            <p className="mb-3 text-[13px] text-[#94a3b8]">{post.description}</p>
            <time className="text-[11px] text-[#64748b]">{format(new Date(post.date), 'MMMM d, yyyy')}</time>
          </Link>
        ))}
      </div>
    </div>
  )
}
