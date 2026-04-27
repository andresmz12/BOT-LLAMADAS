const TZ = 'America/Bogota'

// Python returns naive UTC datetimes without 'Z'; append it so JS parses as UTC
const toUTC = (value) => {
  if (!value) return null
  const s = String(value)
  return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z')
}

export const fmtDate = (value) => {
  const d = toUTC(value)
  if (!d || isNaN(d)) return '—'
  return d.toLocaleString('es-MX', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export const fmtDateShort = (value) => {
  const d = toUTC(value)
  if (!d || isNaN(d)) return '—'
  return d.toLocaleString('es-MX', {
    timeZone: TZ,
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
