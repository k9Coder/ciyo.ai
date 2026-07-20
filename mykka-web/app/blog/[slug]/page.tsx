import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { getPost, getAllPosts } from '@/lib/posts'
import { format } from 'date-fns'
import type { Metadata } from 'next'
import { APP_URL } from '@/lib/config'

export function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return {
    title: `${post.title} | mykka.ai Blog`,
    description: post.description,
    alternates: { canonical: `https://mykka.ai/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.description },
  }
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  const regex = /\*\*(.*?)\*\*|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[1] !== undefined) {
      parts.push(<strong key={match.index} className="font-semibold text-white">{match[1]}</strong>)
    } else if (match[2] !== undefined) {
      const external = match[3].startsWith('http')
      parts.push(
        <Link key={match.index} href={match[3]}
          className="text-[#8fb3ff] underline underline-offset-2 hover:text-white"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {match[2]}
        </Link>
      )
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={match.index} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-[#e2e8f0]">
          {match[4]}
        </code>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>
}

function parseCells(row: string): string[] {
  return row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim())
}

function renderBlock(block: string, i: number): ReactNode {
  const lines = block.split('\n')

  if (block.startsWith('## '))
    return <h2 key={i} className="mt-10 mb-4 text-xl font-bold text-white">{renderInline(block.slice(3))}</h2>

  if (block.startsWith('### '))
    return <h3 key={i} className="mt-8 mb-3 text-[17px] font-bold text-white">{renderInline(block.slice(4))}</h3>

  if (block.trim() === '---')
    return <hr key={i} className="my-8 border-white/[0.07]" />

  if (lines.every(l => l.startsWith('> ')))
    return (
      <blockquote key={i} className="my-6 border-l-2 border-[#5b8cff]/50 pl-5 italic text-[14px] text-[#94a3b8]">
        {lines.map((l, j) => <p key={j} className="mb-1 last:mb-0">{renderInline(l.slice(2))}</p>)}
      </blockquote>
    )

  if (lines.every(l => l.startsWith('- ') || l.startsWith('* ')))
    return (
      <ul key={i} className="my-4 ml-5 space-y-1.5 list-disc text-[14px] text-[#94a3b8]">
        {lines.map((l, j) => <li key={j}>{renderInline(l.slice(2))}</li>)}
      </ul>
    )

  if (lines.every(l => /^\d+\.\s/.test(l)))
    return (
      <ol key={i} className="my-4 ml-5 space-y-1.5 list-decimal text-[14px] text-[#94a3b8]">
        {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\d+\.\s/, ''))}</li>)}
      </ol>
    )

  if (lines[0]?.startsWith('|') && lines.length >= 2) {
    const dataRows = lines.filter(l => !l.match(/^\|[-|: ]+\|$/))
    const [header, ...body] = dataRows
    return (
      <div key={i} className="my-6 overflow-x-auto rounded-xl border border-white/[0.07]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-white/[0.07] bg-[#17171e]">
              {parseCells(header).map((cell, j) => (
                <th key={j} className="px-4 py-3 text-left font-bold text-white">{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, j) => (
              <tr key={j} className="border-b border-white/[0.04] last:border-0">
                {parseCells(row).map((cell, k) => (
                  <td key={k} className="px-4 py-3 text-[#94a3b8]">{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return <p key={i} className="mb-4 leading-relaxed text-[#94a3b8]">{renderInline(block)}</p>
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const author = post.author ?? 'Megan O\'Brien'
  const postUrl = `https://mykka.ai/blog/${post.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    url: postUrl,
    author: {
      '@type': 'Person',
      name: author,
      jobTitle: 'Content & SEO Writer',
      worksFor: { '@id': 'https://mykka.ai/#org' },
    },
    publisher: {
      '@id': 'https://mykka.ai/#org',
      '@type': 'Organization',
      name: 'mykka.ai',
      logo: { '@type': 'ImageObject', url: 'https://mykka.ai/images/logo.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
  }

  return (
    <div className="px-6 py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-2xl">
        <Link href="/blog" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-[#94a3b8] hover:text-white">
          ← All posts
        </Link>

        {post.tag && (
          <span className="mb-4 inline-block rounded-full bg-[#5b8cff]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8fb3ff]">
            {post.tag}
          </span>
        )}

        <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-white">{post.title}</h1>

        <div className="mb-10 flex items-center gap-3 text-[13px] text-[#64748b]">
          <span>{author}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.date}>{format(new Date(post.date), 'MMMM d, yyyy')}</time>
        </div>

        <div className="space-y-0">
          {post.content.split('\n\n').map((block, i) => renderBlock(block, i))}
        </div>

        <div className="mt-12 rounded-2xl border border-[#5b8cff]/20 bg-[#5b8cff]/[0.06] p-6">
          <p className="mb-3 text-[15px] font-semibold text-white">Try Pretzel free — protect your team today</p>
          <Link href={`${APP_URL}/onboarding`}
            className="inline-block rounded-xl bg-[#5b8cff] px-6 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#3f6fe0]">
            Start Free — No Credit Card
          </Link>
        </div>
      </div>
    </div>
  )
}
