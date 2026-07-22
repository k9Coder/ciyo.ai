import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How mykka.ai collects, uses, and protects data in the Pretzel AI DLP platform.',
}

const LAST_UPDATED = 'June 2026'

export default function PrivacyPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Legal</p>
        <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-white">Privacy Policy</h1>
        <p className="mb-12 text-[13px] text-[#64748b]">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-[15px] leading-relaxed text-[#94a3b8]">

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">1. Who We Are</h2>
            <p>
              mykka.ai operates the Pretzel AI data loss prevention platform (&quot;Pretzel&quot;, the &quot;Service&quot;).
              References to &quot;mykka.ai&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot; in this policy refer to mykka.ai and its Pretzel product.
              You can reach us at <a href="mailto:privacy@mykka.ai" className="text-[#8fb3ff] hover:underline">privacy@mykka.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">2. Data We Collect</h2>
            <p className="mb-4">We collect the following categories of data:</p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">Account data.</strong> Name, email address, and organisation details collected when you sign up via Clerk (our identity provider).</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">Member data.</strong> Employee email addresses imported by your organisation administrator to enrol members in Pretzel policy enforcement.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">Scan event data.</strong> When the Pretzel extension evaluates a prompt, we record: which rule matched, which AI site was used, which organisation member submitted the prompt, the action taken (warn/block/allow), and a timestamp. For rules configured to report matched content, a brief excerpt of the matched text may also be retained for audit purposes. <strong className="text-white">Full prompt text is never transmitted to or stored on our servers.</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">Billing data.</strong> Payment is processed by Stripe. We store only Stripe customer and subscription reference IDs — no raw card numbers, CVVs, or expiry dates are stored by mykka.ai.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">Usage and analytics data.</strong> Aggregate statistics about AI tool usage patterns within your organisation (e.g., which AI sites are used most, total scans per day). This data is linked to your organisation, not to individual employees in reports you do not explicitly request.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">AI assistant inputs.</strong> If you use the AI Policy Assistant feature, your natural-language inputs to the assistant and the assistant&apos;s replies are stored to support conversation continuity. These inputs are also transmitted to your chosen LLM provider (see Section 4).</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-[#34d399]">✓</span>
                <span><strong className="text-white">Error and diagnostic data.</strong> Anonymised application error logs are retained on our infrastructure to help us diagnose and fix issues.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">3. How We Use Your Data</h2>
            <ul className="space-y-2">
              <li>— To provide and operate the Pretzel Service under your subscription contract.</li>
              <li>— To enforce the DLP policy rules your organisation administrator has configured.</li>
              <li>— To display analytics dashboards and audit logs to your organisation administrators.</li>
              <li>— To send transactional emails (e.g., subscription confirmations, policy alerts).</li>
              <li>— To improve the Service through aggregate, anonymised usage analysis.</li>
              <li>— To comply with legal obligations and respond to lawful requests.</li>
            </ul>
            <p className="mt-4">
              We do not sell your data to third parties. We do not use employee scan data to train AI models.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">4. Third-Party Processors (Sub-processors)</h2>
            <p className="mb-4">
              We share data with the following sub-processors as necessary to deliver the Service. All sub-processors are engaged under data processing agreements consistent with GDPR Article 28:
            </p>
            <div className="overflow-hidden rounded-xl border border-white/[0.07]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-white/[0.03]">
                    <th className="px-4 py-3 text-left font-semibold text-white">Processor</th>
                    <th className="px-4 py-3 text-left font-semibold text-white">Purpose</th>
                    <th className="px-4 py-3 text-left font-semibold text-white">Data transferred</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  <tr>
                    <td className="px-4 py-3 font-medium text-white">Clerk</td>
                    <td className="px-4 py-3">Identity and authentication</td>
                    <td className="px-4 py-3">Name, email address</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-white">Stripe</td>
                    <td className="px-4 py-3">Payment processing (paid plans only; not active during the pilot period)</td>
                    <td className="px-4 py-3">Billing name, email, payment method (handled directly by Stripe)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-white">Anthropic</td>
                    <td className="px-4 py-3">AI Policy Assistant (Claude model)</td>
                    <td className="px-4 py-3">Policy configuration context and assistant conversation content when you use the AI assistant feature</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-white">OpenAI</td>
                    <td className="px-4 py-3">AI Policy Assistant (GPT-4o model, optional)</td>
                    <td className="px-4 py-3">Same as Anthropic above</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-white">Groq</td>
                    <td className="px-4 py-3">AI Policy Assistant (LLaMA model, optional)</td>
                    <td className="px-4 py-3">Same as Anthropic above</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              Enterprise customers may request a full sub-processor addendum as part of their DPA. Contact{' '}
              <a href="mailto:privacy@mykka.ai" className="text-[#8fb3ff] hover:underline">privacy@mykka.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">5. Data Retention</h2>
            <p className="mb-3">
              We retain data for as long as your organisation account is active and as needed to provide the Service.
              Specific retention periods:
            </p>
            <ul className="space-y-2">
              <li>— <strong className="text-white">Scan event records</strong> (audit log): retained for the period covered by your subscription plan (30 days on Solo, 30 days on Starter, 12 months on Business, configurable on Enterprise). Records are deleted or anonymised at the end of this window.</li>
              <li>— <strong className="text-white">Account and member data</strong>: retained for the lifetime of your account. Deleted within 30 days of account closure.</li>
              <li>— <strong className="text-white">AI assistant conversation history</strong>: retained for 90 days, then deleted.</li>
              <li>— <strong className="text-white">Billing records</strong>: retained for 7 years to comply with accounting regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">6. Your Rights (GDPR & CCPA)</h2>
            <p className="mb-3">
              If you are located in the European Economic Area, United Kingdom, or California, you have the following rights regarding your personal data:
            </p>
            <ul className="space-y-2">
              <li>— <strong className="text-white">Access</strong>: request a copy of the personal data we hold about you.</li>
              <li>— <strong className="text-white">Rectification</strong>: correct inaccurate data.</li>
              <li>— <strong className="text-white">Erasure</strong>: request deletion of your personal data (subject to legal retention obligations).</li>
              <li>— <strong className="text-white">Restriction</strong>: request that we limit processing of your data.</li>
              <li>— <strong className="text-white">Portability</strong>: receive your data in a structured, machine-readable format.</li>
              <li>— <strong className="text-white">Objection</strong>: object to processing based on legitimate interests.</li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, email{' '}
              <a href="mailto:privacy@mykka.ai" className="text-[#8fb3ff] hover:underline">privacy@mykka.ai</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">7. Data Transfers</h2>
            <p>
              mykka.ai infrastructure is hosted via third-party sub-processors including Fly.io (backend compute), Neon (database), and Vercel (frontend delivery), which operate primarily in the United States. Some additional sub-processors (Clerk, Anthropic, OpenAI, Groq) also process data in the United States. Where international transfers occur, we rely on Standard Contractual Clauses (SCCs) or other approved transfer mechanisms under GDPR Chapter V.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">8. Security</h2>
            <p>
              All data in transit is protected by TLS 1.3. Data at rest is encrypted with AES-256. Organisation tokens are hashed with bcrypt. We are working toward SOC 2 Type II certification (targeted Q3 2026). For our full security posture, see our{' '}
              <a href="/security" className="text-[#8fb3ff] hover:underline">Security &amp; Trust page</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">9. Cookies</h2>
            <p>
              The Pretzel marketing website (mykka.ai) uses functional cookies required for authentication and session management. We do not use third-party advertising or tracking cookies on the marketing website.
              The Pretzel Chrome extension does not set cookies.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be notified to account administrators by email at least 14 days before they take effect. The &quot;Last updated&quot; date at the top of this page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">11. Contact Us</h2>
            <p>
              For privacy questions, data subject requests, or to request our Data Processing Agreement (DPA), contact:{' '}
              <a href="mailto:privacy@mykka.ai" className="text-[#8fb3ff] hover:underline">privacy@mykka.ai</a>
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
