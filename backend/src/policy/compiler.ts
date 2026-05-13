import { listMatters } from '../matters/service.js'

const CONFIDENTIALITY_TERMS = [
  'PRIVILEGED AND CONFIDENTIAL',
  'ATTORNEY-CLIENT PRIVILEGE',
  'ATTORNEY WORK PRODUCT',
  'WORK PRODUCT DOCTRINE',
  'DO NOT DISCLOSE',
  'CONFIDENTIAL — NOT FOR DISTRIBUTION',
  'SUBJECT TO PROTECTIVE ORDER',
]

const SCORE_SIGNALS = [
  { id: 'paste_detected',       description: 'Detected as paste (not typed)',             points: 20,  enabled: true },
  { id: 'long_text',            description: 'Text length > 400 words',                   points: 20,  enabled: true, threshold: 400 },
  { id: 'legal_terms_whereas',  description: 'Contains WHEREAS / HEREBY / IN WITNESS WHEREOF', points: 25, enabled: true },
  { id: 'numbered_paragraphs',  description: 'Numbered paragraphs at line start',         points: 15,  enabled: true },
  { id: 'long_avg_sentence',    description: 'Average sentence length > 25 words',        points: 10,  enabled: true },
  { id: 'formal_heading',       description: 'All-caps formal heading on its own line',   points: 10,  enabled: true },
  { id: 'block_quote',          description: 'Looks like a block quote (reduces score)',  points: -15, enabled: true },
]

export interface PolicyDoc {
  version: 1
  tenantId: string
  baseline: unknown[]
  custom: unknown[]
  perSite: Record<string, unknown>
  allowSendAnywayWithReason: boolean
  auditRetentionDays: number
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const activeMatters = await listMatters(tenantId)

  const rosterTerms: string[] = []
  const fuzzyTerms: Array<{ term: string; maxDistance: number }> = []

  for (const m of activeMatters) {
    const candidates = [
      m.clientName,
      m.matterName,
      m.matterNumber,
      ...(m.opposingParties ?? []),
    ].filter((t): t is string => !!t)

    for (const term of candidates) {
      rosterTerms.push(term)
      if (term.length <= 20) fuzzyTerms.push({ term, maxDistance: 1 })
    }
  }

  const custom: unknown[] = [
    {
      kind: 'dictionary',
      id: 'confidentiality-markers',
      name: 'Confidentiality Markers',
      description: 'Legal privilege headers that indicate confidential content',
      severity: 'high',
      action: 'require_confirmation',
      enabled: true,
      tags: ['legal', 'law-firm'],
      terms: CONFIDENTIALITY_TERMS,
      caseSensitive: false,
    },
    {
      kind: 'score',
      id: 'legal-document-structure',
      name: 'Legal Document Structure',
      description: 'Scores large pastes for signals of a pasted legal document',
      severity: 'high',
      action: 'block',
      enabled: true,
      tags: ['legal', 'law-firm'],
      signals: SCORE_SIGNALS,
      warnThreshold: 50,
      confirmThreshold: 80,
    },
  ]

  if (rosterTerms.length > 0) {
    custom.push({
      kind: 'dictionary',
      id: 'client-roster',
      name: 'Client / Matter Roster',
      description: 'Blocks prompts containing client names, matter numbers, or opposing parties',
      severity: 'critical',
      action: 'block',
      enabled: true,
      tags: ['legal', 'law-firm'],
      terms: rosterTerms,
      fuzzyTerms: fuzzyTerms.length > 0 ? fuzzyTerms : undefined,
      caseSensitive: false,
    })
  }

  return {
    version: 1,
    tenantId,
    baseline: [],
    custom,
    perSite: {},
    allowSendAnywayWithReason: false,
    auditRetentionDays: 365,
  }
}
