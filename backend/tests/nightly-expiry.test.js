// config/db (required transitively by nightly.js) throws unless DATABASE_URL is
// set. knex initialises lazily — no real connection is made until a query runs,
// and these tests only exercise pure date helpers — so a dummy URL is safe.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

const { expiryCutoff, isBatchExpired } = require('../src/jobs/nightly');

// Regression: the nightly "mark expired" job (jobs/nightly.js, Job 1) used to
// compare batches.expiry_date (a DATE) against `new Date()` (a full timestamp).
// Because the cron fires at 02:00, a batch expiring TODAY ('YYYY-MM-DD 00:00')
// was < 'YYYY-MM-DD 02:00' and got its qty_remaining zeroed out — destroying
// stock the FIFO dispatcher (outward.js) still considers sellable that day
// (expiry_date >= today). The boundary must be date-only.

describe('nightly expiry boundary', () => {
  // 02:00 — the actual cron fire time that triggered the original bug.
  const cronRunAt = new Date('2026-06-08T02:00:00.000Z');

  describe('expiryCutoff', () => {
    test('strips the time component to a date string', () => {
      expect(expiryCutoff(cronRunAt)).toBe('2026-06-08');
    });
  });

  describe('isBatchExpired', () => {
    test('batch expiring TODAY is NOT expired (still sellable per FIFO)', () => {
      expect(isBatchExpired('2026-06-08', cronRunAt)).toBe(false);
    });

    test('batch that expired yesterday IS expired', () => {
      expect(isBatchExpired('2026-06-07', cronRunAt)).toBe(true);
    });

    test('batch expiring tomorrow is NOT expired', () => {
      expect(isBatchExpired('2026-06-09', cronRunAt)).toBe(false);
    });

    test('full-timestamp expiry on today is NOT expired', () => {
      expect(isBatchExpired('2026-06-08T00:00:00.000Z', cronRunAt)).toBe(false);
    });

    test('null / missing expiry_date is never expired', () => {
      expect(isBatchExpired(null, cronRunAt)).toBe(false);
      expect(isBatchExpired(undefined, cronRunAt)).toBe(false);
    });

    test('expire boundary is the exact complement of the FIFO sellable boundary', () => {
      // FIFO (outward.js) keeps batches where expiry_date >= cutoff.
      // Job 1 expires batches where expiry_date < cutoff. No overlap, no gap.
      const cutoff = expiryCutoff(cronRunAt);
      for (const d of ['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09']) {
        const sellable = d >= cutoff;
        expect(isBatchExpired(d, cronRunAt)).toBe(!sellable);
      }
    });
  });
});
