const TZ = 'America/Chicago'

export const fmtDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-MX', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export const fmtDateShort = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-MX', {
    timeZone: TZ,
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
