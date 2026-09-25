// Native <details> keeps every answer in the DOM for crawlers and needs no client JS.
// Sharing a `name` makes the group exclusive (one open at a time) in browsers that support it.
export function FAQ({ title, items }: { title: string; items: { question: string; answer: string }[] }) {
  return (
    <section id="faq" className="mt-16">
      <h2 className="mb-2 text-[clamp(26px,3vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">{title}</h2>
      <div className="flex flex-col">
        {items.map(({ question, answer }, i) => (
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
