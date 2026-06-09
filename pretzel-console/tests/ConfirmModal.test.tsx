import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmModal } from '../src/components/ui/ConfirmModal'

describe('ConfirmModal', () => {
  it('does not render when open=false', () => {
    render(
      <ConfirmModal open={false} message="Are you sure?" onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with role=dialog and aria-modal when open', () => {
    render(
      <ConfirmModal open message="Are you sure?" onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('has aria-labelledby pointing to "Confirm Delete" h2', () => {
    render(
      <ConfirmModal open message="Are you sure?" onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    const dialog = screen.getByRole('dialog')
    const labelledById = dialog.getAttribute('aria-labelledby')
    expect(labelledById).toBeTruthy()
    const titleEl = document.getElementById(labelledById!)
    expect(titleEl).not.toBeNull()
    expect(titleEl!.textContent).toBe('Confirm Delete')
  })

  it('closes on Escape key press', () => {
    const onClose = vi.fn()
    render(
      <ConfirmModal open message="Are you sure?" onClose={onClose} onConfirm={vi.fn()} />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves focus to Cancel button (first focusable) on open', async () => {
    render(
      <ConfirmModal open message="Are you sure?" onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    })
  })

  it('calls onConfirm when Delete button is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal open message="Are you sure?" onClose={vi.fn()} onConfirm={onConfirm} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('shows Deleting… and disables button when confirming=true', () => {
    render(
      <ConfirmModal open message="Are you sure?" onClose={vi.fn()} onConfirm={vi.fn()} confirming />
    )
    const deleteBtn = screen.getByRole('button', { name: 'Deleting…' })
    expect(deleteBtn).toBeDisabled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <ConfirmModal open message="Are you sure?" onClose={onClose} onConfirm={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
