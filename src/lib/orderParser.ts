import { extractPhone } from './bdPhone'
import { containsKnownLocation } from './bdAddress'

export interface ParsedOrder {
  name: string
  phone: string
  address: string
}

function stripLabel(line: string, labels: string[]): string {
  const pattern = new RegExp(`^\\s*(${labels.join('|')})\\s*[:\\-]\\s*`, 'i')
  return line.replace(pattern, '').trim()
}

function isMostlyDigits(line: string): boolean {
  const digits = line.replace(/[^\d]/g, '')
  return digits.length >= 6 && digits.length / line.length > 0.6
}

function fromParts(parts: string[]): ParsedOrder {
  const phone = extractPhone(parts.join(' ')) ?? ''

  const addressStart = parts.findIndex((p) => containsKnownLocation(p))
  // Once the address starts, everything after it (commas and all) is taken
  // to still be part of the address rather than separate fields — a single
  // pasted line like "Name, phone, Area, District" would otherwise get
  // fragmented into just "Area", silently dropping ", District".
  const addressLine = addressStart >= 0 ? parts.slice(addressStart).join(', ').trim() : null

  const candidateParts = addressStart >= 0 ? parts.slice(0, addressStart) : parts
  const phoneLine = candidateParts.find((p) => isMostlyDigits(p) && extractPhone(p) !== null) ?? null
  const nameLine = candidateParts.find((p) => p !== phoneLine && !isMostlyDigits(p)) ?? null

  return {
    name: nameLine ? stripLabel(nameLine, ['name', 'customer', 'customer name']) : '',
    phone,
    address: addressLine ? stripLabel(addressLine, ['address', 'location', 'addr']) : '',
  }
}

/**
 * Parses a raw pasted customer message into name/phone/address. Never
 * throws and never guesses wildly — any field it can't confidently identify
 * is left blank for the user to fill in manually in the confirmation form.
 */
export function parseOrderMessage(raw: string): ParsedOrder {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  // Genuine multi-line paste (name/phone/address each on their own line,
  // the common Messenger pattern): one line per field, picked directly.
  if (lines.length > 1) return fromParts(lines)

  // Single-line paste: fall back to comma/semicolon-separated parts so a
  // "Name, phone, Area, District" line doesn't get treated as one field.
  const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return fromParts(parts.length > 1 ? parts : lines)
}
