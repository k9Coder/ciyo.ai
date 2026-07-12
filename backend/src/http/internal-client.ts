import axios, { type AxiosInstance } from 'axios'
import { getContext } from '../context/request-context.js'
import { logger } from '../logger/index.js'
import { env } from '../env.js'

function createClient(path: string): AxiosInstance {
  const client = axios.create({ timeout: 5000 })

  client.interceptors.request.use(config => {
    const base   = env.INTERNAL_API_URL ?? 'http://localhost:3000'
    const secret = env.INTERNAL_SECRET
    config.baseURL = `${base}${path}`
    const ctx = getContext()
    config.headers['X-Internal-Secret'] = secret
    config.headers['X-M2M']             = 'true'
    if (ctx) {
      config.headers['X-Trace-ID']     = ctx.traceId
      config.headers['X-Tenant-ID']    = ctx.tenantId ?? ''
      config.headers['X-Initiator-Id'] = ctx.initiatorId ?? 'system'
    }
    return config
  })

  client.interceptors.response.use(
    res => res,
    err => {
      const code    = (err.response?.status as number | undefined) ?? 0
      const message = (err.response?.data as { error?: string } | undefined)?.error ?? (err.message as string)
      logger.error('internal http call failed', { code, message, path })
      throw new Error(`[${code}] ${message}`)
    }
  )

  return client
}

export const rulesClient             = createClient('/internal/v1/rules')
export const subjectsClient          = createClient('/internal/v1/subjects')
export const divisionsClient         = createClient('/internal/v1/divisions')
export const teamsClient             = createClient('/internal/v1/teams')
export const membersClient           = createClient('/internal/v1/members')
export const tenantsClient           = createClient('/internal/v1/tenants')
export const usersClient             = createClient('/internal/v1/users')
export const destinationGroupsClient = createClient('/internal/v1/destination-groups')
