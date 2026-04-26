export function exportToCsv(filename, rows, columns) {
  if (!rows.length) return
  const header = columns.map(c => `"${c.label}"`).join(',')
  const body = rows.map(row =>
    columns.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const csv = [header, ...body].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
