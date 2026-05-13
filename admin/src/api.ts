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

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()
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

export interface Matter {
  id: string
  tenantId: string
  clientName: string
  matterName: string | null
  matterNumber: string | null
  opposingParties: string[]
  active: boolean
  createdAt: string
}

export interface CreateMatterInput {
  clientName: string
  matterName?: string
  matterNumber?: string
  opposingParties?: string[]
}

export interface PolicyInfo {
  version: number
  policy: unknown
  tenantName: string
  plan: string
  expiresAt: string | null
  warning?: string
}

export interface HistoryEntry {
  version: number
  publishedAt: string
}

export const api = {
  matters: {
    list: () => request<Matter[]>('GET', '/v1/matters'),
    create: (data: CreateMatterInput) => request<Matter>('POST', '/v1/matters', data),
    update: (id: string, data: Partial<CreateMatterInput & { active: boolean }>) =>
      request<Matter>('PATCH', `/v1/matters/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/matters/${id}`),
  },
  policy: {
    get: () => request<PolicyInfo>('GET', '/v1/policy'),
    publish: () => request<{ version: number }>('POST', '/v1/policy/publish', {}),
    history: () => request<HistoryEntry[]>('GET', '/v1/policy/history'),
    rollback: (version: number) =>
      request<{ version: number }>('POST', `/v1/policy/rollback/${version}`),
  },
}
