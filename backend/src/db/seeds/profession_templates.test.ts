import { describe, it, expect } from 'vitest'
import { professionTemplates, templateRules, type TemplateSeedRule } from './profession_templates.js'

// Mirrors packages/detect: pattern rules run with flags "gi" (policy/bridge.ts),
// keyword rules run as \bterm\b case-insensitive (layer3-dictionary/exact.ts).
const matchesPattern = (rule: TemplateSeedRule, text: string) => new RegExp(rule.pattern!, 'gi').test(text)
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const matchesKeyword = (rule: TemplateSeedRule, text: string) =>
  rule.keywords!.some(k => new RegExp(`\\b${escape(k)}\\b`, 'gi').test(text))

const allRules = professionTemplates.flatMap(t => t.subjects.flatMap(s => s.rules))

describe('profession templates — structure', () => {
  it('only uses professions and answers the wizard offers', () => {
    const offered: Record<string, string[]> = {
      accountant: ['client_financial_data', 'internal_only'],
      developer:  ['source_code', 'api_keys'],
      legal:      ['client_pii', 'internal_docs'],
      healthcare: ['patient_data', 'internal_only'],
    }
    for (const t of professionTemplates) {
      expect(offered[t.profession], t.name).toContain(t.followUpAnswer)
    }
    const pairs = professionTemplates.map(t => `${t.profession}/${t.followUpAnswer}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('every subject has rules and every rule a message', () => {
    for (const t of professionTemplates) {
      for (const s of t.subjects) {
        expect(s.rules.length, `${t.name} › ${s.name}`).toBeGreaterThan(0)
        for (const r of s.rules) expect(r.message, `${t.name} › ${s.name}`).toBeTruthy()
      }
    }
  })

  it('every pattern compiles with the engine flags', () => {
    for (const r of allRules.filter(r => r.kind === 'pattern')) {
      expect(() => new RegExp(r.pattern!, 'gi'), r.pattern).not.toThrow()
    }
  })

  it('every keyword starts and ends with a word character (engine wraps it in \\b)', () => {
    for (const r of allRules.filter(r => r.kind === 'keyword')) {
      for (const k of r.keywords!) expect(k, k).toMatch(/^\w.*\w$|^\w$/)
    }
  })

  it('no pattern backtracks catastrophically on hostile input', () => {
    const hostile = [
      'a'.repeat(20_000),
      '1'.repeat(20_000),
      '1 '.repeat(10_000),
      'account number: ' + '1-'.repeat(10_000),
      'MRN: ' + 'A-'.repeat(10_000),
      'eyJ' + 'a'.repeat(10_000) + '.eyJ' + 'a'.repeat(10_000),
      'x://' + 'a'.repeat(10_000) + ':' + 'b'.repeat(10_000),
    ]
    for (const r of allRules.filter(r => r.kind === 'pattern')) {
      const start = performance.now()
      for (const text of hostile) new RegExp(r.pattern!, 'gi').test(text)
      expect(performance.now() - start, r.pattern).toBeLessThan(250)
    }
  })
})

const R = templateRules

describe('profession templates — detection samples', () => {
  const cases: [keyof typeof templateRules, string[], string[]][] = [
    ['cardNumber',
      ['4111 1111 1111 1111', '5500-0000-0000-0004', '378282246310005', '2223000048400011'],
      ['order 1234 5678', 'call 555-123-4567']],
    ['cardCvv', ['CVV: 123', 'cvc2 4321'], ['cvv is a code', 'security code reviews']],
    ['cardExpiry', ['exp 04/27', 'Expiration date: 12/2028'], ['expected 4/5 people']],
    ['routingNumber', ['Routing number: 021000021', 'ABA 026009593'], ['routing table 10 entries']],
    ['bankAccount', ['Account number: 000123456789', 'acct #: 1234 5678 90'], ['the account 2023-2024 budget', 'accounts payable']],
    ['iban', ['GB82 WEST 1234 5698 7654 32', 'DE89370400440532013000', 'IL620108000000099999999'], ['GB is a country', 'version 2.0']],
    ['swiftCode', ['SWIFT code: BOFAUS3N', 'BIC: DEUTDEFF500'], ['swift programming is fun']],
    ['ssn', ['123-45-6789'], ['000-12-3456', '666-12-3456', '123-00-6789', '2024-01-15']],
    ['ssnLabeled', ['SSN: 123456789', 'social security number 123 45 6789'], ['SSN field is required']],
    ['itin', ['912-70-1234'], ['912-40-1234']],
    ['dateOfBirth', ['DOB: 03/14/1985', 'Date of birth 1985-03-14', 'D.O.B. March 14, 1985'], ['date of birth field is required']],
    ['passport', ['Passport No: X12345678', 'passport #: 123456789'], ['passport photos are required']],
    ['driversLicense', ["Driver's license: D1234567", 'DL #: A123-4567-8901'], ['driver license renewal process']],
    ['materialNonPublic', ['This is MNPI, do not share', 'material non-public results'], ['public earnings call']],
    ['cryptoWallet', ['0x52908400098527886E0F7030069857D2E4169EE7', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'], ['0x1234']],
    ['medicalRecordNumber', ['MRN: 00123456', 'Patient ID: A123456', 'chart #: 4455667'], ['medical record keeping policy', 'patient identity verification']],
    ['medicareMbi', ['1EG4-TE5-MK73', '1EG4TE5MK73'], ['1234-567-8901']],
    ['healthPlanId', ['Member ID: XYZ123456789', 'Policy number: 88-12345'], ['member id format docs']],
    ['prescriptionNumber', ['Rx #: 6012345', 'prescription number 1234567'], ['prescription drug coverage']],
    ['patientName', ['Patient name: John Smith'], ['patient names should be redacted']],
    ['clinicalNoteHeaders', ['Chief Complaint: chest pain', 'HPI: 54yo M with...', 'Assessment & Plan:'], ['our chief complaint is latency']],
    ['diagnosisCode', ['ICD-10: E11.9', 'Dx: J45.909'], ['diagnosis of the outage']],
    ['claimNumber', ['Claim #: CLM-2024-00123'], ['claim number format']],
    ['caseNumber', ['Case No: 2:21-cv-01234', 'Matter #: 2024-0042', '1:22-cr-00123'], ['in case number one fails']],
    ['secretAssignment', ['DB_PASSWORD=hunter2hunter2', 'STRIPE_SECRET_KEY="sk_test_abc12345"'], ['PASSWORD_MIN_LENGTH', 'TOKEN = 3']],
    ['passwordAssignment', ['password: "S3cure!Pass"'], ['password: required']],
    ['openAiKey', ['sk-proj-abcdefghijklmnopqrstuvwxyz123', 'sk-ant-api03-abcdefghijklmnopqrstuv', 'sk-' + 'a1'.repeat(20)], ['sk-learn-model-selection-tools']],
    ['awsAccessKey', ['AKIAIOSFODNN7EXAMPLE'], ['AKIA is a prefix']],
    ['awsSecretKey', ['aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'], ['aws secret access key rotation']],
    ['githubToken', ['ghp_' + 'a'.repeat(36), 'github_pat_' + 'A1'.repeat(31)], ['ghp_short']],
    ['gitlabToken', ['glpat-abcdefghij1234567890'], ['glpat-short']],
    ['slackToken', ['xoxb-1234567890-abcdefghij'], ['xoxo hugs']],
    ['webhookUrl', ['https://hooks.slack.com/services/T000/B000/XXXXXXXX', 'https://discord.com/api/webhooks/123/abc_DEF'], ['https://slack.com/help']],
    ['googleApiKey', ['AIza' + 'B'.repeat(35)], ['AIza short']],
    ['stripeKey', ['sk_live_' + 'a'.repeat(24), 'rk_live_' + 'b'.repeat(24)], ['sk_test_' + 'a'.repeat(24)]],
    ['saasTokens', ['hf_' + 'a'.repeat(34), 'npm_' + 'b'.repeat(36), 'SK' + 'f'.repeat(32)], ['hf_short']],
    ['jwt', ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'], ['eyJ.eyJ.x']],
    ['databaseUrl', ['postgres://admin:s3cretpw@db.internal:5432/app', 'https://user:password1@example.com'], ['https://example.com/path', 'postgres://localhost/app']],
    ['privateKey', ['-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN ENCRYPTED PRIVATE KEY-----', '-----BEGIN PGP PRIVATE KEY BLOCK-----'], ['-----BEGIN PUBLIC KEY-----']],
    ['internalIp', ['10.0.12.4', '192.168.1.1', '172.20.0.5'], ['172.32.0.1', '8.8.8.8']],
    ['internalHostname', ['db01.prod.internal', 'jira.corp'], ['example.com']],
  ]

  for (const [name, positives, negatives] of cases) {
    it(name, () => {
      const rule = R[name]
      const test = rule.kind === 'keyword' ? matchesKeyword : matchesPattern
      for (const text of positives) expect(test(rule, text), `should match: ${text}`).toBe(true)
      for (const text of negatives) expect(test(rule, text), `should NOT match: ${text}`).toBe(false)
    })
  }
})
