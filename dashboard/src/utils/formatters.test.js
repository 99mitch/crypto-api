import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatUSDT, formatRelativeTime, formatDateTime, getDayRange } from './formatters'

describe('formatUSDT', () => {
  it('formats integer amount', () => {
    expect(formatUSDT(100)).toBe('100.00 USDT')
  })
  it('formats decimal amount', () => {
    expect(formatUSDT(12.5)).toBe('12.50 USDT')
  })
  it('formats zero', () => {
    expect(formatUSDT(0)).toBe('0.00 USDT')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows "just now" for < 60s', () => {
    const date = new Date('2024-01-01T11:59:30Z')
    expect(formatRelativeTime(date)).toBe('just now')
  })
  it('shows minutes', () => {
    const date = new Date('2024-01-01T11:55:00Z')
    expect(formatRelativeTime(date)).toBe('5m ago')
  })
  it('shows hours', () => {
    const date = new Date('2024-01-01T10:00:00Z')
    expect(formatRelativeTime(date)).toBe('2h ago')
  })
  it('shows days', () => {
    const date = new Date('2023-12-30T12:00:00Z')
    expect(formatRelativeTime(date)).toBe('2d ago')
  })
})

describe('formatDateTime', () => {
  it('formats ISO date string to readable format', () => {
    const result = formatDateTime('2024-01-15T10:30:00Z')
    expect(result).toMatch(/2024/)
    expect(result).toMatch(/Jan/)
  })
})

describe('getDayRange', () => {
  it('returns start and end of a given date', () => {
    const { from, to } = getDayRange(new Date('2024-01-15T14:30:00Z'))
    expect(from).toBe('2024-01-15T00:00:00.000Z')
    expect(to).toBe('2024-01-15T23:59:59.999Z')
  })
})
