import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
}

export default function NotFound() {
  return (
    <div className="px-6 py-32">
      <div className="mx-auto max-w-xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">404</p>
        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-white">This page could not be found</h1>
        <p className="mb-10 text-[15px] leading-relaxed text-[#94a3b8]">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/"
            className="rounded-xl bg-[#5b8cff] px-7 py-3 text-[14px] font-bold text-white transition hover:bg-[#3f6fe0]">
            Back to home
          </Link>
          <Link href="/solutions"
            className="rounded-xl border border-white/10 bg-white/5 px-7 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
            Browse solutions →
          </Link>
        </div>
      </div>
    </div>
  )
}
