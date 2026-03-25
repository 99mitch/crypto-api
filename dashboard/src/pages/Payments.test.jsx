import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Payments from './Payments'

vi.mock('../hooks/useApi', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { payments: [], total: 0, totalPages: 1 } }) },
}))

vi.mock('../components/CreatePaymentModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="create-modal">
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

function renderPayments() {
  return render(
    <MemoryRouter>
      <Payments />
    </MemoryRouter>
  )
}

describe('Payments page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a "New Payment" button', () => {
    renderPayments()
    expect(screen.getByRole('button', { name: /new payment/i })).toBeInTheDocument()
  })

  it('opens the modal when "New Payment" is clicked', () => {
    renderPayments()
    expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /new payment/i }))
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
  })

  it('closes the modal when onClose is called', () => {
    renderPayments()
    fireEvent.click(screen.getByRole('button', { name: /new payment/i }))
    expect(screen.getByTestId('create-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument()
  })
})
