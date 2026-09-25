import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSignOut = vi.fn()
const mockUser = { firstName: 'Alice', fullName: 'Alice Smith' }

vi.mock('@clerk/react', () => ({
  useClerk: () => ({ signOut: mockSignOut }),
  useUser: () => ({ user: mockUser }),
}))

import { UnauthorizedPage } from '../src/pages/UnauthorizedPage'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UnauthorizedPage', () => {
  it('renders welcoming member message instead of access denied', () => {
    render(<UnauthorizedPage />)
    expect(screen.getByText(/You're all set, Alice!/i)).toBeInTheDocument()
    expect(screen.getByText(/Organization Member/i)).toBeInTheDocument()
    expect(screen.getByText(/Protection runs automatically in your Pretzel browser extension/i)).toBeInTheDocument()
    expect(screen.getByText(/Close tab & return to browser/i)).toBeInTheDocument()
  })

  it('provides a secondary option to sign in with a different account', () => {
    render(<UnauthorizedPage />)
    const switchBtn = screen.getByText(/Sign in with a different account/i)
    fireEvent.click(switchBtn)
    expect(mockSignOut).toHaveBeenCalledWith({ redirectUrl: '/login' })
  })

  it('attempts to close tab when primary button is clicked', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<UnauthorizedPage />)
    const closeBtn = screen.getByText(/Close tab & return to browser/i)
    fireEvent.click(closeBtn)
    expect(closeSpy).toHaveBeenCalled()
    closeSpy.mockRestore()
  })
})
