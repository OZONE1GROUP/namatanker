import { useNavigate } from "react-router-dom"
import { Truck, MapPin, LogOut } from "lucide-react"
import { useLiveSnapshot } from "@/lib/useLiveSnapshot"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { formatTime } from "@/lib/utils"

export function Gps() {
  const navigate = useNavigate()
  const { snapshot, connected } = useLiveSnapshot()

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--app-text-muted)">
        GPS &amp; geofencing simulator — SIMULATION MODE. Tanker positions are interpolated along a simulated route between the loading station and a synthetic delivery point; no real GPS hardware is involved.
      </p>

      {!snapshot ? (
        <Card className="p-8 text-center text-sm text-(--app-text-muted)">
          {connected ? "Connecting…" : "Connecting to the simulation engine…"}
        </Card>
      ) : snapshot.transit.length === 0 ? (
        <Card className="p-10 text-center text-sm text-(--app-text-muted)">No tankers are currently in transit.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {snapshot.transit.map((t) => (
            <Card key={t.order_id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-(--app-text)">
                  <Truck className="h-4 w-4 text-blue-500" /> {t.tanker_code}
                </span>
                <button
                  onClick={() => navigate(`/orders/${t.order_id}`)}
                  className="text-xs text-teal-600 hover:underline"
                >
                  {t.order_number}
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-(--app-text-muted)">
                <span className="shrink-0">{t.station_name}</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${t.progress_pct}%` }} />
                  <div
                    className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-(--app-surface) bg-blue-500"
                    style={{ left: `${t.progress_pct}%` }}
                  />
                </div>
                <span className="shrink-0">Delivery zone</span>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-(--app-text-muted)">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.lat.toFixed(4)}, {t.lon.toFixed(4)}</span>
                <span>ETA {t.eta_minutes.toFixed(0)} min · {t.progress_pct.toFixed(0)}% complete</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Geofence Event Log</CardTitle></CardHeader>
        <CardContent>
          {!snapshot || snapshot.geofence_events.length === 0 ? (
            <p className="text-sm text-(--app-text-muted)">No geofence events logged yet this session.</p>
          ) : (
            <ul className="space-y-2">
              {[...snapshot.geofence_events].reverse().map((e) => (
                <li key={e.id + e.timestamp} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                  <span className="flex items-center gap-2 text-(--app-text)">
                    <LogOut className={`h-3.5 w-3.5 ${e.kind === "arrival" ? "rotate-180 text-status-green" : "text-status-amber"}`} />
                    <span className="font-medium">{e.tanker_code}</span>
                    {e.kind === "arrival" ? "entered" : "exited"} geofence: {e.zone_name}
                    <span className="text-(--app-text-muted)">({e.order_number})</span>
                  </span>
                  <span className="text-xs text-(--app-text-muted)">{formatTime(e.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
