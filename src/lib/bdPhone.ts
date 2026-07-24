/**
 * Extracts a Bangladeshi mobile number from free text. Accepts
 * `+8801XXXXXXXXX`, `8801XXXXXXXXX`, `01XXXXXXXXX`, tolerating spaces and
 * dashes between digits. Valid operator prefixes are 013-019. Returns the
 * number normalized to local `01XXXXXXXXX` format, or null if none found.
 */
export function extractPhone(text: string): string | null {
  const candidates = text.match(/\+?\d[\d\s-]{7,17}\d/g) ?? []
  for (const candidate of candidates) {
    const digits = candidate.replace(/[\s-]/g, '')
    const match = digits.match(/^(\+?880|0)(1[3-9]\d{8})$/)
    if (match) return `0${match[2]}`
  }
  return null
}
