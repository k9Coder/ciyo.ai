import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
}

export default function NotFound() {
  return (
    <div className="px-6 py-32">
      <div className="mx-auto max-w-xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand">404</p>
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-ink">This page could not be found</h1>
        <p className="mb-10 text-[15px] leading-relaxed text-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/"
            className="rounded-xl bg-btn px-7 py-3 text-[14px] font-bold text-btn-fg transition hover:opacity-90">
            Back to home
          </Link>
          <Link href="/solutions"
            className="rounded-xl border border-line bg-fill px-7 py-3 text-[14px] font-semibold text-ink transition hover:bg-line">
            Browse solutions →
          </Link>
        </div>
      </div>
    </div>
  )
}
