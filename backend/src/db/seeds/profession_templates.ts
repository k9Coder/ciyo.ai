// Profession-based onboarding policy templates.
// Product team: edit the subjects/rules arrays. Do NOT change profession or followUpAnswer slugs
// without updating the frontend wizard in pretzel-console/src/pages/OnboardingProfilePage.tsx.
//
// Run: npm run seed:templates   (from backend/; re-running updates existing templates in place)
// TemplateContent shape matches onboarding/service.ts > TemplateContent interface.
//
// How the extension evaluates these (packages/detect/src/policy/bridge.ts):
//   - pattern rules compile with flags "gi" and NO validator (no Luhn / SSN checks), so
//     every pattern here must be precise on its own — prefer a label anchor ("MRN:",
//     "routing number") or a structural lookahead over bare digit runs.
//   - keyword rules match case-insensitively on word boundaries (\bterm\b), so each
//     keyword must start and end with a letter or digit.
//   - a tenant's published policy REPLACES the built-in baseline rules, so anything a
//     profession needs (cards, SSNs, secrets) must be listed in its template.
// Covered by profession_templates.test.ts — add a sample there when adding a pattern.

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

const block = (pattern: string, message: string): TemplateSeedRule =>
  ({ kind: 'pattern', pattern, action: 'block', message, reportLevel: 'rich' })

const warn = (pattern: string, message: string): TemplateSeedRule =>
  ({ kind: 'pattern', pattern, action: 'warn', message, reportLevel: 'minimal' })

const keywords = (action: 'warn' | 'block', list: string[], message: string): TemplateSeedRule =>
  ({ kind: 'keyword', keywords: list, action, message, reportLevel: action === 'block' ? 'rich' : 'minimal' })

// Label separator shared by the contextual patterns: optional "number"/"no."/"#", then ":", "#" or "=".
const NO = String.raw`\s*(?:number|no\.?|num|#)?\s*[:#=]?\s*`
// An ID token that contains at least one digit — keeps "medical record keeping" from matching.
const ID = (min: number, max: number) => String.raw`(?=[A-Z-]*\d)[A-Z0-9-]{${min},${max}}\b`

export const templateRules = {
  // ── Payment cards ─────────────────────────────────────────────────────────
  cardNumber: block(
    String.raw`\b(?:4(?:[\s-]?\d){12}(?:(?:[\s-]?\d){3})?|5[1-5](?:[\s-]?\d){14}|2[2-7]\d\d(?:[\s-]?\d){12}|3[47](?:[\s-]?\d){13}|6(?:011|5\d\d)(?:[\s-]?\d){12}|3(?:0[0-5]|[68]\d)(?:[\s-]?\d){11}|35\d\d(?:[\s-]?\d){12})\b`,
    'Credit card numbers cannot be pasted into AI tools',
  ),
  cardCvv: block(
    String.raw`\b(?:cvv2?|cvc2?|cid|card security code|security code)\s*[:#=]?\s*\d{3,4}\b`,
    'Card security codes (CVV/CVC) cannot be shared with AI tools',
  ),
  cardExpiry: warn(
    String.raw`\b(?:exp(?:iry|iration)?(?:\s*date)?|valid thru)\s*[:#=]?\s*(?:0[1-9]|1[0-2])\s*\/\s*(?:\d{4}|\d{2})\b`,
    'This looks like a card expiry date. Confirm before sharing.',
  ),

  // ── Banking ───────────────────────────────────────────────────────────────
  routingNumber: block(
    String.raw`\b(?:routing|aba|rtn|transit)${NO}\d{9}\b`,
    'Bank routing numbers cannot be shared with AI tools',
  ),
  bankAccount: block(
    String.raw`\b(?:bank\s*)?(?:account|acct|a\/c)\s*(?:(?:number|no\.?|num|#)\s*[:#=]?|[:#=])\s*\d(?:[\s-]?\d){5,16}\b`,
    'Bank account numbers cannot be shared with AI tools',
  ),
  iban: block(
    String.raw`\b(?:AD|AE|AT|BE|BG|BH|BR|CH|CY|CZ|DE|DK|EE|ES|FI|FR|GB|GI|GR|HR|HU|IE|IL|IS|IT|JO|KW|LB|LI|LT|LU|LV|MC|MT|NL|NO|PL|PT|QA|RO|RS|SA|SE|SI|SK|SM|TR|UA)\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b`,
    'IBAN account numbers cannot be shared with AI tools',
  ),
  swiftCode: warn(
    String.raw`\b(?:swift|bic)(?:\s*code\s*[:#=]?|\s*[:#=])\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b`,
    'This looks like a SWIFT/BIC code. Confirm before sharing wire details.',
  ),
  wireKeywords: keywords('warn',
    ['wire instructions', 'wire transfer details', 'beneficiary account', 'beneficiary bank', 'remittance details'],
    'This text may contain wire or payment instructions',
  ),

  // ── Tax & government identifiers ──────────────────────────────────────────
  ssn: block(
    String.raw`\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b`,
    'Social Security Numbers cannot be shared with AI tools',
  ),
  ssnLabeled: block(
    String.raw`\b(?:ssn|social security(?:\s*(?:number|no\.?|#))?)\s*[:#=]?\s*(?!000|666|9\d\d)\d{3}[\s.]?(?!00)\d{2}[\s.]?(?!0000)\d{4}\b`,
    'Social Security Numbers cannot be shared with AI tools',
  ),
  itin: block(
    String.raw`\b9\d{2}-(?:5\d|6[0-5]|7\d|8[0-8]|9[0-24-9])-\d{4}\b`,
    'Individual Taxpayer Identification Numbers (ITIN) cannot be shared with AI tools',
  ),
  ein: block(
    String.raw`\b\d{2}-\d{7}\b`,
    'EIN numbers cannot be shared with AI tools',
  ),
  dateOfBirth: block(
    String.raw`\b(?:dob|d\.o\.b\.?|date of birth|birth\s*date)\s*[:#=]?\s*(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Z]{3,9}\.?\s+\d{1,2},?\s+\d{4})`,
    'Dates of birth tied to a person cannot be shared with AI tools',
  ),
  passport: block(
    String.raw`\bpassport${NO}(?=[A-Z]*\d)[A-Z0-9]{6,9}\b`,
    'Passport numbers cannot be shared with AI tools',
  ),
  driversLicense: block(
    String.raw`\b(?:driver'?s?\s*licen[cs]e|dl)${NO}${ID(5, 15)}`,
    "Driver's license numbers cannot be shared with AI tools",
  ),

  // ── Finance documents & market-sensitive info ─────────────────────────────
  financialDocuments: keywords('warn',
    ['client confidential', 'tax return', 'bank statement', 'brokerage statement', 'account balance',
     'routing number', 'form 1040', 'W-2', 'W-9', 'Form 1099', '1099-NEC', '1099-MISC', '1099-INT',
     '1099-DIV', 'schedule K-1', 'credit report', 'loan application', 'general ledger', 'trial balance'],
    'This text may contain client financial information',
  ),
  payrollKeywords: keywords('warn',
    ['payroll register', 'payroll report', 'salary schedule', 'employee compensation', 'direct deposit', 'pay stub'],
    'This text may contain payroll or employee compensation data',
  ),
  materialNonPublic: keywords('block',
    ['material non-public', 'material nonpublic', 'MNPI', 'inside information', 'insider information',
     'draft earnings release', 'unreleased earnings', 'embargoed until', 'pre-announcement'],
    'Material non-public information cannot be shared with AI tools',
  ),
  cryptoWallet: warn(
    String.raw`\b(?:0x[a-f0-9]{40}|bc1[a-z0-9]{39,59})\b`,
    'This looks like a crypto wallet address. Confirm before sharing.',
  ),
  cryptoSecrets: keywords('block',
    ['seed phrase', 'recovery phrase', 'mnemonic phrase', 'wallet private key'],
    'Wallet recovery phrases and private keys cannot be shared with AI tools',
  ),

  // ── Healthcare (HIPAA identifiers) ────────────────────────────────────────
  medicalRecordNumber: block(
    String.raw`\b(?:mrn|medical record|patient\s*(?:id|number|no\.?|#)|chart\s*(?:number|no\.?|#)|encounter\s*(?:id|number|#))${NO}${ID(5, 20)}`,
    'Medical record and patient ID numbers cannot be shared with AI tools',
  ),
  medicareMbi: block(
    String.raw`\b[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y\d]\d-?[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y\d]\d-?[AC-HJKMNP-RT-Y]{2}\d{2}\b`,
    'Medicare Beneficiary Identifiers cannot be shared with AI tools',
  ),
  healthPlanId: block(
    String.raw`\b(?:member|subscriber|policy|group|insurance|medicaid|medicare|beneficiary|health plan)\s*(?:id|number|no\.?|num|#)\s*[:#=]?\s*${ID(5, 20)}`,
    'Health plan member and policy IDs cannot be shared with AI tools',
  ),
  prescriptionNumber: block(
    String.raw`\b(?:rx|prescription)\s*(?:number|no\.?|num|#)\s*[:#=]?\s*\d{5,12}\b`,
    'Prescription numbers cannot be shared with AI tools',
  ),
  patientName: block(
    String.raw`\b(?:patient|pt)\s*name\s*[:#=]\s*\S+`,
    'Patient names cannot be shared with AI tools',
  ),
  clinicalNoteHeaders: block(
    String.raw`\b(?:chief complaint|history of present illness|hpi|assessment\s*(?:and|&)\s*plan|discharge diagnos[ei]s|past medical history|pmh|review of systems|ros)\s*:`,
    'This looks like a clinical note. Patient notes cannot be shared with AI tools.',
  ),
  diagnosisCode: warn(
    String.raw`\b(?:icd-?10(?:-cm)?|diagnosis|dx)\s*(?:code)?\s*[:#=]?\s*[A-TV-Z]\d[0-9A-Z](?:\.[0-9A-Z]{1,4})?\b`,
    'This looks like a diagnosis code. Make sure it is not linked to a patient.',
  ),
  deaNumber: warn(
    String.raw`\b[ABCDEFGHJKLMPRSTUX][A-Z]\d{7}\b`,
    'This may be a DEA registration number. Confirm before sharing.',
  ),
  claimNumber: warn(
    String.raw`\bclaim\s*(?:number|no\.?|num|id|#)\s*[:#=]?\s*${ID(6, 20)}`,
    'This looks like an insurance claim number. Confirm before sharing.',
  ),
  phiIdentifiers: keywords('block',
    ['patient name', 'date of birth', 'medical record', 'health plan beneficiary'],
    'Protected health information cannot be shared with AI tools',
  ),
  phiGeneral: keywords('warn',
    ['diagnosis', 'PHI', 'HIPAA', 'protected health information', 'treatment plan', 'lab results',
     'discharge summary', 'progress note', 'operative report', 'pathology report', 'medication list'],
    'This may contain health information. Review before sharing.',
  ),
  sensitiveHealth: keywords('warn',
    ['HIV positive', 'HIV status', 'substance use disorder', 'substance abuse treatment', 'psychotherapy notes',
     'psychiatric evaluation', 'mental health record', 'genetic test results', '42 CFR Part 2', 'reproductive health'],
    'This may contain specially protected health information. Review carefully before sharing.',
  ),
  healthBilling: keywords('warn',
    ['explanation of benefits', 'prior authorization', 'superbill', 'remittance advice', 'CMS-1500', 'UB-04',
     'insurance claim'],
    'This may contain patient billing or insurance information',
  ),

  // ── Legal ─────────────────────────────────────────────────────────────────
  privilege: keywords('block',
    ['attorney-client privilege', 'attorney client privilege', 'attorney work product', 'work product privilege',
     'privileged and confidential', 'privileged & confidential', 'prepared at the direction of counsel',
     'confidential settlement', 'settlement communication', 'without prejudice'],
    'Privileged legal materials cannot be shared with AI tools',
  ),
  courtRestricted: keywords('block',
    ['filed under seal', 'under seal', 'subject to protective order', 'attorneys eyes only',
     "attorneys' eyes only", 'grand jury', 'sealed document'],
    'Sealed or court-restricted materials cannot be shared with AI tools',
  ),
  caseNumber: warn(
    String.raw`\b(?:(?:case|docket|matter|cause)\s*(?:number|no\.?|num|#)\s*[:#=]?\s*(?=[A-Z:.-]*\d)[A-Z0-9:.-]{4,25}|\d:\d{2}-(?:cv|cr|mc|bk|md|mj)-\d{3,6})\b`,
    'This looks like a case or matter number. Confirm the matter is not confidential.',
  ),
  contractKeywords: keywords('warn',
    ['non-disclosure agreement', 'confidentiality agreement', 'term sheet', 'letter of intent', 'merger agreement',
     'share purchase agreement', 'asset purchase agreement', 'due diligence report', 'indemnification'],
    'This text may contain confidential deal or contract terms',
  ),
  legalConfidentialityWarn: keywords('warn',
    ['confidential', 'attorney-client privilege', 'work product', 'privileged'],
    'This content may be confidential. Review before sharing.',
  ),
  legalDocumentScore: {
    kind: 'score', action: 'warn', reportLevel: 'minimal',
    message: 'This looks like a pasted legal document. Make sure it is not confidential.',
  } as TemplateSeedRule,

  // ── Secrets & credentials ─────────────────────────────────────────────────
  genericApiKey: block(
    String.raw`(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-\.]{16,}['"]?`,
    'API keys and credentials cannot be shared with AI tools',
  ),
  secretAssignment: block(
    String.raw`\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)[A-Z0-9_]*\s*=\s*['"]?[^\s'"]{8,}`,
    'Secrets in config or .env files cannot be shared with AI tools',
  ),
  passwordAssignment: block(
    String.raw`\b(?:password|passwd|pwd|passphrase)\s*[:=]\s*['"][^'"\s]{8,}['"]`,
    'Passwords cannot be shared with AI tools',
  ),
  openAiKey: block(
    String.raw`\bsk-(?:(?:proj|svcacct|admin|ant)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{32,})`,
    'OpenAI / Anthropic secret keys cannot be shared with AI tools',
  ),
  awsAccessKey: block(
    String.raw`\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b`,
    'AWS access keys cannot be shared with AI tools',
  ),
  awsSecretKey: block(
    String.raw`\baws_?secret_?access_?key\s*[=:]\s*['"]?[A-Za-z0-9\/+=]{40}`,
    'AWS secret keys cannot be shared with AI tools',
  ),
  githubToken: block(
    String.raw`\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})`,
    'GitHub tokens cannot be shared with AI tools',
  ),
  gitlabToken: block(
    String.raw`\bglpat-[A-Za-z0-9_-]{20,}`,
    'GitLab tokens cannot be shared with AI tools',
  ),
  slackToken: block(
    String.raw`\bxox[abposr]-[0-9A-Za-z-]{10,}`,
    'Slack tokens cannot be shared with AI tools',
  ),
  webhookUrl: block(
    String.raw`https:\/\/(?:hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+|(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+)`,
    'Webhook URLs act as credentials and cannot be shared with AI tools',
  ),
  googleApiKey: block(
    String.raw`\bAIza[0-9A-Za-z_-]{35}`,
    'Google API keys cannot be shared with AI tools',
  ),
  stripeKey: block(
    String.raw`\b(?:sk|rk)_live_[0-9A-Za-z]{24,}`,
    'Stripe live keys cannot be shared with AI tools',
  ),
  saasTokens: block(
    String.raw`\b(?:hf_[A-Za-z0-9]{34,}|npm_[A-Za-z0-9]{36,}|SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}|SK[0-9a-f]{32}\b)`,
    'Service API tokens (Hugging Face, npm, SendGrid, Twilio) cannot be shared with AI tools',
  ),
  azureConnectionString: block(
    String.raw`DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+\/=]{44,}`,
    'Azure storage connection strings cannot be shared with AI tools',
  ),
  jwt: block(
    String.raw`\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`,
    'Session and JWT tokens cannot be shared with AI tools',
  ),
  databaseUrl: block(
    String.raw`\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s:@\/]{1,64}:[^\s@\/]{6,128}@[^\s\/]+`,
    'Connection strings with embedded passwords cannot be shared with AI tools',
  ),
  privateKey: block(
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----`,
    'Private keys must never be shared with AI tools',
  ),
  highEntropyToken: {
    kind: 'entropy', action: 'warn', reportLevel: 'minimal',
    message: 'This looks like a random secret or token. Confirm before sharing.',
  } as TemplateSeedRule,

  // ── Infrastructure & source code ──────────────────────────────────────────
  internalIp: warn(
    String.raw`\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b`,
    'This contains an internal IP address. Confirm before sharing.',
  ),
  internalHostname: warn(
    String.raw`\b(?:[a-z0-9-]{1,63}\.){1,6}(?:internal|corp|intranet|lan)\b`,
    'This contains an internal hostname. Confirm before sharing.',
  ),
  proprietaryMarkers: keywords('warn',
    ['proprietary', 'confidential', 'trade secret', 'do not distribute', 'internal use only',
     'not for distribution', 'company confidential'],
    'This content may be marked as proprietary or confidential',
  ),
} satisfies Record<string, TemplateSeedRule>

const R = templateRules

const PAYMENT_CARDS: TemplateSeedSubject = {
  name: 'Payment Cards',
  description: 'Card numbers, security codes, and expiry dates',
  rules: [R.cardNumber, R.cardCvv, R.cardExpiry],
}

const SECRETS: TemplateSeedSubject = {
  name: 'API Keys & Credentials',
  description: 'API keys, tokens, passwords, and secrets for cloud and SaaS providers',
  rules: [
    R.genericApiKey, R.secretAssignment, R.passwordAssignment, R.openAiKey, R.awsAccessKey, R.awsSecretKey,
    R.githubToken, R.gitlabToken, R.slackToken, R.webhookUrl, R.googleApiKey, R.stripeKey, R.saasTokens,
    R.azureConnectionString, R.jwt, R.databaseUrl,
  ],
}

const PRIVATE_KEYS: TemplateSeedSubject = {
  name: 'Private Keys',
  description: 'SSH, TLS, and PGP private keys',
  rules: [R.privateKey],
}

export const professionTemplates: TemplateSeedEntry[] = [
  // ── Accountant — Client Financial Data ──────────────────────────────────────
  {
    name: 'Accountant — Client Data',
    description: 'Protects client financial data: cards, bank and wire details, tax IDs, and market-sensitive information',
    profession: 'accountant',
    followUpAnswer: 'client_financial_data',
    subjects: [
      PAYMENT_CARDS,
      {
        name: 'Bank & Wire Details',
        description: 'Routing numbers, account numbers, IBANs, and SWIFT codes',
        rules: [R.routingNumber, R.bankAccount, R.iban, R.swiftCode, R.wireKeywords],
      },
      {
        name: 'Tax Identifiers',
        description: 'SSNs, ITINs, EINs, and dates of birth',
        rules: [R.ssn, R.ssnLabeled, R.itin, R.ein, R.dateOfBirth],
      },
      {
        name: 'Market-Sensitive Information',
        description: 'Material non-public information and unreleased earnings',
        rules: [R.materialNonPublic],
      },
      {
        name: 'Crypto Assets',
        description: 'Wallet addresses and recovery phrases',
        rules: [R.cryptoWallet, R.cryptoSecrets],
      },
      {
        name: 'Financial Documents',
        description: 'Tax forms, statements, and ledgers',
        rules: [R.financialDocuments, R.payrollKeywords],
      },
    ],
  },

  // ── Accountant — Internal Only ───────────────────────────────────────────────
  {
    name: 'Accountant — Internal',
    description: 'Protects company bank details, payment cards, payroll, and employee tax IDs',
    profession: 'accountant',
    followUpAnswer: 'internal_only',
    subjects: [
      PAYMENT_CARDS,
      {
        name: 'Company Bank Details',
        description: 'Routing numbers, account numbers, and IBANs',
        rules: [R.routingNumber, R.bankAccount, R.iban, R.wireKeywords],
      },
      {
        name: 'Employee Tax Identifiers',
        description: 'SSNs and EINs',
        rules: [R.ssn, R.ssnLabeled, R.ein],
      },
      {
        name: 'Payroll & Ledgers',
        description: 'Payroll data and internal financial records',
        rules: [R.payrollKeywords, R.materialNonPublic],
      },
    ],
  },

  // ── Developer — Source Code ──────────────────────────────────────────────────
  {
    name: 'Developer — Source Code',
    description: 'Protects proprietary source code, credentials, and internal infrastructure details from leaving to AI services',
    profession: 'developer',
    followUpAnswer: 'source_code',
    subjects: [
      SECRETS,
      PRIVATE_KEYS,
      {
        name: 'Internal Infrastructure',
        description: 'Internal IP addresses, hostnames, and random-looking tokens',
        rules: [R.internalIp, R.internalHostname, R.highEntropyToken],
      },
      {
        name: 'Source Code Markers',
        description: 'Detects code marked as proprietary or confidential',
        rules: [R.proprietaryMarkers],
      },
    ],
  },

  // ── Developer — API Keys ─────────────────────────────────────────────────────
  {
    name: 'Developer — API Keys & Credentials',
    description: 'Prevents credential leakage to AI services across major cloud and SaaS providers',
    profession: 'developer',
    followUpAnswer: 'api_keys',
    subjects: [
      SECRETS,
      PRIVATE_KEYS,
      {
        name: 'Unrecognized Secrets',
        description: 'High-entropy strings that look like tokens',
        rules: [R.highEntropyToken],
      },
    ],
  },

  // ── Legal — Client PII ───────────────────────────────────────────────────────
  {
    name: 'Legal — Client PII',
    description: 'Protects client PII, privileged communications, sealed filings, and deal terms',
    profession: 'legal',
    followUpAnswer: 'client_pii',
    subjects: [
      {
        name: 'Personal Identifiers',
        description: 'SSNs, passports, driver licenses, and dates of birth',
        rules: [R.ssn, R.ssnLabeled, R.passport, R.driversLicense, R.dateOfBirth],
      },
      {
        name: 'Client Financial Data',
        description: 'Card and bank account numbers in case files',
        rules: [R.cardNumber, R.bankAccount, R.iban],
      },
      {
        name: 'Legal Confidentiality',
        description: 'Attorney-client privilege and work product markers',
        rules: [R.privilege],
      },
      {
        name: 'Court-Restricted Materials',
        description: 'Sealed filings, protective orders, and attorneys-eyes-only material',
        rules: [R.courtRestricted, R.caseNumber],
      },
      {
        name: 'Contracts & Deals',
        description: 'Confidential agreements and pasted legal documents',
        rules: [R.contractKeywords, R.legalDocumentScore],
      },
    ],
  },

  // ── Legal — Internal Docs ────────────────────────────────────────────────────
  {
    name: 'Legal — Internal Documents',
    description: 'Protection for internal legal documents, sealed material, and personal identifiers',
    profession: 'legal',
    followUpAnswer: 'internal_docs',
    subjects: [
      {
        name: 'Legal Confidentiality',
        description: 'Standard legal confidentiality markers',
        rules: [R.legalConfidentialityWarn],
      },
      {
        name: 'Court-Restricted Materials',
        description: 'Sealed filings and protective orders',
        rules: [R.courtRestricted],
      },
      {
        name: 'Personal Identifiers',
        description: 'SSNs and passport numbers',
        rules: [R.ssn, R.passport],
      },
      {
        name: 'Contracts & Deals',
        description: 'Confidential agreements and pasted legal documents',
        rules: [R.contractKeywords, R.legalDocumentScore],
      },
    ],
  },

  // ── Healthcare — Patient Data ────────────────────────────────────────────────
  {
    name: 'Healthcare — Patient Data (PHI)',
    description: 'HIPAA-aligned protection for protected health information: patient identifiers, clinical notes, and insurance IDs',
    profession: 'healthcare',
    followUpAnswer: 'patient_data',
    subjects: [
      {
        name: 'Personal Identifiers',
        description: 'SSNs, dates of birth, and patient names',
        rules: [R.ssn, R.ssnLabeled, R.dateOfBirth, R.patientName],
      },
      {
        name: 'Medical & Insurance Identifiers',
        description: 'MRNs, Medicare MBIs, health plan IDs, prescription and claim numbers',
        rules: [R.medicalRecordNumber, R.medicareMbi, R.healthPlanId, R.prescriptionNumber, R.claimNumber, R.deaNumber],
      },
      {
        name: 'Clinical Notes',
        description: 'Pasted clinical notes and diagnosis codes',
        rules: [R.clinicalNoteHeaders, R.diagnosisCode],
      },
      {
        name: 'Health Information',
        description: 'PHI keywords and specially protected categories',
        rules: [R.phiIdentifiers, R.phiGeneral, R.sensitiveHealth],
      },
      {
        name: 'Patient Payments',
        description: 'Card numbers used for patient billing',
        rules: [R.cardNumber],
      },
    ],
  },

  // ── Healthcare — Internal Only ───────────────────────────────────────────────
  {
    name: 'Healthcare — Internal Administrative',
    description: 'Protection for healthcare administrative data: billing, insurance, and any stray patient identifiers',
    profession: 'healthcare',
    followUpAnswer: 'internal_only',
    subjects: [
      {
        name: 'Patient Identifiers',
        description: 'SSNs, MRNs, and Medicare MBIs that should never appear in admin work',
        rules: [R.ssn, R.medicalRecordNumber, R.medicareMbi],
      },
      {
        name: 'Billing & Insurance',
        description: 'Claims, member IDs, and payment cards',
        rules: [R.healthPlanId, R.claimNumber, R.cardNumber, R.healthBilling],
      },
      {
        name: 'Health Keywords',
        description: 'Common health information markers',
        rules: [
          keywords('warn', ['patient', 'medical record', 'diagnosis', 'PHI'],
            'This may contain health information. Review before sharing.'),
          R.sensitiveHealth,
        ],
      },
    ],
  },
]
