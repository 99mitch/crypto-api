import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreatePaymentModal from './CreatePaymentModal'

vi.mock('../hooks/useApi', () => ({
  default: { post: vi.fn() },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import api from '../hooks/useApi'

function renderModal(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <CreatePaymentModal onClose={onClose} />
    </MemoryRouter>
  )
}

describe('CreatePaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders amount and description fields', () => {
    renderModal()
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/order ref/i)).toBeInTheDocument()
  })

  it('shows validation error when amount is below 0.01', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0.005' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText(/at least 0.01/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows validation error when amount is zero', async () => {
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText(/at least 0.01/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('omits description from payload when blank', async () => {
    api.post.mockResolvedValue({ data: { payment: { paymentId: 'PAY-abc' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/payments',
      { amount: 10 }
    ))
  })

  it('includes description in payload when provided', async () => {
    api.post.mockResolvedValue({ data: { payment: { paymentId: 'PAY-abc' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText(/order ref/i), { target: { value: 'Order #42' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/payments',
      { amount: 10, description: 'Order #42' }
    ))
  })

  it('navigates to payment detail on success', async () => {
    api.post.mockResolvedValue({ data: { payment: { paymentId: 'PAY-xyz' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/payments/PAY-xyz'))
  })

  it('shows API error message on failure', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Montant minimum: 0.01 USDT' } } })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText('Montant minimum: 0.01 USDT')).toBeInTheDocument()
  })

  it('shows fallback error message when API returns no error body', async () => {
    api.post.mockRejectedValue(new Error('Network Error'))
    renderModal()
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /create payment/i }))
    expect(await screen.findByText('Failed to create payment')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    renderModal(onClose)
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
})
