// Central date helpers.
//
// The business operates in IST (Asia/Kolkata). "Today" and every date-only
// boundary MUST be computed in that timezone so the FIFO picker (outward.js),
// the nightly expiry job (jobs/nightly.js), and challan numbering all agree —
// regardless of the server's clock/timezone.
//
// Do NOT use `new Date().toISOString().split('T')[0]` for a business date:
// that yields the UTC date, which is a day behind IST for the first 5.5 hours
// of every IST day. And pg returns a DATE column as a JS Date at LOCAL
// midnight, so `toISOString()` on it shifts to the previous day on any
// positive-offset host (IST is +5:30). Both bugs are avoided by formatting in
// the business timezone via the 'sv-SE' locale (which renders ISO-style
// YYYY-MM-DD).
const BUSINESS_TZ = 'Asia/Kolkata';

// Current business date as 'YYYY-MM-DD' in IST.
function businessToday(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: BUSINESS_TZ });
}

// Format a Date (or a value pg returns for a DATE/timestamp column) as
// 'YYYY-MM-DD' in IST. Returns null for empty/invalid input.
function toBusinessDateStr(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: BUSINESS_TZ });
}

module.exports = { BUSINESS_TZ, businessToday, toBusinessDateStr };
