export const CHART_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: 'this_month', label: 'This month' },
]

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function formatDay(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getRangeWindow(range, now = new Date()) {
  const end = endOfDay(now)
  if (range === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: startOfDay(start), end }
  }
  if (range === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start: startOfDay(start), end: endOfDay(last) }
  }
  const days = Number(String(range || '7d').replace('d', '')) || 7
  const start = new Date(now)
  start.setDate(now.getDate() - (days - 1))
  return { start: startOfDay(start), end }
}

export function buildRangeBuckets(range, now = new Date()) {
  const { start, end } = getRangeWindow(range, now)
  const rows = []
  const cursor = new Date(start)
  while (cursor <= end) {
    rows.push({
      key: cursor.toISOString().slice(0, 10),
      label: formatDay(cursor),
      created: 0,
      resolved: 0,
      count: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return rows
}
