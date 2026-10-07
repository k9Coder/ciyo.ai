import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RuleForm } from '../src/pages/SubjectsPage'

const blankValue = {
  kind: 'keyword' as const,
  action: 'warn' as const,
  keywords: '',
  pattern: '',
  message: '',
  destinationGroupIds: '',
  reportLevel: 'none' as const,
}

describe('RuleForm', () => {
  it('shows judge_prompt as a visible but disabled kind option', () => {
    render(<RuleForm value={blankValue} onChange={vi.fn()} />)
    const option = screen.getByRole('option', { name: /judge_prompt/i }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
  })

  it('explains why judge_prompt is disabled', () => {
    render(<RuleForm value={blankValue} onChange={vi.fn()} />)
    expect(screen.getByText(/AI Assistant/i)).toBeInTheDocument()
  })
})
