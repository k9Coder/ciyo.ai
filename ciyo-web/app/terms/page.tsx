import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms Information',
  description: 'Current service-scope and limitation information for Pretzel.',
}

export default function TermsPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Terms</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">Terms Information</h1>
        <p className="mb-10 text-[15px] leading-relaxed text-[#94a3b8]">
          This page summarizes the currently evidenced public service scope. Contract terms, if any, are controlled by
          the signed agreement or approved order form for the customer.
        </p>
        <div className="space-y-8 text-[15px] leading-relaxed text-[#94a3b8]">
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Service scope</h2>
            <p>
              Pretzel includes an authenticated Chrome extension for supported ChatGPT, Claude, and Gemini hosts and a
              Console for organization administration, rule authoring, and policy publishing.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Customer responsibilities</h2>
            <p>
              Customers are responsible for deciding what rules to publish, reviewing matched prompt content, managing
              organization access, and confirming that their use of Pretzel fits their internal policies and legal
              obligations.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Limitations</h2>
            <p>
              Prompt detection is best-effort. Pretzel does not guarantee detection, prevention, availability,
              regulatory compliance, or coverage outside the supported hosts listed in current product copy.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Commercial and legal terms</h2>
            <p>
              Billing, cancellation, support, availability, liability, governing-law, and dispute terms are provided
              through the applicable approved agreement. Contact{' '}
              <a className="text-[#a78bfa]" href="mailto:hello@ciyo.ai">hello@ciyo.ai</a> for current approved terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
