import { BarChart2, Brain, Lock, Shield, Users, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const FEATURES: { icon: LucideIcon; title: string; desc: string; color: string }[] = [
  { icon: Shield, title: 'Local Prompt Evaluation', desc: 'Evaluate prompts in the browser on supported ChatGPT, Claude, and Gemini hosts.', color: '#a78bfa' },
  { icon: Brain, title: 'Configurable Detection', desc: 'Create pattern, entropy, dictionary, and score rules in the Console.', color: '#34d399' },
  { icon: BarChart2, title: 'Audit and Analytics', desc: 'Review available events and aggregate analytics as an administrator.', color: '#60a5fa' },
  { icon: Zap, title: 'Supported Host Integrations', desc: 'Current extension integrations cover supported ChatGPT, Claude, and Gemini hosts.', color: '#fbbf24' },
  { icon: Users, title: 'Organization Policies', desc: 'Scope policy configuration through the organization structure managed in the Console.', color: '#f472b6' },
  { icon: Lock, title: 'Warn or Block', desc: 'Choose a warn or block action for configured policy rules.', color: '#fb923c' },
]

export function FeatureGrid() {
  return (
    <section className="border-t border-white/[0.05] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Features</p>
        <h2 className="mb-16 text-center text-4xl font-extrabold tracking-tight text-white">Current product capabilities</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="rounded-2xl border border-white/[0.07] bg-[#17171e] p-7">
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl" style={{ background: `${color}1a` }}><Icon size={18} style={{ color }} /></div>
              <h3 className="mb-2 text-[15px] font-bold text-white">{title}</h3>
              <p className="text-[13px] leading-relaxed text-[#94a3b8]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
