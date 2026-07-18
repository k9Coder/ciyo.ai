import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Accessibility Information',
  description: 'How to report an accessibility issue with ciyo.ai.',
}

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-[#94a3b8]">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#7c6aff]">Accessibility</p>
      <h1 className="mb-6 text-3xl font-bold text-white">Accessibility Information</h1>
      <div className="space-y-6 leading-relaxed">
        <p>
          ciyo.ai works to make its public website usable by a broad audience. We do not publish a formal conformance
          claim without a current accessibility review.
        </p>
        <p>
          Current website work should preserve keyboard access, visible focus states, readable contrast, text
          alternatives for meaningful images, semantic headings, and responsive layouts.
        </p>
        <p>
          To report an accessibility issue or request assistance, email{' '}
          <a href="mailto:accessibility@ciyo.ai" className="underline hover:text-white">
            accessibility@ciyo.ai
          </a>
          . Include the page URL, assistive technology or browser if relevant, and the task you were trying to complete.
        </p>
      </div>
    </main>
  )
}
