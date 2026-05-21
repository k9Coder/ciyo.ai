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
  slug: string
  plan: string
  subscriptionStatus: string
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
