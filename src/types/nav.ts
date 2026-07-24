export type Tab = 'products' | 'orders' | 'calculator' | 'replies' | 'dashboard'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'Products' },
  { id: 'orders', label: 'Orders' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'replies', label: 'Replies' },
  { id: 'dashboard', label: 'Dashboard' },
]
