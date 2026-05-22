import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/layout/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { DashboardPage } from './pages/DashboardPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { OrgPage } from './pages/OrgPage'
import { DestinationsPage } from './pages/DestinationsPage'
import { SitesPage } from './pages/SitesPage'
import { PublishPage } from './pages/PublishPage'
import { SettingsPage } from './pages/SettingsPage'
import { MembersPage } from './pages/MembersPage'
import { AuditLogPage } from './pages/AuditLogPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, refetchOnMount: false } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/onboarding"   element={<OnboardingPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
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
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
