// `toLocaleDateString()`/`toLocaleString()` with no explicit locale format
// using the viewer's OS/browser locale — e.g. `3.8.2026` under most
// European/Israeli locales, easily misread as month.day.year. Audit and
// membership timestamps need to be unambiguous regardless of viewer locale,
// so pin a fixed locale + explicit format here instead.

export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
