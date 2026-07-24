/**
 * Lightweight fuzzy match: scores `target` against `query` as a subsequence
 * match (chars of query must appear in order in target, not necessarily
 * contiguous), with bonuses for prefix/substring matches and consecutive
 * runs. Returns null when query is not a subsequence of target at all.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0

  let qi = 0
  let score = 0
  let consecutive = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      consecutive++
      score += 1 + consecutive
    } else {
      consecutive = 0
    }
  }
  if (qi < q.length) return null

  if (t.startsWith(q)) score += 15
  if (t.includes(q)) score += 8

  return score
}

export function fuzzySearch<T>(query: string, items: T[], getText: (item: T) => string): T[] {
  if (!query.trim()) return items
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter((s): s is { item: T; score: number } => s.score !== null)
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.item)
}
