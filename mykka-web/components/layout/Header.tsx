'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, Code, CreditCard, Menu, Scale, Stethoscope, X, type LucideIcon } from 'lucide-react'
import { primaryCta } from '@/lib/cta'
import { env } from '@/lib/env'
import { MykkaLogo } from './MykkaLogo'
import { ThemeToggle } from './ThemeToggle'

const SOLUTIONS: Array<{ Icon: LucideIcon; name: string; blurb: string; href: string }> = [
  { Icon: Scale, name: 'Legal', blurb: 'Client data and privileged text', href: '/solutions/legal' },
  { Icon: Stethoscope, name: 'Healthcare', blurb: 'Patient records and IDs', href: '/solutions/healthcare' },
  { Icon: CreditCard, name: 'Finance', blurb: 'Card, account and deal data', href: '/solutions/fintech' },
  { Icon: Code, name: 'Engineering', blurb: 'Keys, tokens and source code', href: '/solutions/engineering' },
]

const NAV = [
  { href: '/product',   label: 'Product' },
  { href: '/solutions', label: 'Solutions', menu: true },
  { href: '/pricing',   label: 'Pricing' },
  { href: '/security',  label: 'Security' },
]

// The current section gets an underline, as in the design.
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Header() {
  const [open, setOpen] = useState(false)
  const [solOpen, setSolOpen] = useState(false)
  const pathname = usePathname()
  const cta = primaryCta()

  const linkClass = (href: string) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 transition-colors hover:text-ink ${isActive(pathname, href) ? 'text-ink shadow-[inset_0_-2px_0_var(--ink)]' : 'text-muted'}`

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

        <nav className="hidden flex-1 items-center gap-1 text-[15px] md:flex">
          {NAV.map(({ href, label, menu }) => menu ? (
            <div key={href} className="relative"
              onMouseEnter={() => setSolOpen(true)} onMouseLeave={() => setSolOpen(false)}
              onFocus={() => setSolOpen(true)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSolOpen(false) }}
              onKeyDown={(e) => { if (e.key === 'Escape') setSolOpen(false) }}>
              <Link href={href} className={linkClass(href)}>
                {label}<ChevronDown size={12} aria-hidden="true" className="text-muted" />
              </Link>
              {solOpen && (
                <div className="absolute left-0 top-full z-30 pt-2">
                  <div className="flex min-w-[260px] flex-col rounded-token border border-line bg-surface p-2 shadow-(--shadow)">
                    {SOLUTIONS.map(({ Icon, name, blurb, href: to }) => (
                      <Link key={to} href={to} onClick={() => setSolOpen(false)}
                        className="flex items-start gap-3 rounded-[calc(var(--r)-6px)] px-3 py-2.5 text-ink hover:bg-fill">
                        <Icon size={20} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[15px] font-medium">{name}</span>
                          <span className="text-[13px] text-muted">{blurb}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link key={href} href={href} className={linkClass(href)}>{label}</Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5 md:ml-0">
          <ThemeToggle />
          <Link href={cta.href}
            className="whitespace-nowrap rounded-btn bg-btn px-4 py-[9px] text-[15px] font-medium text-btn-fg transition-opacity hover:opacity-90">
            {cta.label}
          </Link>
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-bg px-6 py-4 md:hidden">
          {NAV.map(({ href, label, menu }) => (
            <div key={href}>
              <Link href={href} onClick={() => setOpen(false)}
                className={`block py-2 text-[15px] hover:text-ink ${isActive(pathname, href) ? 'text-ink' : 'text-muted'}`}>
                {label}
              </Link>
              {menu && SOLUTIONS.map(({ name, href: to }) => (
                <Link key={to} href={to} onClick={() => setOpen(false)}
                  className="block py-1.5 pl-4 text-[14px] text-muted hover:text-ink">
                  {name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
