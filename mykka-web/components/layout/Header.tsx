'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { APP_URL, IS_PILOT_MODE } from '@/lib/config'
import { env } from '@/lib/env'
import { MykkaLogo } from './MykkaLogo'
import { ThemeToggle } from './ThemeToggle'

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
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-6 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-[9px] text-ink">
          <MykkaLogo />
          <span className="text-[19px] font-bold tracking-[-0.03em]">mykka</span>
          {env.NEXT_PUBLIC_ENV === 'staging' && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-amber-500 text-white">
              STAGING
            </span>
          )}
        </Link>

        <nav className="hidden flex-1 gap-1 text-[15px] md:flex">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted transition-colors hover:text-ink">
              {label}
              {IS_PILOT_MODE && href === '/pricing' && (
                <span className="rounded-btn bg-brand-soft px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-brand">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 md:ml-0">
          <ThemeToggle />
          <Link href={APP_URL}
            className="hidden whitespace-nowrap px-2 py-1.5 text-[15px] text-ink md:block">
            Sign in
          </Link>
          <Link href={`${APP_URL}/onboarding`}
            className="whitespace-nowrap rounded-btn bg-btn px-4 py-[9px] text-[15px] font-medium text-btn-fg transition-opacity hover:opacity-90">
            Start free
          </Link>
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-bg px-6 py-4 md:hidden">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className="block py-2 text-[15px] text-muted hover:text-ink">
              {label}
            </Link>
          ))}
          <Link href={APP_URL} onClick={() => setOpen(false)}
            className="block py-2 text-[15px] text-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      )}
    </header>
  )
}
