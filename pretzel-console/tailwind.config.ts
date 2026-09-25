import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand:           "var(--brand-primary)",
        "bg-base":       "var(--bg-base)",
        "bg-surf":       "var(--bg-surface)",
        "bg-raised":     "var(--bg-surface-raised)",
        border:          "var(--border)",
        "txt-primary":   "var(--text-primary)",
        "txt-secondary": "var(--text-secondary)",
        "txt-muted":     "var(--text-muted)",
        danger:          "var(--status-danger)",
        warn:            "var(--status-warn)",
        safe:            "var(--status-safe)",
        ink:             "var(--ink)",
        muted:           "var(--muted)",
        fill:            "var(--fill)",
        line:            "var(--line)",
      },
      fontFamily: {
        sans: ["var(--font)"],
        mono: ["var(--mono)"],
      },
    },
  },
  plugins: [],
} satisfies Config
