import Link from 'next/link'
import { AppWindow, LayoutDashboard, MessageSquareText, Monitor, type LucideIcon } from 'lucide-react'
import { H2 } from './H2'

const PARTS: Array<{ Icon: LucideIcon; who: string; name: string; d: string; href: string }> = [
  { Icon: AppWindow, who: 'For employees', name: 'Browser extension', d: 'Checks prompts in ChatGPT, Claude and Gemini and offers a safe way to send.', href: '/product' },
  { Icon: Monitor, who: 'For employees', name: 'Desktop app', d: 'Covers AI desktop apps. Lives in the tray and asks before anything risky is sent.', href: '/download' },
  { Icon: LayoutDashboard, who: 'For IT', name: 'Admin console', d: 'Policies, people, activity and publishing, on one screen you check weekly.', href: '/product' },
  { Icon: MessageSquareText, who: 'For IT', name: 'Assistant', d: 'Ask for a change in plain words. It adds divisions, rules and members, and shows the diff first.', href: '/product' },
]

export function ProductParts() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <H2 className="max-w-[640px]">Four parts, one policy</H2>
          <Link href="/product" className="text-[16px] text-ink underline underline-offset-4">Tour the product</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PARTS.map(({ Icon, who, name, d, href }) => (
            <Link key={name} href={href}
              className="flex flex-col gap-2.5 rounded-token border border-line bg-bg p-6 text-ink transition-colors hover:border-ink">
              <Icon size={26} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
              <span className="font-mono text-[13px] text-muted">{who}</span>
              <span className="text-[20px] font-semibold">{name}</span>
              <span className="text-[15px] leading-[1.5] text-muted">{d}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
