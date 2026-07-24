/** DDMMYY + price, no separators, e.g. 24 Jul 2026, ৳1250 -> "2407261250". */
export function generatePriceCode(price: number, date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear() % 100).padStart(2, '0')
  return `${dd}${mm}${yy}${Math.round(price)}`
}
