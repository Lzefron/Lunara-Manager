import type { Tab } from '../types/nav'
import { TABS } from '../types/nav'
import { ProductsIcon, OrdersIcon, CalculatorIcon, RepliesIcon, DashboardIcon } from './icons'

const ICONS: Record<Tab, (props: { className?: string }) => React.JSX.Element> = {
  products: ProductsIcon,
  orders: OrdersIcon,
  calculator: CalculatorIcon,
  replies: RepliesIcon,
  dashboard: DashboardIcon,
}

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] dark:border-neutral-800 dark:bg-neutral-950/95"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => {
          const Icon = ICONS[tab.id]
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                isActive
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-neutral-500 dark:text-neutral-500'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
