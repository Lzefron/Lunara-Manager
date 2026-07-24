export type OrderStatus = 'china' | 'shipped_bd' | 'steadfast' | 'delivered' | 'returned'

export type ProfitMode = 'percent' | 'fixed'

export interface Photo {
  id: string
  webp_blob: Blob
  thumb_blob: Blob
  phash: string
}

export interface Product {
  id: string
  created_at: string
  updated_at: string
  deleted: boolean
  trashed_at: string | null
  name: string
  sell_price: number
  cost_rmb: number
  weight_g: number
  colors: string[]
  available: boolean
  photos: Photo[]
  notes: string
  price_code: string
}

export interface Order {
  id: string
  created_at: string
  updated_at: string
  deleted: boolean
  trashed_at: string | null
  customer_name: string
  phone: string
  address: string
  product_ids: string[]
  total_price: number
  status: OrderStatus
  status_dates: Partial<Record<OrderStatus, string>>
  steadfast_tracking_id: string
  notes: string
}

export interface Settings {
  id: string
  created_at: string
  updated_at: string
  deleted: boolean
  rmb_to_bdt_rate: number
  shipping_rate_per_kg: number
  default_profit_mode: ProfitMode
  default_profit_value: number
}

export interface Reply {
  id: string
  created_at: string
  updated_at: string
  deleted: boolean
  trashed_at: string | null
  category: string
  title: string
  text: string
}

export interface SyncMeta {
  id: string
  last_synced_at: string | null
}

export const ORDER_STATUSES: OrderStatus[] = ['china', 'shipped_bd', 'steadfast', 'delivered', 'returned']

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  china: 'China',
  shipped_bd: 'Shipment (BD)',
  steadfast: 'Steadfast',
  delivered: 'Delivered',
  returned: 'Returned',
}
