const DEFAULT_LOCALE = "en-US"
const DEFAULT_CURRENCY = "USD"

/** Format a monetary amount using Intl APIs and fallback when Intl is unavailable. */
export function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0

  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount)
  } catch (err) {
    const rounded = safeAmount.toFixed(2)
    return `${currency.toUpperCase()} ${rounded}`
  }
}

export function formatNumber(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount)
  } catch (err) {
    return safeAmount.toFixed(2)
  }
}
