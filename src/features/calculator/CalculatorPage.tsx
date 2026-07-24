import { useEffect, useMemo, useRef, useState } from 'react'
import { db, SETTINGS_ID, nowIso } from '../../db/db'
import type { ProfitMode } from '../../types'
import { generatePriceCode } from '../../lib/pricing'
import { ProductForm } from '../products/ProductForm'
import { errorMessage, showToast } from '../../lib/toast'

const DEFAULT_RATE = '16.5'
const DEFAULT_SHIPPING = '900'
const DEFAULT_PROFIT_MODE: ProfitMode = 'percent'
const DEFAULT_PROFIT_VALUE = '30'

export function CalculatorPage() {
  const [rateInput, setRateInput] = useState('')
  const [shippingInput, setShippingInput] = useState('')
  const [costRmb, setCostRmb] = useState('')
  const [weightG, setWeightG] = useState('')
  const [profitMode, setProfitMode] = useState<ProfitMode>('percent')
  const [profitValue, setProfitValue] = useState('')
  const [sellPriceOverride, setSellPriceOverride] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)

  // Load once directly from Dexie (not a live query — we need an
  // unambiguous "does a row exist yet" answer, which useLiveQuery can't
  // give on its first, still-resolving render). If no row exists (e.g. a
  // fresh or just-recovered device that hasn't synced yet), the inputs are
  // pre-filled with sensible defaults for *display*, but nothing is
  // persisted until the user actually edits something — see `userEdited`
  // below and CLAUDE.md "Wiped-device recovery" for why that distinction
  // matters (a row auto-created just from opening this tab would get a
  // fresh `updated_at` and could beat real synced settings in last-write-wins).
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [userEdited, setUserEdited] = useState(false)
  const createdAtRef = useRef<string | null>(null)

  useEffect(() => {
    db.settings.get(SETTINGS_ID).then((existing) => {
      if (existing) {
        createdAtRef.current = existing.created_at
        setRateInput(String(existing.rmb_to_bdt_rate))
        setShippingInput(String(existing.shipping_rate_per_kg))
        setProfitMode(existing.default_profit_mode)
        setProfitValue(String(existing.default_profit_value))
      } else {
        setRateInput(DEFAULT_RATE)
        setShippingInput(DEFAULT_SHIPPING)
        setProfitMode(DEFAULT_PROFIT_MODE)
        setProfitValue(DEFAULT_PROFIT_VALUE)
      }
      setSettingsLoaded(true)
    })
  }, [])

  // Persist settings edits, debounced — only once the user has actually
  // changed something, never from the initial load/pre-fill above.
  useEffect(() => {
    if (!settingsLoaded || !userEdited) return
    const rate = Number(rateInput)
    const shipping = Number(shippingInput)
    if (Number.isNaN(rate) || Number.isNaN(shipping)) return
    const timer = setTimeout(() => {
      const ts = nowIso()
      db.settings
        .put({
          id: SETTINGS_ID,
          created_at: createdAtRef.current ?? ts,
          updated_at: ts,
          deleted: false,
          rmb_to_bdt_rate: rate,
          shipping_rate_per_kg: shipping,
          default_profit_mode: profitMode,
          default_profit_value: Number(profitValue) || 0,
        })
        .then(() => {
          createdAtRef.current = createdAtRef.current ?? ts
        })
        .catch((err) => showToast(errorMessage(err, 'Could not save settings.')))
    }, 400)
    return () => clearTimeout(timer)
  }, [rateInput, shippingInput, profitMode, profitValue, settingsLoaded, userEdited])

  function editRate(value: string) {
    setUserEdited(true)
    setRateInput(value)
  }
  function editShipping(value: string) {
    setUserEdited(true)
    setShippingInput(value)
  }
  function editProfitMode(mode: ProfitMode) {
    setUserEdited(true)
    setProfitMode(mode)
  }
  function editProfitValue(value: string) {
    setUserEdited(true)
    setProfitValue(value)
  }

  const calc = useMemo(() => {
    const rate = Number(rateInput) || 0
    const shippingRate = Number(shippingInput) || 0
    const cost = Number(costRmb) || 0
    const weight = Number(weightG) || 0
    const profit = Number(profitValue) || 0

    const costBdt = cost * rate
    const shipping = (weight / 1000) * shippingRate
    const totalCost = costBdt + shipping
    const suggestedPrice = profitMode === 'percent' ? totalCost * (1 + profit / 100) : totalCost + profit

    const sellPrice = sellPriceOverride !== null && sellPriceOverride !== '' ? Number(sellPriceOverride) : suggestedPrice
    const profitAmount = sellPrice - totalCost
    const profitPercent = totalCost > 0 ? (profitAmount / totalCost) * 100 : 0

    return { costBdt, shipping, totalCost, suggestedPrice, sellPrice, profitAmount, profitPercent }
  }, [rateInput, shippingInput, costRmb, weightG, profitMode, profitValue, sellPriceOverride])

  const priceCode = Number.isFinite(calc.sellPrice) ? generatePriceCode(calc.sellPrice) : ''
  const isOverridden = sellPriceOverride !== null && sellPriceOverride !== '' && Math.round(Number(sellPriceOverride)) !== Math.round(calc.suggestedPrice)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(priceCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      showToast(errorMessage(err, 'Could not copy to clipboard.'))
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">Calculator</h1>

      {!settingsLoaded ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">RMB → BDT rate</span>
              <input
                type="number"
                value={rateInput}
                onChange={(e) => editRate(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">Shipping ৳/kg</span>
              <input
                type="number"
                value={shippingInput}
                onChange={(e) => editShipping(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Cost (RMB)</span>
              <input
                type="number"
                value={costRmb}
                onChange={(e) => setCostRmb(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Weight (g)</span>
              <input
                type="number"
                value={weightG}
                onChange={(e) => setWeightG(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          </section>

          <section>
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Profit</span>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => editProfitMode('percent')}
                  className={`rounded-md px-3 py-1 text-sm ${profitMode === 'percent' ? 'bg-violet-600 text-white' : 'text-neutral-600 dark:text-neutral-300'}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => editProfitMode('fixed')}
                  className={`rounded-md px-3 py-1 text-sm ${profitMode === 'fixed' ? 'bg-violet-600 text-white' : 'text-neutral-600 dark:text-neutral-300'}`}
                >
                  ৳
                </button>
              </div>
              <input
                type="number"
                value={profitValue}
                onChange={(e) => editProfitValue(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </section>

          <section className="space-y-1.5 rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
            <Row label="Cost (BDT)" value={`৳${calc.costBdt.toFixed(2)}`} />
            <Row label="Shipping" value={`৳${calc.shipping.toFixed(2)}`} />
            <Row label="Total cost" value={`৳${calc.totalCost.toFixed(2)}`} bold />
          </section>

          <section>
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Sell price {isOverridden && <span className="font-normal text-neutral-400">(suggested ৳{calc.suggestedPrice.toFixed(2)})</span>}
            </span>
            <input
              type="number"
              value={sellPriceOverride ?? Math.round(calc.suggestedPrice * 100) / 100}
              onChange={(e) => setSellPriceOverride(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-lg font-semibold dark:border-neutral-700 dark:bg-neutral-800"
            />
            {isOverridden && (
              <button type="button" onClick={() => setSellPriceOverride(null)} className="mt-1 text-xs text-violet-600 dark:text-violet-400">
                Use suggested price
              </button>
            )}
          </section>

          <section className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div>
              <p className="text-xs text-neutral-500">Profit</p>
              <p
                className={`text-lg font-semibold ${calc.profitAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              >
                ৳{calc.profitAmount.toFixed(2)} ({calc.profitPercent.toFixed(1)}%)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="rounded-full bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white"
            >
              Save as product
            </button>
          </section>

          <section className="flex items-center gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex-1">
              <p className="text-xs text-neutral-500">Price code</p>
              <p className="font-mono text-base text-neutral-900 dark:text-neutral-100">{priceCode}</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </section>
        </div>
      )}

      {showSaveForm && (
        <ProductForm
          product={null}
          prefill={{ cost_rmb: Number(costRmb) || 0, weight_g: Number(weightG) || 0, sell_price: Math.round(calc.sellPrice * 100) / 100 }}
          onClose={() => setShowSaveForm(false)}
          onSaved={() => setShowSaveForm(false)}
        />
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={bold ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}>{value}</span>
    </div>
  )
}
