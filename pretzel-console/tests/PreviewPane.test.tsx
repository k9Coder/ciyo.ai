import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PreviewPane } from '../src/components/assistant/PreviewPane'

describe('PreviewPane', () => {
  it('calls onApply with an empty promptOverrides map when nothing was edited', () => {
    const actions = [{ op: 'create_subject', name: 'S' }]
    const onApply = vi.fn()
    render(<PreviewPane actions={actions} messageId="m1" onApply={onApply} onDiscard={vi.fn()} isApplying={false} />)
    fireEvent.click(screen.getByText('Apply Changes'))
    expect(onApply).toHaveBeenCalledWith('m1', {})
  })

  it('calls onApply with the edited prompt keyed by action index', () => {
    const actions = [
      { op: 'create_rule', subjectId: 's1', kind: 'judge_prompt', prompt: 'original claim', action: 'block' },
    ]
    const onApply = vi.fn()
    render(<PreviewPane actions={actions} messageId="m1" onApply={onApply} onDiscard={vi.fn()} isApplying={false} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited claim' } })
    fireEvent.click(screen.getByText('Apply Changes'))
    expect(onApply).toHaveBeenCalledWith('m1', { 0: 'edited claim' })
  })
})
