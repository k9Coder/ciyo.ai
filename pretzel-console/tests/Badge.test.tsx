import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../src/components/ui/Badge'

describe('Badge', () => {
  it('renders a judge_prompt variant without throwing', () => {
    render(<Badge variant="judge_prompt">judge_prompt</Badge>)
    expect(screen.getByText('judge_prompt')).toBeInTheDocument()
  })
})
