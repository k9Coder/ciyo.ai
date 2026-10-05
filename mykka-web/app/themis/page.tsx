import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Themis — an on-device judgment model | mykka.ai research',
  description:
    'Themis is a research spike: a 138.8MB on-device model that scores arbitrary natural-language policy rules against text, entirely locally. Not yet integrated into the Pretzel product.',
  alternates: { canonical: 'https://mykka.ai/themis' },
  openGraph: {
    title: 'Themis — an on-device judgment model',
    description: 'A 138.8MB model, running entirely on-device, for judging text against arbitrary natural-language rules.',
  },
}

const stats: { label: string; value: string; note?: string }[] = [
  { label: 'Size', value: '138.8MB' },
  { label: 'F1 score', value: '0.800' },
  { label: 'Recall', value: '1.000', note: 'zero missed violations in the held-out set' },
  { label: 'Precision', value: '0.667' },
  { label: 'Accuracy', value: '0.845' },
  { label: 'Latency', value: '~207ms', note: 'per call, CPU, onnxruntime' },
]

export default function ThemisPage() {
  return (
    <div className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand">Research</p>
        <h1 className="mb-3 text-5xl font-extrabold tracking-tight text-ink">Themis</h1>
        <p className="mb-6 text-[15px] leading-relaxed text-muted">
          Named for the Greek goddess of divine law and judgment. Themis is a research spike exploring whether
          a small, fully on-device model can judge arbitrary natural-language rules against text — no fixed
          detection logic, no content leaving the device, and small enough to actually ship.
        </p>

        <div className="mb-10 rounded-2xl border border-brand bg-brand-soft p-4">
          <p className="text-[13px] font-semibold text-ink">Research preview, not a shipped feature</p>
          <p className="mt-1 text-[13px] text-muted">
            Themis has no integration point in the Pretzel extension, desktop app, or backend today. Everything
            on this page describes an internal experiment, not current product behavior.
          </p>
        </div>

        <h2 className="mb-4 text-xl font-bold text-ink">Benchmark</h2>
        <p className="mb-4 text-[13px] text-muted">
          Measured on a held-out set of 71 examples spanning 5 rule categories never seen during training —
          testing whether the model generalizes to genuinely new rules, not just the ones it was trained on.
        </p>
        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-ink/10 p-4">
              <p className="text-2xl font-extrabold tracking-tight text-ink">{s.value}</p>
              <p className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
              {s.note ? <p className="mt-1 text-[11px] text-muted">{s.note}</p> : null}
            </div>
          ))}
        </div>

        <h2 className="mb-3 text-xl font-bold text-ink">What it is</h2>
        <div className="mb-10 space-y-4 text-[15px] leading-relaxed text-muted">
          <p>
            Base model: DeBERTa-v3-small, fine-tuned to score a message against a plain-English rule — &ldquo;this
            message discloses a Social Security Number, even if disguised or spelled out&rdquo; — and output a
            match / no-match judgment.
          </p>
          <p>
            Most of DeBERTa-v3&rsquo;s size turned out to be its vocabulary: 128,100 tokens built for broad
            multilingual coverage this task never needed. Pruning it down to the ~19,000 tokens the task actually
            uses cut the model from 568MB to 138.8MB fp32 — and, after 8-bit quantization, 138.8MB deployable —
            without hurting accuracy.
          </p>
          <p>
            Recall is perfect on the held-out set: every real violation gets caught. Every error is a false
            positive, mostly the model confusing which specific rule a message matches when several rules sound
            related. For a policy-judgment model, over-flagging is the safer failure mode than missing something
            real — but it&rsquo;s also what keeps F1 at 0.800 rather than higher.
          </p>
        </div>

        <h2 className="mb-3 text-xl font-bold text-ink">Why this, not a bigger model</h2>
        <div className="space-y-4 text-[15px] leading-relaxed text-muted">
          <p>
            The investigation tried several larger approaches first — small generative language models scoring
            rules through a custom on-device head, instead of fixed pattern-matching. They worked, but didn&rsquo;t
            compress well: a 494M-parameter model held full accuracy at 949MB and collapsed badly once pushed
            down to 311MB. Themis, at 142M parameters, hit a size and accuracy point those larger models
            couldn&rsquo;t reach after compression.
          </p>
          <p>
            Vocabulary pruning was the one lever that improved size and accuracy at the same time. More aggressive
            cuts — removing half the model&rsquo;s layers, training with simulated quantization noise — either
            broke the model outright or made no measurable difference. Themis is the result of the path that
            actually worked.
          </p>
        </div>
      </div>
    </div>
  )
}
