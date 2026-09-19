/**
 * Pure logic for what the tray icon/tooltip should show, given the same
 * status shape already pushed to the tray-ui window (see ipc-handlers.ts's
 * pushStatusUpdate). Kept separate from main.ts so it's unit-testable
 * without an Electron runtime.
 */
import type { TrayIconState } from './tray-icon'

export interface TrayStatus {
  proxyRunning: boolean
  policyAvailable: boolean
  systemProxyActive?: boolean
  /** Why no policy is loaded, when the cause is a failed sync rather than "not signed in". */
  syncIssue?: 'unreachable' | 'invalid' | null
}

/** Which icon/dot color the tray should show for a given status. */
export function deriveTrayState(status: TrayStatus): TrayIconState {
  if (!status.proxyRunning || !status.systemProxyActive) return 'inactive'
  if (!status.policyAvailable) return 'warn'
  return 'active'
}

/** Multi-line native tooltip text — richer than the old static 2-state string. */
export function formatTrayTooltip(status: TrayStatus): string {
  const lines = ['Pretzel Desktop']
  lines.push(status.systemProxyActive ? 'System proxy: active' : 'System proxy: inactive')
  if (status.policyAvailable) lines.push('Policy: active')
  else if (status.syncIssue === 'unreachable') lines.push("Policy: can't reach server — retrying")
  else if (status.syncIssue === 'invalid') lines.push('Policy: server sent an unreadable policy')
  else lines.push('Policy: not loaded — sign in')
  return lines.join('\n')
}
