// Pure formatting & small date/number helpers. No DOM, no Supabase.

export function round(n, decimals = 2) {
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}

export function sum(arr, key) {
  return (arr || []).reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, lastDay))
  return t
}

export function todayStr(today = new Date()) {
  return today.toISOString().slice(0, 10)
}

// Escape user-provided strings before embedding in innerHTML.
// Guards against XSS via notes/description/etc. stored in the DB.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )
}

// Money for display: fmtMoney(1234.5) → "€1,234.50". Null-safe → "—".
export function fmtMoney(n, { decimals = 2, symbol = '€' } = {}) {
  const v = Number(n)
  if (n == null || !Number.isFinite(v)) return '—'
  return symbol + v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Plain number for display with fixed decimals. Null-safe → "—".
export function fmtNum(n, decimals = 1) {
  const v = Number(n)
  if (n == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Kilometres: fmtKm(84212) → "84,212 km". Null-safe → "—".
export function fmtKm(n) {
  const v = Number(n)
  if (n == null || !Number.isFinite(v)) return '—'
  return Math.round(v).toLocaleString('en-US') + ' km'
}
