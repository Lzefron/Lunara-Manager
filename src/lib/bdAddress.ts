import bdLocations from '../data/bdLocations.json'

interface Location {
  id: string
  name: string
  bn_name: string
}

const ALL_NAMES: string[] = [
  ...bdLocations.divisions.map((d: Location) => d.name),
  ...bdLocations.districts.map((d: Location) => d.name),
  ...bdLocations.upazilas.map((d: Location) => d.name),
  ...bdLocations.divisions.map((d: Location) => d.bn_name),
  ...bdLocations.districts.map((d: Location) => d.bn_name),
  ...bdLocations.upazilas.map((d: Location) => d.bn_name),
]
  .filter(Boolean)
  // Longest first so a match on "Dhaka" doesn't pre-empt a check for a
  // longer, more specific name that happens to contain it.
  .sort((a, b) => b.length - a.length)

/** True if `text` contains a recognized Bangladesh division/district/upazila name. */
export function containsKnownLocation(text: string): boolean {
  const lower = text.toLowerCase()
  return ALL_NAMES.some((name) => (/[a-z]/i.test(name) ? lower.includes(name.toLowerCase()) : text.includes(name)))
}
