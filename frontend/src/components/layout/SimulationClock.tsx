import { useEffect, useState } from "react"
import { Pause, Play, FastForward } from "lucide-react"
import { getSimulationStatus, pauseSimulation, resumeSimulation, setSimulationSpeed, type SimulationStatus } from "@/lib/api"
import { formatDateTime } from "@/lib/utils"
import { useAuthStore } from "@/lib/auth"

const SPEED_STEPS = [1, 5, 15, 30, 60]
// Mirrors the backend's require_role(UserRole.admin) on the three
// /simulation/* routes (app/routers/live.py) — hiding the controls here is
// pure UX; the backend is what actually enforces this.
const CLOCK_CONTROL_ROLES = ["admin"]

/**
 * Polls backend simulation clock and exposes pause/resume/speed controls.
 * The simulation engine (Phase 3) advances simulation_time and live
 * telemetry on this same clock, so toggling it here affects every page.
 */
export function SimulationClock() {
  const [status, setStatus] = useState<SimulationStatus | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const canControl = !!role && CLOCK_CONTROL_ROLES.includes(role)

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      getSimulationStatus()
        .then((s) => {
          if (!cancelled) {
            setStatus(s)
            setError(false)
          }
        })
        .catch(() => !cancelled && setError(true))
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function togglePause() {
    if (!status || busy) return
    setBusy(true)
    try {
      const res = status.is_paused ? await resumeSimulation() : await pauseSimulation()
      setStatus((s) => (s ? { ...s, is_paused: res.is_paused } : s))
    } finally {
      setBusy(false)
    }
  }

  async function cycleSpeed() {
    if (!status || busy) return
    setBusy(true)
    try {
      const idx = SPEED_STEPS.indexOf(status.speed_multiplier)
      const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length] ?? SPEED_STEPS[0]
      const res = await setSimulationSpeed(next)
      setStatus((s) => (s ? { ...s, speed_multiplier: res.speed_multiplier } : s))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--app-border)" }}>
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
            error ? "bg-status-red" : "bg-status-green"
          }`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${error ? "bg-status-red" : "bg-status-green"}`} />
      </span>
      <div className="text-xs leading-tight">
        <p className="font-medium tabular-nums text-(--app-text)">
          {status ? formatDateTime(status.simulation_time) : error ? "Backend unreachable" : "Connecting…"}
        </p>
        <p className="text-(--app-text-muted)">
          {status ? `${status.is_paused ? "Paused" : "Running"} · ${status.speed_multiplier}×` : "Asia/Muscat"}
        </p>
      </div>
      {canControl && (
        <div className="ml-1 flex items-center gap-0.5 border-l pl-2" style={{ borderColor: "var(--app-border)" }}>
          <button
            onClick={togglePause}
            disabled={!status || busy}
            className="rounded p-1 text-(--app-text-muted) hover:bg-black/5 disabled:opacity-50"
            title={status?.is_paused ? "Resume simulation" : "Pause simulation"}
          >
            {status?.is_paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={cycleSpeed}
            disabled={!status || busy}
            className="rounded p-1 text-(--app-text-muted) hover:bg-black/5 disabled:opacity-50"
            title="Cycle simulation speed (1× / 5× / 15× / 30× / 60×)"
          >
            <FastForward className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
