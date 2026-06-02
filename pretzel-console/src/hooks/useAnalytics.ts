import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useAnalyticsSummary(days: 7 | 30 | 90) {
  return useQuery({
    queryKey:       ['analytics', 'summary', days],
    queryFn:        () => api.analytics.summary(days),
    staleTime:      60_000,
    refetchOnMount: false,
  })
}

export function useAnalyticsDaily() {
  return useQuery({
    queryKey:       ['analytics', 'daily'],
    queryFn:        api.analytics.daily,
    staleTime:      60_000,
    refetchOnMount: false,
  })
}

export function useAnalyticsIncidents() {
  return useQuery({
    queryKey:       ['analytics', 'incidents'],
    queryFn:        api.analytics.incidents,
    staleTime:      30_000,
    refetchOnMount: false,
  })
}

export function useAnalyticsTopSites(days: 7 | 30 | 90) {
  return useQuery({
    queryKey:       ['analytics', 'top-sites', days],
    queryFn:        () => api.analytics.topSites(days),
    staleTime:      60_000,
    refetchOnMount: false,
  })
}

export function useAnalyticsBySubject(days: 7 | 30 | 90) {
  return useQuery({
    queryKey:       ['analytics', 'by-subject', days],
    queryFn:        () => api.analytics.bySubject(days),
    staleTime:      60_000,
    refetchOnMount: false,
  })
}
