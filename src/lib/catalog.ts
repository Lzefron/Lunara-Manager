import type { CatalogCategory } from '../types'

export const DEFAULT_CATEGORIES: CatalogCategory[] = [
  { name: 'Bags', subcategories: ['Shoulder bags', 'Crossbody bags', 'Handbags', 'Backpacks'] },
  { name: 'Clothes', subcategories: ['Tops', 'Dresses', 'Co-ords'] },
  { name: 'Cosmetics', subcategories: ['Makeup', 'Skincare', 'Beauty tools'] },
  { name: 'Shoes', subcategories: ['Flats', 'Heels', 'Sneakers'] },
  { name: 'Tote bags', subcategories: ['Canvas totes', 'Everyday totes'] },
]
