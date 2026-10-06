import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How mykka.ai collects, uses, and protects data in the Pretzel AI DLP platform.',
}

const LAST_UPDATED = 'September 2026'

export default function PrivacyPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand">Legal</p>
        <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-ink">Privacy Policy</h1>
        <p className="mb-12 text-[13px] text-muted">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-[15px] leading-relaxed text-muted">

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">1. Who We Are</h2>
            <p>
              mykka.ai operates the Pretzel AI data loss prevention platform (&quot;Pretzel&quot;, the &quot;Service&quot;).
              References to &quot;mykka.ai&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot; in this policy refer to mykka.ai and its Pretzel product.
              You can reach us at <a href="mailto:privacy@mykka.ai" className="text-brand hover:underline">privacy@mykka.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">2. Data We Collect</h2>
            <p className="mb-4">We collect the following categories of data:</p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">Account data.</strong> Name, email address, organisation details, and — if you sign up with email and password rather than Google sign-in — your account password, collected when you sign up via Clerk (our identity provider). Your password is hashed and stored by Clerk using industry-standard practices; mykka.ai never receives or stores your plaintext password.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">Member data.</strong> Employee email addresses imported by your organisation administrator to enrol members in Pretzel policy enforcement.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">Scan event data (Chrome extension).</strong> When the Pretzel extension evaluates a prompt on a supported AI chat site, it may collect: <strong className="text-ink">personally identifiable information</strong> (your account email, see Account data above); <strong className="text-ink">authentication information</strong> (a matched excerpt when a rule detects an API key, access token, or similar credential); <strong className="text-ink">financial and payment information</strong> (a matched excerpt when a rule detects a credit card number or similar financial identifier); <strong className="text-ink">personal communications</strong> (a matched excerpt of your AI chat prompt — never the full prompt); <strong className="text-ink">web history</strong> (the hostname of the AI site used and a timestamp); and <strong className="text-ink">website content</strong> (the matched excerpt read from the page&apos;s composer). Each category is collected only when a configured policy rule matches, retained in our backend for the period described in Section 5 (Data Retention), and shared only with the sub-processors listed in Section 4 (Third-Party Processors). <strong className="text-ink">Full prompt text is never transmitted to or stored on our servers.</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">Billing data.</strong> Payment is processed by Stripe. We store only Stripe customer and subscription reference IDs — no raw card numbers, CVVs, or expiry dates are stored by mykka.ai.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">Usage and analytics data.</strong> Aggregate statistics about AI tool usage patterns within your organisation (e.g., which AI sites are used most, total scans per day). This data is linked to your organisation, not to individual employees in reports you do not explicitly request.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">AI assistant inputs.</strong> If you use the AI Policy Assistant feature, your natural-language inputs to the assistant and the assistant&apos;s replies are stored to support conversation continuity. These inputs are also transmitted to your chosen LLM provider (see Section 4).</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded text-[11px] text-brand">✓</span>
                <span><strong className="text-ink">Error and diagnostic data.</strong> Anonymised application error logs are retained on our infrastructure to help us diagnose and fix issues.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">3. How We Use Your Data</h2>
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
            <h2 className="mb-3 text-[20px] font-bold text-ink">4. Third-Party Processors (Sub-processors)</h2>
            <p className="mb-4">
              We share data with the following sub-processors as necessary to deliver the Service:
            </p>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-fill">
                    <th className="px-4 py-3 text-left font-semibold text-ink">Processor</th>
                    <th className="px-4 py-3 text-left font-semibold text-ink">Purpose</th>
                    <th className="px-4 py-3 text-left font-semibold text-ink">Data transferred</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Clerk</td>
                    <td className="px-4 py-3">Identity and authentication</td>
                    <td className="px-4 py-3">Name, email address</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Neon</td>
                    <td className="px-4 py-3">Database hosting (AWS us-east-1, United States)</td>
                    <td className="px-4 py-3">All data stored by the Service, including account, member, policy, and audit-log data</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Render</td>
                    <td className="px-4 py-3">Backend and console hosting</td>
                    <td className="px-4 py-3">Data passing through the API, including scan events</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Vercel</td>
                    <td className="px-4 py-3">Marketing website hosting</td>
                    <td className="px-4 py-3">Website request data (IP address, page views)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Sentry</td>
                    <td className="px-4 py-3">Application error monitoring</td>
                    <td className="px-4 py-3">Error reports and diagnostic data</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Stripe</td>
                    <td className="px-4 py-3">Payment processing (paid plans only; not active during the pilot period)</td>
                    <td className="px-4 py-3">Billing name, email, payment method (handled directly by Stripe)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Anthropic</td>
                    <td className="px-4 py-3">AI Policy Assistant (Claude model)</td>
                    <td className="px-4 py-3">Policy configuration context and assistant conversation content when you use the AI assistant feature</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">OpenAI</td>
                    <td className="px-4 py-3">AI Policy Assistant (GPT-4o model, optional)</td>
                    <td className="px-4 py-3">Same as Anthropic above</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-ink">Groq</td>
                    <td className="px-4 py-3">AI Policy Assistant (LLaMA model, optional)</td>
                    <td className="px-4 py-3">Same as Anthropic above</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              We do not currently have a standard Data Processing Agreement. If your organisation needs one, contact{' '}
              <a href="mailto:privacy@mykka.ai" className="text-brand hover:underline">privacy@mykka.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">5. Data Retention</h2>
            <p className="mb-3">
              We retain data for as long as your organisation account is active and as needed to provide the Service.
              Specific retention periods:
            </p>
            <ul className="space-y-2">
              <li>— <strong className="text-ink">Scan counts and enforcement signals</strong>: deleted automatically after 90 days.</li>
              <li>— <strong className="text-ink">Audit-log events</strong> (including any matched excerpts): retained while your organisation account is active. During early access there is no automatic expiry; we delete them on request.</li>
              <li>— <strong className="text-ink">Account and member data</strong>: retained for the lifetime of your account. Deleted within 30 days of account closure.</li>
              <li>— <strong className="text-ink">AI assistant conversation history</strong>: retained for 90 days, then deleted.</li>
              <li>— <strong className="text-ink">Billing records</strong>: retained for 7 years to comply with accounting regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">6. Your Rights (GDPR & CCPA)</h2>
            <p className="mb-3">
              If you are located in the European Economic Area, United Kingdom, or California, you have the following rights regarding your personal data:
            </p>
            <ul className="space-y-2">
              <li>— <strong className="text-ink">Access</strong>: request a copy of the personal data we hold about you.</li>
              <li>— <strong className="text-ink">Rectification</strong>: correct inaccurate data.</li>
              <li>— <strong className="text-ink">Erasure</strong>: request deletion of your personal data (subject to legal retention obligations).</li>
              <li>— <strong className="text-ink">Restriction</strong>: request that we limit processing of your data.</li>
              <li>— <strong className="text-ink">Portability</strong>: receive your data in a structured, machine-readable format.</li>
              <li>— <strong className="text-ink">Objection</strong>: object to processing based on legitimate interests.</li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, email{' '}
              <a href="mailto:privacy@mykka.ai" className="text-brand hover:underline">privacy@mykka.ai</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">7. Data Transfers</h2>
            <p>
              mykka.ai infrastructure is hosted via third-party sub-processors including Render (backend compute), Neon (database, AWS us-east-1), and Vercel (frontend delivery), which operate primarily in the United States. Some additional sub-processors (Clerk, Anthropic, OpenAI, Groq) also process data in the United States. We do not currently offer EU data residency.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">8. Security</h2>
            <p>
              Data in transit is protected by HTTPS, and data at rest is encrypted by our database provider. Organisation and admin tokens are stored only as bcrypt hashes. We have not completed a third-party security audit such as SOC 2. For more detail, see our{' '}
              <a href="/security" className="text-brand hover:underline">Security &amp; Trust page</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">9. Cookies</h2>
            <p>
              The Pretzel marketing website (mykka.ai) uses functional cookies required for authentication and session management. We do not use third-party advertising or tracking cookies on the marketing website.
              The Pretzel Chrome extension requests the browser&apos;s cookies permission solely to read the session cookie set by our sign-in page (pretzel-console.mykka.ai) so the extension can recognise that you are signed in. The extension does not set its own tracking cookies and does not read cookies from any site other than pretzel-console.mykka.ai.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be notified to account administrators by email at least 14 days before they take effect. The &quot;Last updated&quot; date at the top of this page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-ink">11. Contact Us</h2>
            <p>
              For privacy questions or data subject requests, contact:{' '}
              <a href="mailto:privacy@mykka.ai" className="text-brand hover:underline">privacy@mykka.ai</a>
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
