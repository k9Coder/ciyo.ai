import { Shield, Brain, BarChart2, Zap, Users, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const FEATURES: { icon: LucideIcon; title: string; desc: string; color: string }[] = [
  { icon: Shield,    title: 'Real-Time Prompt Scanning', desc: 'Every AI prompt is scanned against your policy the moment it\'s typed — before the send button is pressed.', color: '#a78bfa' },
  { icon: Brain,     title: 'AI Policy Assistant',       desc: 'Manage your security rules in plain English. "Block SSNs for the Finance team" — done in seconds.', color: '#34d399' },
  { icon: BarChart2, title: 'Analytics Dashboard',       desc: 'See exactly what your team is sending to AI tools. Audit logs, trend analysis, and compliance reports.', color: '#60a5fa' },
  { icon: Zap,       title: 'Works on All AI Sites',     desc: 'ChatGPT, Claude, Gemini, Perplexity, and any internal AI tool — configured with a single CSS selector.', color: '#fbbf24' },
  { icon: Users,     title: 'Team & Division Policies',  desc: 'Different rules for Engineering, HR, Finance, and Legal. Org-scoped, team-scoped, or global policies.', color: '#f472b6' },
  { icon: Lock,      title: 'Entropy Detection',         desc: 'Automatically catches API keys, tokens, and credentials — even ones not in your keyword list.', color: '#fb923c' },
]

export function FeatureGrid() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Features</p>
        <h2 className="mb-16 text-center text-4xl font-extrabold tracking-tight text-white">
          Everything your security team needs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7 transition hover:border-white/[0.14]">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl" style={{ background: `${color}1a` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <h3 className="mb-2 text-[15px] font-bold text-white">{title}</h3>
              <p className="text-[13px] leading-relaxed text-[#94a3b8]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
