import { EXTENSION_NAME, EXTENSION_VERSION } from "@/shared/constants";

export function AboutPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">About {EXTENSION_NAME}</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Version {EXTENSION_VERSION}</p>
      </div>

      <div className="prose prose-sm text-[var(--text-secondary)] space-y-4">
        <p>
          mykka is a browser extension that inspects your prompts before they are sent
          to LLM chat interfaces. It detects credentials, PII, and other sensitive content
          using a configurable policy, then warns you before anything leaves your browser.
        </p>
        <p>
          Detection runs entirely in your browser. Aggregate scan counts and
          rule-trigger events are reported to your organisation&apos;s mykka.ai
          dashboard so administrators can monitor policy compliance. Policy
          rules are fetched from the mykka.ai backend and kept in sync
          automatically.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <a
          href="https://mykka.ai/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          Documentation
        </a>
        <a
          href="mailto:support@mykka.ai"
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          support@mykka.ai
        </a>
      </div>
    </div>
  );
}
