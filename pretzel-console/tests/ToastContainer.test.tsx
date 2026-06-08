import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to test ToastContainer in isolation. Import the module under test
// AFTER setting up any mocks.

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders nothing when there are no toasts', async () => {
    const { ToastContainer } = await import('../src/components/ui/ToastContainer')
    const { container } = render(<ToastContainer />)
    // No toast messages should be visible
    expect(screen.queryByText(/.+/)).toBeFalsy()
    // The live regions are always mounted (empty)
    const alerts = container.querySelectorAll('[role="alert"]')
    const statuses = container.querySelectorAll('[role="status"]')
    expect(alerts.length + statuses.length).toBeGreaterThan(0)
  })

  it('success toasts render in a role=status aria-live=polite region', async () => {
    const { useToast } = await import('../src/hooks/useToast')
    const { ToastContainer } = await import('../src/components/ui/ToastContainer')

    // Mount the container first so the listener is registered
    const { rerender } = render(<ToastContainer />)

    // Trigger a success toast
    let toast!: (msg: string, variant?: 'success' | 'error') => void
    function Emitter() {
      const { toast: t } = useToast()
      toast = t
      return null
    }
    render(<Emitter />)

    act(() => {
      toast('Operation succeeded', 'success')
    })

    rerender(<ToastContainer />)

    // The success message should appear inside a role=status region
    const msg = screen.getByText('Operation succeeded')
    expect(msg).toBeInTheDocument()
    const region = msg.closest('[role="status"]')
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('error toasts render in a role=alert aria-live=assertive region', async () => {
    vi.resetModules()
    const { useToast } = await import('../src/hooks/useToast')
    const { ToastContainer } = await import('../src/components/ui/ToastContainer')

    const { rerender } = render(<ToastContainer />)

    let toast!: (msg: string, variant?: 'success' | 'error') => void
    function Emitter() {
      const { toast: t } = useToast()
      toast = t
      return null
    }
    render(<Emitter />)

    act(() => {
      toast('Something went wrong', 'error')
    })

    rerender(<ToastContainer />)

    const msg = screen.getByText('Something went wrong')
    expect(msg).toBeInTheDocument()
    const region = msg.closest('[role="alert"]')
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('aria-live', 'assertive')
  })

  it('live region containers are always present in DOM (so AT registers them)', async () => {
    vi.resetModules()
    const { ToastContainer } = await import('../src/components/ui/ToastContainer')
    const { container } = render(<ToastContainer />)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
})
