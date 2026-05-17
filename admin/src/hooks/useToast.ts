import { useState, useCallback } from 'react'

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
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3000)
  }, [])

  useState(() => { toastListener = addToast })

  return toasts
}
