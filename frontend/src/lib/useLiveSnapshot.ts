import { useEffect, useRef, useState } from "react"
import { getLiveSnapshot, type LiveSnapshot } from "@/lib/api"

const POLL_INTERVAL_MS = 3000

/**
 * Subscribes to the backend's SSE live-telemetry stream (SIMULATION MODE —
 * synthetic loading/transit/GPS telemetry only), falling back to polling
 * the REST snapshot if EventSource is unavailable or the stream drops.
 */
export function useLiveSnapshot() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let es: EventSource | null = null

    function stopPolling() {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    function startPolling() {
      if (pollRef.current != null) return
      const poll = () => {
        getLiveSnapshot()
          .then((s) => !cancelled && setSnapshot(s))
          .catch(() => {})
      }
      poll()
      pollRef.current = window.setInterval(poll, POLL_INTERVAL_MS)
    }

    try {
      es = new EventSource("/api/stream/live")
      es.onmessage = (ev) => {
        if (cancelled) return
        try {
          setSnapshot(JSON.parse(ev.data) as LiveSnapshot)
          setConnected(true)
          stopPolling()
        } catch {
          // ignore malformed frame
        }
      }
      es.onerror = () => {
        if (cancelled) return
        setConnected(false)
        startPolling()
      }
    } catch {
      startPolling()
    }

    return () => {
      cancelled = true
      es?.close()
      stopPolling()
    }
  }, [])

  return { snapshot, connected }
}
