'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { APP_URL, IS_PILOT_MODE } from '@/lib/config'
import { env } from '@/lib/env'

const NAV = [
  { href: '/product',   label: 'Product' },
  { href: '/pricing',   label: 'Pricing' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/security',  label: 'Security' },
  { href: '/download',  label: 'Download' },
  { href: '/blog',      label: 'Blog' },
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0f0f13]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
          <svg width="26" height="26" viewBox="0 0 56 56" fill="none" aria-label="mykka.ai logo">
            <rect width="56" height="56" rx="14" fill="rgba(91,140,255,0.08)"/>
            <circle cx="28" cy="28" r="13"
                    fill="none" stroke="#5b8cff" strokeWidth="7"/>
            <circle cx="37.19" cy="18.81" r="4.5" fill="#5b8cff"/>
          </svg>
          <span className="text-[15px] tracking-tight">
            <span className="text-white font-bold">m</span>
            <span className="text-[#5b8cff] font-bold">y</span>
            <span className="text-white font-bold">kka</span>
            <span className="text-[#94a3b8] font-normal text-[12px]">.ai</span>
          </span>
          {env.NEXT_PUBLIC_ENV === 'staging' && (
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
                <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-[#5b8cff]/20 text-[#8fb3ff]">
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
            className="rounded-lg bg-[#5b8cff] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3f6fe0]">
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
          <Link href={APP_URL} onClick={() => setOpen(false)}
            className="block py-2 text-[14px] text-[#94a3b8] hover:text-white">
            Sign in
          </Link>
        </div>
      )}
    </header>
  )
}
