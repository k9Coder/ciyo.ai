import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MillerColumns } from '../src/components/ui/MillerColumns'
import type { MillerColumnDef } from '../src/components/ui/MillerColumns'

const cols: MillerColumnDef[] = [
  {
    title: 'Divisions',
    items: [{ id: 'div-1', label: 'Legal' }, { id: 'div-2', label: 'Corporate' }],
    selectedId: null,
    onSelect: vi.fn(),
  },
  {
    title: 'Teams',
    items: [{ id: 'team-1', label: 'Trial', sublabel: '3 members' }],
    selectedId: null,
    onSelect: vi.fn(),
  },
]

describe('MillerColumns', () => {
  it('renders all column titles', () => {
    render(<MillerColumns columns={cols} />)
    expect(screen.getByText('Divisions')).toBeInTheDocument()
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('renders items in each column', () => {
    render(<MillerColumns columns={cols} />)
    expect(screen.getByText('Legal')).toBeInTheDocument()
    expect(screen.getByText('Trial')).toBeInTheDocument()
  })

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn()
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: null,
      onSelect,
    }]
    render(<MillerColumns columns={c} />)
    fireEvent.click(screen.getByText('Legal'))
    expect(onSelect).toHaveBeenCalledWith('div-1')
  })

  it('highlights selected item with brand color', () => {
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: 'div-1',
      onSelect: vi.fn(),
    }]
    render(<MillerColumns columns={c} />)
    const textEl = screen.getByText('Legal')
    expect(textEl).toHaveStyle({ color: 'var(--brand-primary)' })
  })

  it('renders edit/delete buttons in the DOM for keyboard accessibility', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: null,
      onSelect: vi.fn(),
      onEdit,
      onDelete,
    }]
    render(<MillerColumns columns={c} />)
    // Buttons must be in the DOM (not display:none) so keyboard users can Tab to them
    expect(screen.getByRole('button', { name: 'Edit Legal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Legal' })).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn()
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: null,
      onSelect: vi.fn(),
      onEdit,
    }]
    render(<MillerColumns columns={c} />)
    // Trigger hover/focus to make button visible
    const row = screen.getByText('Legal').closest('div')!.parentElement!
    fireEvent.mouseEnter(row)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Legal' }))
    expect(onEdit).toHaveBeenCalledWith('div-1')
  })

  it('edit/delete buttons become visible on row focus (keyboard navigation)', () => {
    const onEdit = vi.fn()
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: null,
      onSelect: vi.fn(),
      onEdit,
    }]
    render(<MillerColumns columns={c} />)
    const editBtn = screen.getByRole('button', { name: 'Edit Legal' })
    // Simulate keyboard focus arriving on the edit button
    fireEvent.focus(editBtn)
    // After focus, opacity should be 1 (visible)
    expect(editBtn.parentElement).toHaveStyle({ opacity: '1' })
  })
})
