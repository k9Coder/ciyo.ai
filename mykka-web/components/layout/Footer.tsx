import Link from 'next/link'
import { DISCORD_URL } from '@/lib/config'

type FooterLink = readonly [label: string, href: string]

const LINKS: Record<string, readonly FooterLink[]> = {
  Product: [['Browser extension', '/product'], ['Desktop app', '/download'], ['Admin console', '/product'], ['Assistant', '/product']],
  Solutions: [['Legal', '/solutions/legal'], ['Healthcare', '/solutions/healthcare'], ['Finance', '/solutions/fintech'], ['Engineering', '/solutions/engineering']],
  // About and Blog are not in the design's footer; they stay so those pages remain linked from every page.
  Company: [['Pricing', '/pricing'], ['Security', '/security'], ['About', '/about'], ['Blog', '/blog'], ['Contact', 'mailto:hello@mykka.ai']],
  Docs: [['Getting started', 'https://docs.mykka.ai'], ['Chrome Enterprise', 'https://docs.mykka.ai/enterprise'], ['Desktop install', '/download']],
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-6 pb-9 pt-12">
        <div className="grid grid-cols-2 gap-7 md:grid-cols-4">
          {Object.entries(LINKS).map(([group, items]) => (
            <div key={group} className="flex flex-col gap-[9px]">
              <p className="m-0 text-[14px] font-semibold text-ink">{group}</p>
              {items.map(([label, href]) => (
                <Link key={`${label}-${href}`} href={href}
                  className="text-[14px] text-muted transition-colors hover:text-ink">
                  {label}
                </Link>
              ))}
              {group === 'Company' && (
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[14px] text-ink">
                  <span className="size-[7px] rounded-full bg-[#5865F2]" aria-hidden="true" />
                  Discord community ↗
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-[13px] text-muted">
          <span>Pretzel by mykka.ai · © {new Date().getFullYear()}</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/accessibility" className="hover:text-ink">Accessibility</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
