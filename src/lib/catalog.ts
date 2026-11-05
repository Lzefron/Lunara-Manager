import type { CatalogCategory } from '../types'
import defaults from '../catalogCategories.json'
export const DEFAULT_CATEGORIES: CatalogCategory[] = defaults
// Keep custom departments and legacy product assignments while expanding defaults.
export function normalizeCategory(name: string) { return name === 'Tote bags' ? 'Bags' : name }
export function mergeCategories(defaults: CatalogCategory[], saved: CatalogCategory[] = [], products: {category?: string; subcategory?: string}[] = []) {
  const result: CatalogCategory[] = []
  const add = (name: string | undefined, subs: (string | undefined)[]) => {
    name = normalizeCategory(name ?? '')
    if (!name) return
    let category = result.find(c => c.name.toLowerCase() === name!.toLowerCase())
    if (!category) { category = { name, subcategories: [] }; result.push(category) }
    for (const sub of subs) if (sub && !category.subcategories.some(s => s.toLowerCase() === sub.toLowerCase())) category.subcategories.push(sub)
  }
  for (const c of [...defaults, ...saved]) add(c.name, c.subcategories)
  for (const p of products) add(p.category, [p.subcategory])
  return result
}
