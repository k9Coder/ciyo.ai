declare global {
  interface DecisionPayload {
    requestId: string
    hostname: string
    findings: Array<{ ruleId: string; ruleName?: string; severity: string; action?: string; matchedText?: string; snippet?: string }>
    /** Epoch ms when the request is resolved automatically if unanswered. */
    deadlineAt: number
    /** What the automatic resolution will be. */
    onTimeout: 'block' | 'allow'
  }

  interface StatusPayload {
    proxyRunning: boolean
    policyAvailable: boolean
    systemProxyActive?: boolean
    syncIssue?: 'unreachable' | 'invalid' | null
  }

  interface AuthStatePayload {
    authenticated: boolean
    reason?: 'expired'
    account?: { email: string; displayName: string | null; tenantName: string }
    expiresInDays?: number
  }

  type NotifyLevel = 'off' | 'badge' | 'native' | 'native-sound'
  interface SettingsPayload {
    hasSeenWalkthrough: boolean
    notifyOnBlock: NotifyLevel
    notifyOnWarn: NotifyLevel
  }

  interface ActivityEntryPayload {
    hostname:  string
    ruleName:  string
    severity:  string
    action:    'warn' | 'block'
    timestamp: number
    requestId?: string
    outcome?:  'blocked' | 'allowed' | 'timeout-blocked' | 'timeout-allowed'
  }

  type AutoUpdateEventPayload =
    | { kind: 'checking' }
    | { kind: 'available'; version: string }
    | { kind: 'not-available' }
    | { kind: 'downloading'; percent: number }
    | { kind: 'downloaded'; version: string }
    | { kind: 'error'; message: string }

  interface Window {
    pretzel: {
      onDecisionRequired: (cb: (p: DecisionPayload) => void) => void
      onDecisionTimeout?: (cb: (p: { requestId: string; allowed: boolean }) => void) => void
      decisionReady?: () => void
      respondDecision: (requestId: string, allow: boolean) => void
      alwaysAllowRule: (ruleId: string) => void
      onStatusUpdate: (cb: (s: StatusPayload) => void) => void
      getAuthState: () => Promise<AuthStatePayload>
      signOut: () => Promise<{ recorded: boolean }>
      onAuthState: (cb: (s: AuthStatePayload) => void) => void
      onAuthNag: (cb: () => void) => void
      onAuthSuccess: (cb: () => void) => void
      onAuthError: (cb: (msg: string) => void) => void
      signIn: () => void
      cancelSignIn: () => void
      getPolicy: () => Promise<unknown>
      getProxyStatus: () => Promise<{ proxyRunning: boolean; systemProxyActive: boolean }>
      hideWindow: () => void
      getSettings: () => Promise<SettingsPayload>
      setSettings: (patch: Partial<SettingsPayload>) => Promise<SettingsPayload>
      getRecentActivity: () => Promise<ActivityEntryPayload[]>
      onActivityUpdate: (cb: (entries: ActivityEntryPayload[]) => void) => void
      checkForUpdate: () => Promise<{
        current: string; latest: string | null; updateAvailable: boolean; autoUpdateSupported: boolean
      }>
      openDownloadPage: () => void
      onUpdateAvailable: (cb: (payload: { current: string; latest: string }) => void) => void
      downloadUpdate: () => void
      installUpdate: () => void
      onAutoUpdateStatus: (cb: (event: AutoUpdateEventPayload) => void) => void
      triggerE2eDecision?: () => void
    }
  }
}

export {}
