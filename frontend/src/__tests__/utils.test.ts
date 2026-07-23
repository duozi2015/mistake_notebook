import { describe, it, expect } from 'vitest'
import { formatDate, getQualityLabel, getQualityColor, truncateText } from '../utils/format'

describe('formatDate', () => {
  it('should format ISO date string to locale date', () => {
    const result = formatDate('2026-07-22T12:00:00')
    // This depends on locale, just check it returns a string
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle empty string', () => {
    const result = formatDate('')
    // Should handle gracefully
    expect(typeof result).toBe('string')
  })
})

describe('getQualityLabel', () => {
  it('should return correct label for each quality', () => {
    expect(getQualityLabel(0)).toBe('Again')
    expect(getQualityLabel(1)).toBe('Hard')
    expect(getQualityLabel(2)).toBe('Medium')
    expect(getQualityLabel(3)).toBe('Good')
    expect(getQualityLabel(4)).toBe('Very')
    expect(getQualityLabel(5)).toBe('Easy')
  })

  it('should handle out of range', () => {
    expect(getQualityLabel(-1)).toBe('Unknown')
    expect(getQualityLabel(6)).toBe('Unknown')
  })
})

describe('getQualityColor', () => {
  it('should return correct color for each quality', () => {
    expect(getQualityColor(0)).toBe('text-red-500')
    expect(getQualityColor(1)).toBe('text-orange-500')
    expect(getQualityColor(2)).toBe('text-amber-500')
    expect(getQualityColor(3)).toBe('text-lime-500')
    expect(getQualityColor(4)).toBe('text-green-500')
    expect(getQualityColor(5)).toBe('text-teal-500')
  })

  it('should handle out of range', () => {
    expect(getQualityColor(6)).toBe('text-gray-500')
  })
})

describe('truncateText', () => {
  it('should truncate text longer than max length', () => {
    const text = 'This is a very long text that should be truncated'
    const result = truncateText(text, 20)
    expect(result.length).toBeLessThanOrEqual(23) // 20 + '...'
    expect(result.endsWith('...')).toBe(true)
  })

  it('should not truncate short text', () => {
    const text = 'Short'
    const result = truncateText(text, 20)
    expect(result).toBe('Short')
  })

  it('should handle empty string', () => {
    expect(truncateText('', 10)).toBe('')
  })
})
