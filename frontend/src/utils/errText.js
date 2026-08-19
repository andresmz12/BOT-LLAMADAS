// FastAPI validation errors put an array of {type, loc, msg, input} objects
// in `detail` instead of a string — rendering or alerting that directly
// shows "[object Object]" (or crashes React, if it lands in JSX). Always
// coerce to a display string first.
export function errText(detail, fallback) {
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map(d => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d))).join('; ')
  }
  if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return fallback
}
