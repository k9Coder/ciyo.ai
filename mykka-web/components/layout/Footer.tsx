import Link from 'next/link'

const LINKS = {
  Product:   [['Product', '/product'], ['Pricing', '/pricing']] as const,
  Solutions: [['Healthcare', '/solutions/healthcare'], ['Legal', '/solutions/legal'], ['Fintech', '/solutions/fintech'], ['Engineering', '/solutions/engineering']] as const,
  Company:   [['About', '/about'], ['Blog', '/blog'], ['Security', '/security']] as const,
  Docs:      [['Getting Started', 'https://docs.mykka.ai'], ['API Reference', 'https://docs.mykka.ai/api'], ['Chrome Enterprise', 'https://docs.mykka.ai/enterprise']] as const,
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-6 pb-9 pt-12">
        <div className="grid grid-cols-2 gap-7 md:grid-cols-4">
          {(Object.entries(LINKS) as [string, readonly (readonly [string, string])[]][]).map(([group, items]) => (
            <div key={group} className="flex flex-col gap-[9px]">
              <p className="text-[14px] font-semibold text-ink">{group}</p>
              {items.map(([label, href]) => (
                <Link key={href} href={href}
                  className="text-[14px] text-muted transition-colors hover:text-ink">
                  {label}
                </Link>
              ))}
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
