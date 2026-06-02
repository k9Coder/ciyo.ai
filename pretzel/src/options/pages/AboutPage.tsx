import { EXTENSION_NAME, EXTENSION_VERSION } from "@/shared/constants";

export function AboutPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">About {EXTENSION_NAME}</h2>
        <p className="text-sm text-gray-500 mt-1">Version {EXTENSION_VERSION}</p>
      </div>

      <div className="prose prose-sm text-gray-700 space-y-4">
        <p>
          ciyo is a browser extension that inspects your prompts before they are sent
          to LLM chat interfaces. It detects credentials, PII, and other sensitive content
          using a configurable policy, then warns you before anything leaves your browser.
        </p>
        <p>
          All detection and storage happens locally — no data is ever sent to a backend.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <a
          href="https://github.com/your-org/ciyo"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          Documentation &amp; source code
        </a>
        <a
          href="mailto:support@ciyo.ai"
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          support@ciyo.ai
        </a>
      </div>
    </div>
  );
}
