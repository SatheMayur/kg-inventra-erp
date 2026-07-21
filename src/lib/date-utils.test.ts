import { describe, it, expect } from 'vitest'
import {
  getKolkataDateString,
  getKolkataDateBounds,
  getKolkataDaysAhead,
  getKolkataMonthBounds,
} from './date-utils'

describe('date-utils', () => {
  describe('getKolkataDateString', () => {
    it('returns formatted date string YYYY-MM-DD', () => {
      // Test with a specific UTC date that shifts days in IST
      // e.g., 2026-06-20 02:00:00 IST is 2026-06-19 20:30:00 UTC
      const dateInUtc = new Date('2026-06-19T20:30:00Z')
      expect(getKolkataDateString(dateInUtc)).toBe('2026-06-20')
    })
  })

  describe('getKolkataDateBounds', () => {
    it('returns correct start and end date bounds in Asia/Kolkata offset', () => {
      const { start, end } = getKolkataDateBounds('2026-06-20')
      expect(start.toISOString()).toBe('2026-06-19T18:30:00.000Z') // 2026-06-20T00:00:00.000+05:30
      expect(end.toISOString()).toBe('2026-06-20T18:29:59.999Z')   // 2026-06-20T23:59:59.999+05:30
    })
  })

  describe('getKolkataDaysAhead', () => {
    it('returns end of day date N days ahead in Kolkata time', () => {
      const daysAhead = getKolkataDaysAhead(7)
      expect(daysAhead).toBeInstanceOf(Date)
      expect(daysAhead.toISOString().endsWith('18:29:59.999Z')).toBe(true) // End of day in IST is 18:29:59.999 UTC
    })
  })

  describe('getKolkataMonthBounds', () => {
    it('returns month bounds aligned with the Asia/Kolkata calendar months', () => {
      // 2026-06-20T12:00:00+05:30
      const testDate = new Date('2026-06-20T06:30:00Z')
      const { thisMonthStart, lastMonthStart, lastMonthEnd } = getKolkataMonthBounds(testDate)

      expect(thisMonthStart.toISOString()).toBe('2026-05-31T18:30:00.000Z') // 2026-06-01T00:00:00.000+05:30
      expect(lastMonthStart.toISOString()).toBe('2026-04-30T18:30:00.000Z') // 2026-05-01T00:00:00.000+05:30
      expect(lastMonthEnd.toISOString()).toBe('2026-05-31T18:29:59.999Z')   // 2026-05-31T23:59:59.999+05:30
    })
  })
})
