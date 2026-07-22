import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for the mykka.ai Pretzel AI DLP platform.',
}

const LAST_UPDATED = 'June 2026'

export default function TermsPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">Legal</p>
        <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-white">Terms of Service</h1>
        <p className="mb-12 text-[13px] text-[#64748b]">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-[15px] leading-relaxed text-[#94a3b8]">

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Pretzel AI data loss prevention platform, the mykka.ai website, or the Pretzel Chrome extension (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are using the Service on behalf of an organisation, you represent that you have authority to bind that organisation to these Terms.
            </p>
            <p className="mt-3">
              If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">2. Description of Service</h2>
            <p>
              mykka.ai provides an AI prompt data loss prevention platform comprising: (a) the Pretzel Chrome browser extension that intercepts and evaluates AI prompts against administrator-configured policy rules; (b) the Pretzel Console, a web application for configuring DLP policies, managing members, and reviewing audit logs; and (c) the AI Policy Assistant, an AI-powered interface for managing policies through natural language.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">3. Accounts and Eligibility</h2>
            <ul className="space-y-2">
              <li>— You must be at least 18 years of age to create an account.</li>
              <li>— You are responsible for maintaining the security of your account credentials. You must notify us immediately of any unauthorised access at <a href="mailto:security@mykka.ai" className="text-[#8fb3ff] hover:underline">security@mykka.ai</a>.</li>
              <li>— One organisation account may have multiple administrator users. Each administrator is responsible for compliance with these Terms.</li>
              <li>— You are responsible for all activity that occurs under your account.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">4. Permitted Use</h2>
            <p className="mb-3">You may use the Service solely for lawful business purposes. You must not:</p>
            <ul className="space-y-2">
              <li>— Use the Service to monitor employees in violation of applicable employment or privacy law. You are responsible for obtaining any legally required consents from your employees before deploying the Pretzel extension to their browsers.</li>
              <li>— Attempt to reverse engineer, decompile, or extract source code from the Service.</li>
              <li>— Use the Service to store, transmit, or process data that would violate any applicable law or regulation.</li>
              <li>— Resell or sublicense the Service without our written consent.</li>
              <li>— Attempt to circumvent or disable any security features of the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">5. Subscription, Billing, and Cancellation</h2>
            <ul className="space-y-2">
              <li>— The Service is offered on a subscription basis. Current pricing is available at <a href="/pricing" className="text-[#8fb3ff] hover:underline">mykka.ai/pricing</a>.</li>
              <li>— Subscriptions renew automatically at the end of each billing period unless cancelled. You may cancel at any time from the Console Settings page. Cancellation takes effect at the end of the current billing period.</li>
              <li>— Payments are processed by Stripe. By providing payment information, you authorise us to charge your payment method for the applicable subscription fees.</li>
              <li>— All fees are non-refundable except as required by applicable law or as expressly stated in these Terms.</li>
              <li>— We reserve the right to modify pricing with 30 days&apos; advance notice to account administrators.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">6. Data and Privacy</h2>
            <p>
              Our collection and use of data is governed by our{' '}
              <a href="/privacy" className="text-[#8fb3ff] hover:underline">Privacy Policy</a>,
              which is incorporated into these Terms by reference. For enterprise customers, a Data Processing Agreement (DPA) is available on request at{' '}
              <a href="mailto:privacy@mykka.ai" className="text-[#8fb3ff] hover:underline">privacy@mykka.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">7. Intellectual Property</h2>
            <p>
              The Service, including all software, algorithms, user interface designs, and documentation, is and remains the exclusive property of mykka.ai. These Terms do not grant you any rights in our intellectual property except the limited right to use the Service as described herein.
            </p>
            <p className="mt-3">
              You retain all rights to your organisation&apos;s data, DLP policy configurations, and any content you upload to the Service. You grant mykka.ai a limited licence to use that data solely to provide and improve the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">8. Service Availability and SLAs</h2>
            <p>
              We aim to provide a reliable Service but do not guarantee uninterrupted availability. The Pretzel Chrome extension operates locally in your employees&apos; browsers — policy enforcement does not depend on continuous server connectivity once a policy has been synced. Formal SLAs are available on Enterprise plans.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. MYKKA.AI DOES NOT WARRANT THAT THE SERVICE WILL DETECT ALL SENSITIVE DATA IN ALL CIRCUMSTANCES OR THAT IT WILL BE ERROR-FREE.
            </p>
            <p className="mt-3 text-[13px]">
              Pretzel is a best-effort DLP tool, not a guarantee of compliance. You remain responsible for your organisation&apos;s regulatory obligations.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">10. Limitation of Liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, MYKKA.AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUE, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES. OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU FOR THE SERVICE IN THE TWELVE MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">11. Termination</h2>
            <p>
              Either party may terminate these Terms at any time. We may suspend or terminate your access to the Service immediately if we believe you have violated these Terms or if required by law. Upon termination, your right to use the Service ceases and we will delete your data in accordance with our Privacy Policy retention schedule.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">12. Governing Law and Disputes</h2>
            <p>
              These Terms shall be governed by the laws of the State of Delaware, USA (or the relevant jurisdiction of mykka.ai&apos;s incorporation), without regard to conflict-of-law principles. Any disputes shall first be addressed through good-faith negotiation. Enterprise customers may negotiate alternative dispute resolution mechanisms in their contracts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">13. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be communicated to account administrators by email at least 14 days before taking effect. Continued use of the Service after the effective date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[20px] font-bold text-white">14. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{' '}
              <a href="mailto:hello@mykka.ai" className="text-[#8fb3ff] hover:underline">hello@mykka.ai</a>
              {' '}or{' '}
              <a href="mailto:sales@mykka.ai" className="text-[#8fb3ff] hover:underline">sales@mykka.ai</a>
              {' '}for enterprise contract inquiries.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
