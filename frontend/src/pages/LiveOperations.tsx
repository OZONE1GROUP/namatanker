import { useNavigate } from "react-router-dom"
import { Fuel, Truck, MapPin, LogOut, Radio, RadioOff } from "lucide-react"
import { useLiveSnapshot } from "@/lib/useLiveSnapshot"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { formatNumber, formatTime } from "@/lib/utils"

function ProgressBar({ pct, tone = "blue" }: { pct: number; tone?: "blue" | "green" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
      <div
        className={tone === "green" ? "h-full bg-status-green" : "h-full bg-teal-500"}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

export function LiveOperations() {
  const navigate = useNavigate()
  const { snapshot, connected } = useLiveSnapshot()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          Real-time (simulated) view of every active loading operation and in-transit delivery — regenerated every few seconds by the simulation engine, never from real equipment.
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--app-border)" }}>
          {connected ? <Radio className="h-3.5 w-3.5 text-status-green" /> : <RadioOff className="h-3.5 w-3.5 text-status-amber" />}
          {connected ? "Live stream connected" : "Polling (stream reconnecting…)"}
        </span>
      </div>

      {!snapshot ? (
        <Card className="p-8 text-center text-sm text-(--app-text-muted)">Connecting to the simulation engine…</Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Active Loading Bays ({snapshot.loading.length})</CardTitle></CardHeader>
            <CardContent>
              {snapshot.loading.length === 0 ? (
                <p className="text-sm text-(--app-text-muted)">No bays are actively filling right now.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {snapshot.loading.map((l) => (
                    <div
                      key={l.order_id}
                      onClick={() => navigate(`/orders/${l.order_id}`)}
                      className="cursor-pointer rounded-xl border p-3.5 transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-(--app-text)">
                          <Fuel className="h-3.5 w-3.5 text-teal-500" /> {l.station_name} · {l.bay_code ?? "—"}
                        </span>
                        {l.ready_to_complete && (
                          <span className="rounded-full bg-status-green-bg px-2 py-0.5 text-[11px] font-medium text-status-green">Ready</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-(--app-text-muted)">{l.order_number} · {l.tanker_code} · {l.product.replace(/_/g, " ")}</p>
                      <div className="mt-3">
                        <ProgressBar pct={l.progress_pct} tone={l.ready_to_complete ? "green" : "blue"} />
                        <div className="mt-1.5 flex items-center justify-between text-xs text-(--app-text-muted)">
                          <span className="font-medium tabular-nums text-(--app-text)">
                            {formatNumber(l.live_volume_l)} / {formatNumber(l.target_volume_l)} L
                          </span>
                          <span>{l.flow_rate_l_min.toFixed(0)} L/min</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tankers In Transit ({snapshot.transit.length})</CardTitle></CardHeader>
            <CardContent>
              {snapshot.transit.length === 0 ? (
                <p className="text-sm text-(--app-text-muted)">No tankers are currently in transit.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {snapshot.transit.map((t) => (
                    <div
                      key={t.order_id}
                      onClick={() => navigate(`/orders/${t.order_id}`)}
                      className="cursor-pointer rounded-xl border p-3.5 transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-(--app-text)">
                        <Truck className="h-3.5 w-3.5 text-blue-500" /> {t.tanker_code}
                      </span>
                      <p className="mt-0.5 text-xs text-(--app-text-muted)">{t.order_number} · from {t.station_name}</p>
                      <div className="mt-3">
                        <ProgressBar pct={t.progress_pct} />
                        <div className="mt-1.5 flex items-center justify-between text-xs text-(--app-text-muted)">
                          <span>{t.progress_pct.toFixed(0)}% of route</span>
                          <span>ETA {t.eta_minutes.toFixed(0)} min</span>
                        </div>
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-(--app-text-muted)">
                          <MapPin className="h-3 w-3" /> {t.lat.toFixed(4)}, {t.lon.toFixed(4)} (simulated GPS)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Geofence Events</CardTitle></CardHeader>
            <CardContent>
              {snapshot.geofence_events.length === 0 ? (
                <p className="text-sm text-(--app-text-muted)">No geofence events yet this session.</p>
              ) : (
                <ul className="space-y-1.5">
                  {[...snapshot.geofence_events].reverse().map((e) => (
                    <li key={e.id + e.timestamp} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-(--app-text)">
                        <LogOut className={`h-3.5 w-3.5 ${e.kind === "arrival" ? "rotate-180 text-status-green" : "text-status-amber"}`} />
                        {e.tanker_code} {e.kind === "arrival" ? "arrived at" : "departed"} {e.zone_name}
                        <span className="text-(--app-text-muted)"> · {e.order_number}</span>
                      </span>
                      <span className="text-xs text-(--app-text-muted)">{formatTime(e.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
