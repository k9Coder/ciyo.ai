'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { APP_URL, IS_PILOT_MODE } from '@/lib/config'

const NAV = [
  { href: '/product',   label: 'Product' },
  { href: '/pricing',   label: 'Pricing' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/security',  label: 'Security' },
  { href: '/blog',      label: 'Blog' },
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0f0f13]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
          <svg width="26" height="26" viewBox="0 0 56 56" fill="none" aria-label="ciyo.ai logo">
            <rect width="56" height="56" rx="14" fill="rgba(167,139,250,0.08)"/>
            <path d="M20 14 L14 14 L14 42 L20 42"
                  stroke="#a78bfa" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="34" cy="28" r="5" fill="#a78bfa"/>
            <path d="M30 18 L38 18 L38 24"
                  stroke="#a78bfa" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          </svg>
          <span className="text-[15px] tracking-tight">
            <span className="text-white font-bold">c</span>
            <span className="text-[#a78bfa] font-bold">i</span>
            <span className="text-white font-bold">yo</span>
            <span className="text-[#94a3b8] font-normal text-[12px]">.ai</span>
          </span>
          {process.env.NEXT_PUBLIC_ENV === 'staging' && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-amber-500 text-white">
              STAGING
            </span>
          )}
        </Link>

        <nav className="hidden gap-1 md:flex">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-[#94a3b8] transition-colors hover:bg-white/[0.05] hover:text-white">
              {label}
              {IS_PILOT_MODE && href === '/pricing' && (
                <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-[#7c6aff]/20 text-[#a78bfa]">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href={APP_URL}
            className="hidden text-[13px] text-[#94a3b8] hover:text-white md:block">
            Sign in
          </Link>
          <Link href={`${APP_URL}/onboarding`}
            className="rounded-lg bg-[#7c6aff] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#6b59ee]">
            Start Free
          </Link>
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/[0.06] bg-[#0f0f13] px-6 py-4 md:hidden">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className="block py-2 text-[14px] text-[#94a3b8] hover:text-white">
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
