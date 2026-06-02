'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'

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
          <span className="text-[#a78bfa]">🥨</span>
          <span className="text-[15px] tracking-tight">Pretzel</span>
          <span className="text-[11px] font-normal text-[#94a3b8]">by ciyo.ai</span>
        </Link>

        <nav className="hidden gap-1 md:flex">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href}
              className="rounded-md px-3 py-1.5 text-[13px] text-[#94a3b8] transition-colors hover:bg-white/[0.05] hover:text-white">
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="https://app.ciyo.ai"
            className="hidden text-[13px] text-[#94a3b8] hover:text-white md:block">
            Sign in
          </Link>
          <Link href="https://app.ciyo.ai/onboarding"
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
