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

  it('highlights selected item with blue text', () => {
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: 'div-1',
      onSelect: vi.fn(),
    }]
    render(<MillerColumns columns={c} />)
    const textEl = screen.getByText('Legal')
    expect(textEl.className).toMatch(/text-blue/)
  })
})
