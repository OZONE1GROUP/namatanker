import { useState } from "react"
import { WifiOff, Wifi, RotateCw, Clock, Database } from "lucide-react"
import { useLiveSnapshot } from "@/lib/useLiveSnapshot"
import { disconnectStation, reconnectStation, ApiError } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime } from "@/lib/utils"
import { useAuthStore } from "@/lib/auth"

// Mirrors the backend's require_role(fleet_manager, admin) on
// POST /stations/{id}/disconnect and /reconnect (app/routers/stations.py).
const FLEET_ROLES = ["fleet_manager", "admin"]

export function EdgeGateway() {
  const { snapshot, connected } = useLiveSnapshot()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const role = useAuthStore((s) => s.user?.role)
  const canControl = !!role && FLEET_ROLES.includes(role)

  async function toggle(stationId: string, isOffline: boolean) {
    setBusyId(stationId)
    setErrors((e) => ({ ...e, [stationId]: "" }))
    try {
      const res = isOffline ? await reconnectStation(stationId) : await disconnectStation(stationId)
      setMessages((m) => ({ ...m, [stationId]: res.message }))
    } catch (e) {
      setErrors((er) => ({ ...er, [stationId]: e instanceof ApiError ? e.message : "Action failed" }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-(--app-text-muted)">
          <strong className="text-(--app-text)">Offline recovery demonstration — SIMULATION MODE.</strong>{" "}
          Disconnect a station to simulate its edge gateway losing its WAN link. The station's PLC/meter keeps metering
          locally and queues every reading instead of forwarding it — exactly how a real store-and-forward edge gateway
          behaves during an outage. Reconnect to watch it flush the backlog and resume live reporting.
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--app-border)" }}>
          {connected ? "Live stream connected" : "Polling (stream reconnecting…)"}
        </span>
      </Card>

      {!snapshot ? (
        <Card className="p-8 text-center text-sm text-(--app-text-muted)">Connecting to the simulation engine…</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.stations.map((s) => {
            const isOffline = s.connectivity_status === "offline"
            return (
              <Card key={s.station_id}>
                <CardHeader>
                  <CardTitle>{s.station_name}</CardTitle>
                  <StatusBadge tone={statusTone(s.connectivity_status)} label={prettyStatus(s.connectivity_status)} />
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 text-xs text-(--app-text-muted)">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Last heartbeat</span>
                      <span className="font-medium text-(--app-text)">
                        {s.last_heartbeat ? formatDateTime(s.last_heartbeat) : "No signal"}
                        {isOffline && " (frozen)"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Queued readings</span>
                      <span className={`font-medium tabular-nums ${s.queued_event_count > 0 ? "text-status-amber" : "text-(--app-text)"}`}>
                        {s.queued_event_count}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    {!canControl ? (
                      <p className="rounded-lg border px-3 py-2 text-center text-xs text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                        Connectivity controls require the Fleet Manager or Admin role.
                      </p>
                    ) : isOffline ? (
                      <Button variant="primary" loading={busyId === s.station_id} onClick={() => toggle(s.station_id, true)} className="w-full">
                        <RotateCw className="h-4 w-4" /> Reconnect &amp; Sync
                      </Button>
                    ) : (
                      <Button variant="secondary" loading={busyId === s.station_id} onClick={() => toggle(s.station_id, false)} className="w-full">
                        <WifiOff className="h-4 w-4" /> Simulate Disconnect
                      </Button>
                    )}
                  </div>

                  {messages[s.station_id] && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-status-green">
                      <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {messages[s.station_id]}
                    </p>
                  )}
                  {errors[s.station_id] && <p className="mt-2 text-xs text-status-red">{errors[s.station_id]}</p>}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
