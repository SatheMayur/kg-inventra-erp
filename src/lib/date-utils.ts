/**
 * Date and Timezone Utilities for Asia/Kolkata timezone (UTC +5:30)
 */

/**
 * Returns a YYYY-MM-DD string formatted in the Asia/Kolkata timezone.
 */
export function getKolkataDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
}

/**
 * Returns the start and end Date bounds for a specific YYYY-MM-DD string,
 * aligned with the Asia/Kolkata timezone offset.
 */
export function getKolkataDateBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  const end = new Date(`${dateStr}T23:59:59.999+05:30`);
  return { start, end };
}

/**
 * Returns a Date representing the end of the day N days from now in the Asia/Kolkata timezone.
 */
export function getKolkataDaysAhead(days: number): Date {
  const kolkataStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(kolkataStr);
  localDate.setDate(localDate.getDate() + days);
  localDate.setHours(23, 59, 59, 999);
  
  // Convert local date time back to the corresponding UTC date
  const isoStr = localDate.getFullYear() + '-' + 
    String(localDate.getMonth() + 1).padStart(2, '0') + '-' + 
    String(localDate.getDate()).padStart(2, '0') + 'T' + 
    String(localDate.getHours()).padStart(2, '0') + ':' + 
    String(localDate.getMinutes()).padStart(2, '0') + ':' + 
    String(localDate.getSeconds()).padStart(2, '0') + '.' + 
    String(localDate.getMilliseconds()).padStart(3, '0') + '+05:30';
  return new Date(isoStr);
}

/**
 * Returns month bounds aligned with the Asia/Kolkata calendar months.
 */
export function getKolkataMonthBounds(now: Date = new Date()): {
  thisMonthStart: Date;
  lastMonthStart: Date;
  lastMonthEnd: Date;
} {
  const kolkataStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(kolkataStr);
  const year = localDate.getFullYear();
  const month = localDate.getMonth(); // 0-indexed

  const pad = (n: number) => String(n).padStart(2, '0');
  
  const thisMonthStartStr = `${year}-${pad(month + 1)}-01`;
  
  let lastMonthYear = year;
  let lastMonth = month - 1;
  if (lastMonth < 0) {
    lastMonth = 11;
    lastMonthYear -= 1;
  }
  const lastMonthStartStr = `${lastMonthYear}-${pad(lastMonth + 1)}-01`;
  
  const lastDayOfLastMonth = new Date(year, month, 0).getDate();
  const lastMonthEndStr = `${lastMonthYear}-${pad(lastMonth + 1)}-${pad(lastDayOfLastMonth)}`;

  return {
    thisMonthStart: new Date(`${thisMonthStartStr}T00:00:00.000+05:30`),
    lastMonthStart: new Date(`${lastMonthStartStr}T00:00:00.000+05:30`),
    lastMonthEnd: new Date(`${lastMonthEndStr}T23:59:59.999+05:30`),
  };
}
