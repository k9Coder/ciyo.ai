import Link from 'next/link'
import { getAllPosts } from '@/lib/posts'
import { format } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog — AI Security Guides and Research',
  description: 'The Pretzel blog: practical guides, research, and policy templates for CISOs managing AI data risk.',
  openGraph: {
    title: 'The Pretzel Blog — AI Security for Enterprise Teams',
    description: 'Practical guides, research, and policy templates for CISOs managing AI data risk.',
  },
}

export default function BlogPage() {
  const posts = getAllPosts()
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Blog</p>
        <h1 className="mb-12 text-4xl font-extrabold tracking-tight text-white">Insights on AI Security</h1>
        {posts.map(post => (
          <Link key={post.slug} href={`/blog/${post.slug}`}
            className="mb-6 block rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 transition hover:border-[#7c6aff]/30">
            {post.tag && <span className="mb-2 inline-block rounded-full bg-[#7c6aff]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a78bfa]">{post.tag}</span>}
            <h2 className="mb-2 text-[18px] font-bold text-white">{post.title}</h2>
            <p className="mb-3 text-[13px] text-[#94a3b8]">{post.description}</p>
            <time className="text-[11px] text-[#64748b]">{format(new Date(post.date), 'MMMM d, yyyy')}</time>
          </Link>
        ))}
      </div>
    </div>
  )
}
