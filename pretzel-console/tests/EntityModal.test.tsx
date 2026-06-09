import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EntityModal } from '../src/components/ui/EntityModal'

describe('EntityModal', () => {
  it('does not render when open=false', () => {
    render(
      <EntityModal open={false} title="Test" onClose={vi.fn()} onSave={vi.fn()}>
        <input placeholder="name" />
      </EntityModal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with role=dialog and aria-modal when open', () => {
    render(
      <EntityModal open title="Edit subject" onClose={vi.fn()} onSave={vi.fn()}>
        <input placeholder="name" />
      </EntityModal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('has aria-labelledby pointing to the title h2', () => {
    render(
      <EntityModal open title="My Modal" onClose={vi.fn()} onSave={vi.fn()}>
        <input placeholder="name" />
      </EntityModal>
    )
    const dialog = screen.getByRole('dialog')
    const labelledById = dialog.getAttribute('aria-labelledby')
    expect(labelledById).toBeTruthy()
    const titleEl = document.getElementById(labelledById!)
    expect(titleEl).not.toBeNull()
    expect(titleEl!.textContent).toBe('My Modal')
  })

  it('moves focus to the first focusable element on open', async () => {
    render(
      <EntityModal open title="Test" onClose={vi.fn()} onSave={vi.fn()}>
        <input data-testid="first-input" placeholder="name" />
      </EntityModal>
    )
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('first-input'))
    })
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <EntityModal open title="Test" onClose={onClose} onSave={vi.fn()}>
        <input placeholder="name" />
      </EntityModal>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn()
    render(
      <EntityModal open title="Test" onClose={vi.fn()} onSave={onSave}>
        <input placeholder="name" />
      </EntityModal>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('shows Saving… and disables Save button when saving=true', () => {
    render(
      <EntityModal open title="Test" onClose={vi.fn()} onSave={vi.fn()} saving>
        <input placeholder="name" />
      </EntityModal>
    )
    const saveBtn = screen.getByRole('button', { name: 'Saving…' })
    expect(saveBtn).toBeDisabled()
  })

  it('restores focus to the triggering element on close', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open modal'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { rerender } = render(
      <EntityModal open title="Test" onClose={vi.fn()} onSave={vi.fn()}>
        <input placeholder="name" />
      </EntityModal>
    )

    rerender(
      <EntityModal open={false} title="Test" onClose={vi.fn()} onSave={vi.fn()}>
        <input placeholder="name" />
      </EntityModal>
    )

    // After close, focus should return to the element that had it before open
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })

    document.body.removeChild(trigger)
  })
})
