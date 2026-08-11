declare global {
  interface DecisionPayload {
    requestId: string
    hostname: string
    findings: Array<{ ruleId: string; ruleName?: string; severity: string; matchedText?: string; snippet?: string }>
  }

  interface StatusPayload {
    proxyRunning: boolean
    policyAvailable: boolean
    systemProxyActive?: boolean
  }

  interface Window {
    pretzel: {
      onDecisionRequired: (cb: (p: DecisionPayload) => void) => void
      decisionReady?: () => void
      respondDecision: (requestId: string, allow: boolean) => void
      onStatusUpdate: (cb: (s: StatusPayload) => void) => void
      onAuthNag: (cb: () => void) => void
      onAuthSuccess: (cb: () => void) => void
      onAuthError: (cb: (msg: string) => void) => void
      signIn: () => void
      cancelSignIn: () => void
      getPolicy: () => Promise<unknown>
      getProxyStatus: () => Promise<{ proxyRunning: boolean; systemProxyActive: boolean }>
      checkForUpdate: () => Promise<{ current: string; latest: string | null; updateAvailable: boolean }>
      openDownloadPage: () => void
      onUpdateAvailable: (cb: (payload: { current: string; latest: string }) => void) => void
      triggerE2eDecision?: () => void
    }
  }
}

export {}
