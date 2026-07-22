declare global {
  interface DecisionPayload {
    requestId: string
    hostname: string
    findings: Array<{ ruleId: string; severity: string; snippet?: string }>
  }

  interface StatusPayload {
    proxyRunning: boolean
    policyAvailable: boolean
    systemProxyActive?: boolean
  }

  interface Window {
    pretzel: {
      onDecisionRequired: (cb: (p: DecisionPayload) => void) => void
      respondDecision: (requestId: string, allow: boolean) => void
      onStatusUpdate: (cb: (s: StatusPayload) => void) => void
      onAuthNag: (cb: () => void) => void
      onAuthSuccess: (cb: () => void) => void
      onAuthError: (cb: (msg: string) => void) => void
      signIn: () => void
      getPolicy: () => Promise<unknown>
      getProxyStatus: () => Promise<{ proxyRunning: boolean; systemProxyActive: boolean }>
      updateFailMode: (failMode: 'open' | 'closed') => void
    }
  }
}

export {}
