import { useState, useCallback, useEffect } from 'react'

export interface Toast {
  id: string
  message: string
  variant: 'success' | 'error'
}

let toastListener: ((t: Toast) => void) | null = null

export function useToast() {
  const toast = useCallback((message: string, variant: Toast['variant'] = 'success') => {
    toastListener?.({ id: crypto.randomUUID(), message, variant })
  }, [])
  return { toast }
}

export function useToastStore() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((t: Toast) => {
    setToasts(prev => [...prev, t])
    // The timeout ID is not cleaned up here because ToastContainer is mounted
    // for the entire app lifetime. If that assumption changes, the timeout
    // references should be tracked and cleared on unmount.
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3000)
  }, [])

  // Register / unregister the listener as a proper side effect instead of
  // abusing the useState initializer (anti-pattern: initializers must be pure).
  useEffect(() => {
    toastListener = addToast
    return () => {
      toastListener = null
    }
  }, [addToast])

  return toasts
}
