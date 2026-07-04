// Profession-based onboarding policy templates.
// Product team: edit the subjects/rules arrays. Do NOT change profession or followUpAnswer slugs
// without updating the frontend wizard in pretzel-console/src/pages/OnboardingProfilePage.tsx.
//
// Run: npm run db:seed:templates
// TemplateContent shape matches onboarding/service.ts > TemplateContent interface.

export interface TemplateSeedRule {
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords?: string[]
  pattern?: string
  action: 'warn' | 'block'
  message?: string
  reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'
}

export interface TemplateSeedSubject {
  name: string
  description?: string
  rules: TemplateSeedRule[]
}

export interface TemplateSeedEntry {
  name: string
  description: string
  profession: string
  followUpAnswer: string  // '*' for wildcard (matches any answer for that profession)
  subjects: TemplateSeedSubject[]
}

export const professionTemplates: TemplateSeedEntry[] = [
  // ── Accountant — Client Financial Data ──────────────────────────────────────
  {
    name: 'Accountant — Client Data',
    description: 'Protects client financial data: credit card numbers, bank account details, tax IDs',
    profession: 'accountant',
    followUpAnswer: 'client_financial_data',
    subjects: [
      {
        name: 'Financial Identifiers',
        description: 'Credit card numbers, bank account numbers, and routing numbers',
        rules: [
          {
            kind: 'pattern',
            pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b',
            action: 'block',
            message: 'Credit card numbers cannot be pasted into AI tools',
            reportLevel: 'rich',
          },
          {
            kind: 'pattern',
            pattern: '\\b[0-9]{9,17}\\b',
            action: 'warn',
            message: 'This may be a bank account number. Confirm before sharing.',
            reportLevel: 'minimal',
          },
        ],
      },
      {
        name: 'Tax Identifiers',
        description: 'SSNs, EINs, and tax ID numbers',
        rules: [
          {
            kind: 'pattern',
            pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
            action: 'block',
            message: 'Social Security Numbers cannot be shared with AI tools',
            reportLevel: 'rich',
          },
          {
            kind: 'pattern',
            pattern: '\\b\\d{2}-\\d{7}\\b',
            action: 'block',
            message: 'EIN numbers cannot be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
      {
        name: 'Sensitive Keywords',
        description: 'Common financial document keywords',
        rules: [
          {
            kind: 'keyword',
            keywords: ['client confidential', 'tax return', 'bank statement', 'routing number', 'account balance'],
            action: 'warn',
            message: 'This text may contain client financial information',
            reportLevel: 'minimal',
          },
        ],
      },
    ],
  },

  // ── Accountant — Internal Only ───────────────────────────────────────────────
  {
    name: 'Accountant — Internal',
    description: 'Basic financial data protection for internal bookkeeping',
    profession: 'accountant',
    followUpAnswer: 'internal_only',
    subjects: [
      {
        name: 'Financial Identifiers',
        description: 'Credit card numbers and payment identifiers',
        rules: [
          {
            kind: 'pattern',
            pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b',
            action: 'block',
            message: 'Credit card numbers cannot be pasted into AI tools',
            reportLevel: 'rich',
          },
        ],
      },
    ],
  },

  // ── Developer — Source Code ──────────────────────────────────────────────────
  {
    name: 'Developer — Source Code',
    description: 'Protects proprietary source code and trade secrets from leaving to AI services',
    profession: 'developer',
    followUpAnswer: 'source_code',
    subjects: [
      {
        name: 'API Keys & Credentials',
        description: 'API keys, tokens, and secrets',
        rules: [
          {
            kind: 'pattern',
            pattern: '(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token)\\s*[=:]\\s*[\'"]?[A-Za-z0-9_\\-\\.]{16,}[\'"]?',
            action: 'block',
            message: 'API keys and credentials cannot be shared with AI tools',
            reportLevel: 'rich',
          },
          {
            kind: 'pattern',
            pattern: 'sk-[A-Za-z0-9]{32,}',
            action: 'block',
            message: 'Secret keys cannot be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
      {
        name: 'Private Keys',
        description: 'SSH and PEM private keys',
        rules: [
          {
            kind: 'pattern',
            pattern: '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
            action: 'block',
            message: 'Private keys must never be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
      {
        name: 'Source Code Markers',
        description: 'Detects large code blocks marked as proprietary',
        rules: [
          {
            kind: 'keyword',
            keywords: ['proprietary', 'confidential', 'trade secret', 'do not distribute'],
            action: 'warn',
            message: 'This content may be marked as proprietary or confidential',
            reportLevel: 'minimal',
          },
        ],
      },
    ],
  },

  // ── Developer — API Keys ─────────────────────────────────────────────────────
  {
    name: 'Developer — API Keys & Credentials',
    description: 'Prevents credential leakage to AI services',
    profession: 'developer',
    followUpAnswer: 'api_keys',
    subjects: [
      {
        name: 'API Keys & Credentials',
        description: 'API keys, tokens, and secrets',
        rules: [
          {
            kind: 'pattern',
            pattern: '(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token)\\s*[=:]\\s*[\'"]?[A-Za-z0-9_\\-\\.]{16,}[\'"]?',
            action: 'block',
            message: 'API keys and credentials cannot be shared with AI tools',
            reportLevel: 'rich',
          },
          {
            kind: 'pattern',
            pattern: 'sk-[A-Za-z0-9]{32,}',
            action: 'block',
            message: 'Secret keys cannot be shared with AI tools',
            reportLevel: 'rich',
          },
          {
            kind: 'pattern',
            pattern: 'gh[pousr]_[A-Za-z0-9]{36,}',
            action: 'block',
            message: 'GitHub tokens cannot be shared with AI tools',
            reportLevel: 'rich',
          },
          {
            kind: 'pattern',
            pattern: '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
            action: 'block',
            message: 'Private keys must never be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
    ],
  },

  // ── Legal — Client PII ───────────────────────────────────────────────────────
  {
    name: 'Legal — Client PII',
    description: 'Protects client PII and confidential case information',
    profession: 'legal',
    followUpAnswer: 'client_pii',
    subjects: [
      {
        name: 'Personal Identifiers',
        description: 'SSNs, passport numbers, and other PII',
        rules: [
          {
            kind: 'pattern',
            pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
            action: 'block',
            message: 'Social Security Numbers cannot be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
      {
        name: 'Legal Confidentiality',
        description: 'Attorney-client privilege markers',
        rules: [
          {
            kind: 'keyword',
            keywords: ['attorney-client privilege', 'work product', 'privileged and confidential', 'confidential settlement'],
            action: 'block',
            message: 'Privileged legal materials cannot be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
    ],
  },

  // ── Legal — Internal Docs ────────────────────────────────────────────────────
  {
    name: 'Legal — Internal Documents',
    description: 'Basic protection for internal legal documents',
    profession: 'legal',
    followUpAnswer: 'internal_docs',
    subjects: [
      {
        name: 'Legal Confidentiality',
        description: 'Standard legal confidentiality markers',
        rules: [
          {
            kind: 'keyword',
            keywords: ['confidential', 'attorney-client privilege', 'work product'],
            action: 'warn',
            message: 'This content may be confidential. Review before sharing.',
            reportLevel: 'minimal',
          },
        ],
      },
    ],
  },

  // ── Healthcare — Patient Data ────────────────────────────────────────────────
  {
    name: 'Healthcare — Patient Data (PHI)',
    description: 'HIPAA-aligned protection for protected health information',
    profession: 'healthcare',
    followUpAnswer: 'patient_data',
    subjects: [
      {
        name: 'Personal Identifiers',
        description: 'SSNs and patient ID numbers',
        rules: [
          {
            kind: 'pattern',
            pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
            action: 'block',
            message: 'Social Security Numbers cannot be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
      {
        name: 'Health Information',
        description: 'PHI keywords and identifiers',
        rules: [
          {
            kind: 'keyword',
            keywords: ['patient name', 'date of birth', 'medical record', 'diagnosis', 'PHI', 'HIPAA', 'health plan beneficiary'],
            action: 'block',
            message: 'Protected health information cannot be shared with AI tools',
            reportLevel: 'rich',
          },
        ],
      },
    ],
  },

  // ── Healthcare — Internal Only ───────────────────────────────────────────────
  {
    name: 'Healthcare — Internal Administrative',
    description: 'Basic protection for internal healthcare administrative data',
    profession: 'healthcare',
    followUpAnswer: 'internal_only',
    subjects: [
      {
        name: 'Health Keywords',
        description: 'Common health information markers',
        rules: [
          {
            kind: 'keyword',
            keywords: ['patient', 'medical record', 'diagnosis', 'PHI'],
            action: 'warn',
            message: 'This may contain health information. Review before sharing.',
            reportLevel: 'minimal',
          },
        ],
      },
    ],
  },
]
