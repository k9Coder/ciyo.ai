import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Notice',
  description: 'Current privacy-scope information for Pretzel.',
}

export default function PrivacyPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Privacy</p>
        <h1 className="mb-4 text-5xl font-extrabold tracking-tight text-white">Privacy Information</h1>
        <p className="mb-10 text-[15px] leading-relaxed text-[#94a3b8]">
          This page states the currently evidenced privacy behavior at a product level. It avoids residency,
          certification, retention, payment-processing, and compliance claims until those claims have approved evidence.
        </p>
        <div className="space-y-8 text-[15px] leading-relaxed text-[#94a3b8]">
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Account and organization data</h2>
            <p>
              Pretzel uses account, organization, membership, and policy data for authentication, administration, and
              policy publishing. Console administrators can manage organization members, rules, policy releases, audit
              views, settings, and billing status.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Prompt evaluation</h2>
            <p>
              The Chrome extension evaluates prompts locally on supported ChatGPT, Claude, and Gemini hosts. Depending
              on published policy configuration, scan events and matched excerpts may be reported for administrator
              audit use.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Current exclusions</h2>
            <p>
              This notice does not claim a specific hosting region, retention period, subprocessor list,
              transfer mechanism, payment processor, certification, or regulatory-compliance status.
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">Contact</h2>
            <p>
              Contact <a className="text-[#a78bfa]" href="mailto:privacy@ciyo.ai">privacy@ciyo.ai</a> for approved
              current privacy terms, data-processing terms, or operational details.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
