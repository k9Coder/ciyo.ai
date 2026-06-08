import { useToastStore } from '../../hooks/useToast'
import type { Toast } from '../../hooks/useToast'

// Two separate live regions so screen readers announce toasts at the right
// urgency level (WCAG 4.1.3 Status Messages):
//   - Success toasts → role="status" aria-live="polite"   (non-interrupting)
//   - Error toasts   → role="alert"  aria-live="assertive" (interrupting)
// Both regions are always mounted so screen readers register the live region
// before any announcements arrive.

function LiveRegion({ variant, toasts }: { variant: Toast['variant']; toasts: Toast[] }) {
  const filtered = toasts.filter(t => t.variant === variant)
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="flex flex-col gap-2"
    >
      {filtered.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
            variant === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore()
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <LiveRegion variant="success" toasts={toasts} />
      <LiveRegion variant="error" toasts={toasts} />
    </div>
  )
}
