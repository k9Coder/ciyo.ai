import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/layout/RequireAuth'
import { TenantBootstrap } from './components/layout/TenantBootstrap'
import { LoginPage } from './pages/LoginPage'
import { OnboardingProfilePage } from './pages/OnboardingProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { OrgPage } from './pages/OrgPage'
import { DestinationsPage } from './pages/DestinationsPage'
import { SitesPage } from './pages/SitesPage'
import { PublishPage } from './pages/PublishPage'
import { SettingsPage } from './pages/SettingsPage'
import { MembersPage } from './pages/MembersPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { AssistantPage } from './pages/AssistantPage'
import { InvitePage } from './pages/InvitePage'
import { DesktopLoginPage } from './pages/DesktopLoginPage'
import { AccessibilityPage } from './pages/AccessibilityPage'
import { PlanGate } from './components/billing/PlanGate'
import { Sentry } from './lib/sentry'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, refetchOnMount: false } },
})

export function App() {
  return (
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 40, color: 'var(--text-muted)' }}>Something went wrong. The error has been reported.</p>}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login"          element={<LoginPage />} />
          <Route path="/onboarding/profile" element={<OnboardingProfilePage />} />
          <Route path="/invite/:token"  element={<InvitePage />} />
          <Route path="/desktop-login" element={<DesktopLoginPage />} />
          <Route path="/accessibility"  element={<AccessibilityPage />} />
          <Route
            element={
              <RequireAuth>
                <TenantBootstrap>
                  <AppLayout />
                </TenantBootstrap>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"    element={<DashboardPage />} />
            <Route path="/subjects"     element={<SubjectsPage />} />
            <Route path="/org"          element={<OrgPage />} />
            <Route path="/destinations" element={<DestinationsPage />} />
            <Route path="/sites"        element={<SitesPage />} />
            <Route path="/publish"      element={<PublishPage />} />
            <Route path="/settings"     element={<SettingsPage />} />
            <Route path="/members"      element={<MembersPage />} />
            <Route path="/audit"        element={<AuditLogPage />} />
            <Route path="/assistant"    element={<PlanGate feature="assistantEnabled"><AssistantPage /></PlanGate>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </Sentry.ErrorBoundary>
  )
}
