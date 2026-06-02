import { useState, useEffect, useRef, useCallback } from 'react'

export function useWebSocket(campaignId) {
  const [lastMessage, setLastMessage] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)
  const retryRef = useRef(null)
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (!campaignId) return
    const token = localStorage.getItem('token') || ''
    if (!token) return
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')
    const url = `${base}/ws/${campaignId}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => { setIsConnected(true); retryCount.current = 0 }
    ws.onmessage = (e) => { try { setLastMessage(JSON.parse(e.data)) } catch {} }
    ws.onclose = (e) => {
      setIsConnected(false)
      if (e.code === 4001) return  // auth failure — don't retry
      const delay = Math.min(1000 * 2 ** retryCount.current, 30000)
      retryCount.current++
      retryRef.current = setTimeout(connect, delay)
    }
    ws.onerror = () => ws.close()
  }, [campaignId])

  useEffect(() => {
    connect()
    return () => { clearTimeout(retryRef.current); wsRef.current?.close() }
  }, [connect])

  return { lastMessage, isConnected }
}
