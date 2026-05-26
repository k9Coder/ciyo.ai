import type {
  Subject, Rule, Division, Team, Member,
  DestinationGroup, SiteConfig, PolicyInfo, PolicyHistoryEntry, TenantInfo,
  AnalyticsSummary, AnalyticsDailyEntry, AnalyticsIncident,
  AnalyticsTopSiteEntry, AnalyticsBySubjectEntry,
  AuditLogPage,
} from './types'

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.['VITE_API_BASE'])
  ? (import.meta.env['VITE_API_BASE'] as string)
  : 'http://localhost:3000'

const TOKEN_KEY = 'ps_admin_token'

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export function setToken(token: string): void { localStorage.setItem(TOKEN_KEY, token) }
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY) }

let _tokenGetter: (() => Promise<string | null>) | null = null
export function setTokenGetter(fn: (() => Promise<string | null>) | null): void { _tokenGetter = fn }

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = _tokenGetter ? await _tokenGetter() : getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new AdminApiError(res.status, json.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  subjects: {
    list: () => request<Subject[]>('GET', '/v1/subjects'),
    create: (data: { name: string; description?: string; divisionId?: string; teamId?: string }) =>
      request<Subject>('POST', '/v1/subjects', data),
    update: (id: string, data: Partial<{ name: string; description: string; active: boolean; divisionId: string; teamId: string }>) =>
      request<Subject>('PATCH', `/v1/subjects/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/subjects/${id}`),
  },
  rules: {
    list: (subjectId: string) => request<Rule[]>('GET', `/v1/subjects/${subjectId}/rules`),
    create: (subjectId: string, data: {
      kind: Rule['kind']; action: Rule['action']
      keywords?: string[]; pattern?: string; message?: string
      destinationGroupIds?: string[]; reportLevel?: Rule['reportLevel']
    }) => request<Rule>('POST', `/v1/subjects/${subjectId}/rules`, data),
    update: (id: string, data: Partial<{
      kind: Rule['kind']; action: Rule['action']
      keywords: string[]; pattern: string; message: string
      destinationGroupIds: string[]; active: boolean; reportLevel: Rule['reportLevel']
    }>) => request<Rule>('PATCH', `/v1/rules/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/rules/${id}`),
  },
  divisions: {
    list: () => request<Division[]>('GET', '/v1/divisions'),
    create: (name: string) => request<Division>('POST', '/v1/divisions', { name, slug: toSlug(name) }),
    update: (id: string, name: string) => request<Division>('PATCH', `/v1/divisions/${id}`, { name, slug: toSlug(name) }),
    remove: (id: string) => request<void>('DELETE', `/v1/divisions/${id}`),
  },
  teams: {
    list: (divisionId: string) => request<Team[]>('GET', `/v1/divisions/${divisionId}/teams`),
    create: (divisionId: string, name: string) =>
      request<Team>('POST', `/v1/divisions/${divisionId}/teams`, { name, slug: toSlug(name) }),
    update: (id: string, name: string) => request<Team>('PATCH', `/v1/teams/${id}`, { name, slug: toSlug(name) }),
    remove: (id: string) => request<void>('DELETE', `/v1/teams/${id}`),
    members: (teamId: string) => request<Member[]>('GET', `/v1/teams/${teamId}/members`),
  },
  members: {
    list: () => request<Member[]>('GET', '/v1/members'),
    create: (data: { email: string; displayName?: string; role?: Member['role'] }) =>
      request<Member>('POST', '/v1/members', data),
    update: (id: string, data: Partial<{ displayName: string; role: Member['role'] }>) =>
      request<Member>('PATCH', `/v1/members/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/members/${id}`),
    assignTeam: (memberId: string, teamId: string) =>
      request<void>('POST', `/v1/members/${memberId}/teams`, { teamId }),
    removeTeam: (memberId: string, teamId: string) =>
      request<void>('DELETE', `/v1/members/${memberId}/teams/${teamId}`),
  },
  destinationGroups: {
    list: () => request<DestinationGroup[]>('GET', '/v1/destination-groups'),
    create: (data: { name: string; domains: string[]; divisionId?: string; teamId?: string }) =>
      request<DestinationGroup>('POST', '/v1/destination-groups', data),
    update: (id: string, data: Partial<{ name: string; domains: string[] }>) =>
      request<DestinationGroup>('PATCH', `/v1/destination-groups/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/destination-groups/${id}`),
  },
  siteConfigs: {
    list: () => request<SiteConfig[]>('GET', '/v1/site-configs'),
    create: (data: { domain: string; inputSelector: string; sendButtonSelector: string }) =>
      request<SiteConfig>('POST', '/v1/site-configs', data),
    update: (domain: string, data: Partial<{ inputSelector: string; sendButtonSelector: string }>) =>
      request<SiteConfig>('PATCH', `/v1/site-configs/${domain}`, data),
    remove: (domain: string) => request<void>('DELETE', `/v1/site-configs/${domain}`),
  },
  policy: {
    get: () => request<PolicyInfo>('GET', '/v1/policy'),
    publish: () => request<{ version: number }>('POST', '/v1/policy/publish', {}),
    history: () => request<PolicyHistoryEntry[]>('GET', '/v1/policy/history'),
    rollback: (version: number) => request<{ version: number }>('POST', `/v1/policy/rollback/${version}`),
  },
  tenant: {
    get:              ()             => request<TenantInfo>('GET', '/v1/tenant'),
    update:           (name: string) => request<TenantInfo>('PATCH', '/v1/tenant', { name }),
    rotateOrgToken:   ()             => request<{ token: string }>('POST', '/v1/tenant/rotate-org-token'),
    rotateAdminToken: ()             => request<{ token: string }>('POST', '/v1/tenant/rotate-admin-token'),
  },
  auditLog: {
    list: (opts?: { limit?: number; before?: string; action?: 'warn' | 'block' }) => {
      const params = new URLSearchParams()
      if (opts?.limit)  params.set('limit',  String(opts.limit))
      if (opts?.before) params.set('before', opts.before)
      if (opts?.action) params.set('action', opts.action)
      const qs = params.toString()
      return request<AuditLogPage>('GET', `/v1/audit-log${qs ? `?${qs}` : ''}`)
    },
  },
  analytics: {
    summary:   (days: 7 | 30 | 90) =>
      request<AnalyticsSummary>('GET', `/v1/analytics/summary?days=${days}`),
    daily: () =>
      request<AnalyticsDailyEntry[]>('GET', '/v1/analytics/daily'),
    incidents: () =>
      request<AnalyticsIncident[]>('GET', '/v1/analytics/incidents'),
    topSites: (days: 7 | 30 | 90) =>
      request<AnalyticsTopSiteEntry[]>('GET', `/v1/analytics/top-sites?days=${days}`),
    bySubject: (days: 7 | 30 | 90) =>
      request<AnalyticsBySubjectEntry[]>('GET', `/v1/analytics/by-subject?days=${days}`),
  },
}
