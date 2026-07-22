export function VideoDemo() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#5b8cff]">See It In Action</p>
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-white">
          Watch Pretzel block a real leak
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-[15px] text-[#94a3b8]">
          A Finance team member tries to paste a customer spreadsheet into ChatGPT.
          Pretzel catches the PII and blocks the prompt before it&apos;s sent.
        </p>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#17171e] shadow-2xl shadow-black/60">
          <div className="relative aspect-video w-full">
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-[#5b8cff]/20 ring-1 ring-[#5b8cff]/40">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M7 4L16 10L7 16V4Z" fill="#8fb3ff"/>
                </svg>
              </div>
              <p className="text-[13px] text-[#64748b]">90-second explainer — coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
