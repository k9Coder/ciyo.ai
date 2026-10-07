import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ActionItem } from '../src/components/assistant/ActionItem'

describe('ActionItem', () => {
  it('renders a non-judge_prompt create_rule action as read-only text (regression check)', () => {
    const action = { op: 'create_rule', subjectId: 's1', kind: 'keyword', keywords: ['secret'], action: 'block' }
    render(<ActionItem action={action} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('["secret"]')).toBeInTheDocument()
  })

  it('renders a create_rule/judge_prompt action\'s prompt as an editable textarea', () => {
    const action = { op: 'create_rule', subjectId: 's1', kind: 'judge_prompt', prompt: 'original claim', action: 'block' }
    render(<ActionItem action={action} />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('original claim')
  })

  it('calls onPromptChange with the edited value when the textarea changes', () => {
    const action = { op: 'create_rule', subjectId: 's1', kind: 'judge_prompt', prompt: 'original claim', action: 'block' }
    const onPromptChange = vi.fn()
    render(<ActionItem action={action} onPromptChange={onPromptChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'edited claim' } })
    expect(onPromptChange).toHaveBeenCalledWith('edited claim')
  })

  it('still renders the other fields of a judge_prompt action as read-only text', () => {
    const action = { op: 'create_rule', subjectId: 's1', kind: 'judge_prompt', prompt: 'original claim', action: 'block' }
    render(<ActionItem action={action} />)
    expect(screen.getByText('s1')).toBeInTheDocument()
    expect(screen.getByText('judge_prompt')).toBeInTheDocument()
  })
})
