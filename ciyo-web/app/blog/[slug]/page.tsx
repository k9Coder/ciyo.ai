import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPost, getAllPosts } from '@/lib/posts'
import { format } from 'date-fns'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return { title: post.title, description: post.description }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <Link href="/blog" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-[#94a3b8] hover:text-white">
          ← All posts
        </Link>
        {post.tag && <span className="mb-4 inline-block rounded-full bg-[#7c6aff]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a78bfa]">{post.tag}</span>}
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-white">{post.title}</h1>
        <time className="mb-10 block text-[13px] text-[#64748b]">{format(new Date(post.date), 'MMMM d, yyyy')}</time>
        <div className="prose prose-invert prose-sm max-w-none text-[#94a3b8] [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_strong]:text-white [&_p]:leading-relaxed">
          {post.content.split('\n\n').map((block, i) => {
            if (block.startsWith('## ')) return <h2 key={i}>{block.slice(3)}</h2>
            if (block === '---') return <hr key={i} className="my-8 border-white/[0.07]" />
            return <p key={i}>{block.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-[#7c6aff]/20 bg-[#7c6aff]/[0.06] p-6">
          <p className="mb-3 text-[15px] font-semibold text-white">Try Pretzel free — protect your team today</p>
          <Link href="https://app.ciyo.ai/onboarding"
            className="inline-block rounded-xl bg-[#7c6aff] px-6 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#6b59ee]">
            Start Free — No Credit Card
          </Link>
        </div>
      </div>
    </div>
  )
}
