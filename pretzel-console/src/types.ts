// ── Assistant action types ────────────────────────────────────────────────────
// These mirror the Action discriminated union in backend/src/assistant/llm/interface.ts.
// Keep in sync when new action ops are added to the backend.

export type RuleKind    = 'keyword' | 'pattern' | 'entropy' | 'score'
export type RuleAction  = 'warn' | 'block'
export type ReportLevel = 'none' | 'minimal' | 'medium' | 'rich'
export type MemberRole  = 'member' | 'division_admin' | 'super_admin'

export type AssistantAction =
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | { op: 'update_rule';   ruleId: string;   patch: Record<string, unknown> }
  | { op: 'delete_rule';   ruleId: string }
  | { op: 'create_subject'; name: string; description?: string; divisionId?: string; teamId?: string }
  | { op: 'update_subject'; subjectId: string; patch: Record<string, unknown> }
  | { op: 'delete_subject'; subjectId: string }
  | { op: 'create_division'; name: string }
  | { op: 'delete_division'; divisionId: string }
  | { op: 'create_team'; name: string; divisionId: string }
  | { op: 'delete_team'; teamId: string }
  | { op: 'create_member'; email: string; role: MemberRole; displayName?: string; adminDivisionId?: string }
  | { op: 'delete_member'; memberId: string }
  | { op: 'assign_member_team'; memberId: string; teamId: string }
  | { op: 'remove_member_team'; memberId: string; teamId: string }

// ─────────────────────────────────────────────────────────────────────────────

export interface Subject {
  id: string
  tenantId: string
  divisionId: string | null
  teamId: string | null
  name: string
  description: string | null
  active: boolean
  createdAt: string
}

export interface Rule {
  id: string
  tenantId: string
  subjectId: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  destinationGroupIds: string[]
  action: 'warn' | 'block'
  message: string | null
  reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
  active: boolean
  createdAt: string
}

export interface Division {
  id: string
  tenantId: string
  name: string
  slug: string
  createdAt: string
}

export interface Team {
  id: string
  tenantId: string
  divisionId: string
  name: string
  slug: string
  createdAt: string
}

export interface Member {
  id: string
  tenantId: string
  email: string
  displayName: string | null
  firstName: string | null
  lastName: string | null
  role: 'super_admin' | 'division_admin' | 'member'
  clerkId: string | null
  failMode: 'open' | 'closed' | null
  createdAt: string
}

export interface DestinationGroup {
  id: string
  tenantId: string
  divisionId: string | null
  teamId: string | null
  name: string
  domains: string[]
  createdAt: string
}

export interface SiteConfig {
  id: string
  tenantId: string
  domain: string
  inputSelector: string
  sendButtonSelector: string
  createdAt: string
}

export interface PolicyInfo {
  version: number
  policy: unknown
  tenantName: string
  plan: string
  expiresAt: string | null
  warning?: string
}

export interface PolicyHistoryEntry {
  id: string
  version: number
  publishedAt: string
}

export interface TenantInfo {
  id: string
  name: string
  plan: string
  subscriptionStatus: string
  onboardingWizardCompleted: boolean
  failMode: 'open' | 'closed'
}

export interface Membership {
  tenantId: string
  tenantName: string
  role: string
}

export interface OnboardingApplyResult {
  policyId: string | null
  wizardCompleted: boolean
  alreadyExisted?: boolean
}

export interface AnalyticsSummary {
  scansTotal:       number
  blocked:          number
  warned:           number
  activeUsers:      number
  totalMembers:     number
  activeRulesCount: number
}

export interface AnalyticsDailyEntry {
  day:     string
  date:    string
  blocked: number
  warned:  number
  scanned: number
}

export interface AnalyticsIncident {
  id:          string
  memberEmail: string | null
  subjectName: string
  ruleKind:    string
  action:      'warn' | 'block'
  siteUrl:     string
  occurredAt:  string
}

export interface AnalyticsTopSiteEntry {
  domain: string
  count:  number
}

export interface AnalyticsBySubjectEntry {
  subjectName: string
  count:       number
  pct:         number
}

export interface AuditLogEntry {
  id:          string
  memberEmail: string | null
  subjectName: string
  ruleKind:    string
  action:      'warn' | 'block'
  siteUrl:     string
  matchedTerm: string | null
  occurredAt:  string
}

export interface AuditLogPage {
  entries:    AuditLogEntry[]
  nextBefore: string | null
}

export interface ChatSession {
  id:        string
  tenantId:  string
  memberId:  string | null
  title:     string
  createdAt: string
}

export interface ChatMessage {
  id:                 string
  sessionId:          string
  role:               'user' | 'assistant'
  content:            string
  actionsJson:        AssistantAction[] | null
  appliedAt:          string | null
  createdAt:          string
  hasVersionSnapshot: boolean
}

export interface AssistantChatResponse {
  sessionId: string
  messageId: string
  reply:     string
  actions:   AssistantAction[]
}

export interface AssistantApplyResponse {
  applied: AssistantAction[]
  errors:  string[]
}

export type EnforcementReason = 'decision_timeout' | 'bridge_error' | 'adapter_miss'

export interface DegradedHost {
  hostname: string
  reason:   EnforcementReason
  count:    number
}

export interface EnforcementSummary {
  degraded:      DegradedHost[]
  silentFailure: boolean
}

export interface InvitePreview {
  tenantName: string
  role:       string
  expiresAt:  string
  valid:      boolean
}

export interface InviteCreated {
  token:     string
  url:       string
  expiresAt: string
}

export interface BillingStatus {
  plan:               string
  subscriptionStatus: string
  trialEndsAt:        string | null
  seatCount:          number
  seatLimit:          number
  monthlyScans:       number
  scanLimit:          number
  scanBlocked:        boolean
  paymentProvider:    'stripe' | 'paypal' | null
  features: {
    assistantEnabled:  boolean
    advancedAnalytics: boolean
  }
  assistantLimits: {
    promptsPerDay:    number
    promptsUsedToday: number
    maximumTokens:    number
  }
}
