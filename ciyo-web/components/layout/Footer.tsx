import Link from 'next/link'

const LINKS = {
  Product:   [['Product', '/product'], ['Pricing', '/pricing'], ['Changelog', '/changelog']] as const,
  Solutions: [['Healthcare', '/solutions/healthcare'], ['Legal', '/solutions/legal'], ['Fintech', '/solutions/fintech'], ['Engineering', '/solutions/engineering']] as const,
  Company:   [['About', '/about'], ['Blog', '/blog'], ['Security', '/security']] as const,
  Docs:      [['Getting Started', 'https://docs.ciyo.ai'], ['API Reference', 'https://docs.ciyo.ai/api'], ['Chrome Enterprise', 'https://docs.ciyo.ai/enterprise']] as const,
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0f0f13] px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
          {(Object.entries(LINKS) as [string, readonly (readonly [string, string])[]][]).map(([group, items]) => (
            <div key={group}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#94a3b8]">{group}</p>
              {items.map(([label, href]) => (
                <Link key={href} href={href}
                  className="mb-2 block text-[13px] text-[#64748b] transition-colors hover:text-[#94a3b8]">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-[12px] text-[#64748b] md:flex-row">
          <span>🥨 <strong className="text-[#94a3b8]">Pretzel</strong> by <strong className="text-[#94a3b8]">ciyo.ai</strong> — © {new Date().getFullYear()}</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-[#94a3b8]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#94a3b8]">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
