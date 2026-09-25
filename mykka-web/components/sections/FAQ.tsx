import { H2 } from './H2'
import { FAQ_ITEMS } from './faq-data'

// Native <details> keeps every answer in the DOM for crawlers and needs no client JS.
// Sharing a `name` makes the group exclusive (one open at a time) in browsers that support it.
export function FAQ() {
  return (
    <section id="faq" className="mx-auto grid max-w-[1200px] gap-12 px-6 py-24 lg:grid-cols-2">
      <H2>Questions IT asks us</H2>
      <div className="flex flex-col">
        {FAQ_ITEMS.map(({ question, answer }, i) => (
          <details key={question} name="faq" open={i === 0} className="group border-b border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[18px] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              <span>{question}</span>
              <span className="font-mono text-muted group-open:hidden">+</span>
              <span className="hidden font-mono text-muted group-open:inline">–</span>
            </summary>
            <p className="m-0 mb-5 max-w-[640px] text-[16px] leading-[1.6] text-muted">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
